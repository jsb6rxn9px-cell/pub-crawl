// ============================================================
// SERVER.JS — Pub Crawl App Backend
// Express + Socket.IO + JSON file storage
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const DATA = require('./data');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 50e6, // 50 MB for socket
  pingTimeout: 60000,
  pingInterval: 25000,
});

const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const STATE_FILE = path.join(__dirname, 'state.json');

// Ensure uploads dir
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ============================================================
// MULTER — File upload config
// ============================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|mp4|mov|avi|webm|heic|heif|3gp/i;
    const ext = path.extname(file.originalname).replace('.', '');
    const mime = file.mimetype;
    if (allowed.test(ext) || mime.startsWith('image/') || mime.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non supporté'));
    }
  },
});

// ============================================================
// IN-MEMORY STATE
// ============================================================
let state = {
  teams: DATA.teams,
  players: DATA.players,
  challenges: DATA.challenges,
  // submissions: { challengeId_teamId: [{ id, playerId, playerName, filename, mediaType, timestamp }] }
  submissions: {},
  // validatedChallenges: { challengeId_teamId: true }
  validatedChallenges: {},
  // manualPoints: { teamId: number } — admin can add/remove bonus points
  manualPoints: {},
  // kahoot state
  kahoot: {
    active: false,
    phase: 'idle',         // idle | question | answer_reveal | results
    currentQuestionIdx: -1,
    questions: DATA.kahootQuestions,
    answers: {},           // { playerId: { questionId: { answer, time } } }
    questionStartTime: 0,
    results: null,
  },
  // poem state
  poem: {
    active: false,
    phase: 'idle',         // idle | voting | results
    votes: {},             // { playerId: teamId }
    results: null,
  },
  // locations: { teamId: { lat, lng, timestamp, playerName } }
  locations: {},
  // Active connections
  onlinePlayers: {},       // { playerId: socketId }
};

// Load persisted state if exists
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      // Merge — keep config from data.js, load dynamic data from saved
      state.submissions = saved.submissions || {};
      state.validatedChallenges = saved.validatedChallenges || {};
      state.manualPoints = saved.manualPoints || {};
      state.kahoot.answers = saved.kahootAnswers || {};
      state.kahoot.results = saved.kahootResults || null;
      state.poem.votes = saved.poemVotes || {};
      state.poem.results = saved.poemResults || null;
      state.locations = saved.locations || {};
      console.log('✅ État restauré depuis state.json');
    }
  } catch (e) {
    console.log('⚠️  Pas d\'état sauvegardé, démarrage frais');
  }
}

function saveState() {
  try {
    const toSave = {
      submissions: state.submissions,
      validatedChallenges: state.validatedChallenges,
      manualPoints: state.manualPoints,
      kahootAnswers: state.kahoot.answers,
      kahootResults: state.kahoot.results,
      poemVotes: state.poem.votes,
      poemResults: state.poem.results,
      locations: state.locations,
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(toSave, null, 2));
  } catch (e) {
    console.error('Erreur sauvegarde état:', e);
  }
}

// Auto-save every 10 seconds
setInterval(saveState, 10000);
loadState();

// ============================================================
// SCORING LOGIC
// ============================================================
function computeScores() {
  const scores = {};
  state.teams.forEach(t => { scores[t.id] = { total: 0, byChallenges: {} }; });

  // Points from validated challenges
  for (const key of Object.keys(state.validatedChallenges)) {
    if (!state.validatedChallenges[key]) continue;
    const [challengeId, teamId] = key.split('_');
    const ch = state.challenges.find(c => c.id === challengeId);
    if (ch && scores[teamId]) {
      scores[teamId].byChallenges[challengeId] = ch.points;
      scores[teamId].total += ch.points;
    }
  }

  // Kahoot results
  if (state.kahoot.results) {
    const kr = state.kahoot.results;
    if (kr.teamRanking) {
      kr.teamRanking.forEach((entry, idx) => {
        const rank = idx + 1;
        const pts = DATA.kahootScoring.teamPoints[rank] || 0;
        if (scores[entry.teamId]) {
          scores[entry.teamId].byChallenges[DATA.kahootScoring.challengeId] = pts;
          scores[entry.teamId].total += pts;
        }
      });
    }
  }

  // Poem results
  if (state.poem.results) {
    const pr = state.poem.results;
    if (pr.ranking) {
      pr.ranking.forEach((entry, idx) => {
        const rank = idx + 1;
        let pts = 0;
        if (rank === 1) pts = DATA.poemConfig.pointsForWinner;
        else if (rank === 2) pts = DATA.poemConfig.pointsFor2nd;
        else if (rank === 3) pts = DATA.poemConfig.pointsFor3rd;
        if (scores[entry.teamId]) {
          scores[entry.teamId].byChallenges[DATA.poemConfig.challengeId] = pts;
          scores[entry.teamId].total += pts;
        }
      });
    }
  }

  // Manual bonus points
  for (const [teamId, pts] of Object.entries(state.manualPoints)) {
    if (scores[teamId]) {
      scores[teamId].total += pts;
      scores[teamId].byChallenges['bonus'] = pts;
    }
  }

  return scores;
}

// ============================================================
// EXPRESS MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// ============================================================
// REST API
// ============================================================

// Get initial app data
app.get('/api/init', (req, res) => {
  res.json({
    teams: state.teams,
    players: state.players.map(p => ({ id: p.id, name: p.name, teamId: p.teamId, isAdmin: !!p.isAdmin })),
    challenges: state.challenges,
    submissions: state.submissions,
    validatedChallenges: state.validatedChallenges,
    scores: computeScores(),
    locations: state.locations,
    manualPoints: state.manualPoints,
    kahoot: {
      active: state.kahoot.active,
      phase: state.kahoot.phase,
      currentQuestionIdx: state.kahoot.currentQuestionIdx,
      results: state.kahoot.results,
    },
    poem: {
      active: state.poem.active,
      phase: state.poem.phase,
      results: state.poem.results,
      voteCount: Object.keys(state.poem.votes).length,
    },
  });
});

// Upload proof
app.post('/api/upload', upload.single('media'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });

    const { challengeId, teamId, playerId } = req.body;
    if (!challengeId || !teamId || !playerId) {
      return res.status(400).json({ error: 'Données manquantes' });
    }

    const key = `${challengeId}_${teamId}`;
    if (!state.submissions[key]) state.submissions[key] = [];

    const isVideo = req.file.mimetype.startsWith('video/');
    const submission = {
      id: uuidv4(),
      playerId,
      playerName: state.players.find(p => p.id === playerId)?.name || 'Inconnu',
      filename: req.file.filename,
      mediaType: isVideo ? 'video' : 'image',
      timestamp: Date.now(),
    };

    state.submissions[key].push(submission);
    saveState();

    // Broadcast update
    io.emit('submission:new', { key, submission, scores: computeScores() });
    res.json({ success: true, submission });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Erreur upload' });
  }
});

// Multer error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Fichier trop volumineux (max 100 MB)' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(500).json({ error: err.message });
  next();
});

// ============================================================
// SOCKET.IO — Real-time
// ============================================================
io.on('connection', (socket) => {
  console.log(`🔌 Connexion: ${socket.id}`);

  // Player login
  socket.on('player:login', (playerId) => {
    state.onlinePlayers[playerId] = socket.id;
    socket.playerId = playerId;
    const player = state.players.find(p => p.id === playerId);
    if (player) {
      socket.join(`team:${player.teamId}`);
      console.log(`👤 ${player.name} connecté (${player.teamId})`);
    }
    io.emit('players:online', Object.keys(state.onlinePlayers));
  });

  // Location update
  socket.on('location:update', ({ playerId, lat, lng }) => {
    const player = state.players.find(p => p.id === playerId);
    if (!player) return;
    state.locations[player.teamId] = {
      lat, lng,
      timestamp: Date.now(),
      playerName: player.name,
    };
    io.emit('locations:update', state.locations);
  });

  // === ADMIN ACTIONS ===

  // Validate a challenge for a team
  socket.on('admin:validate', ({ challengeId, teamId, validated }) => {
    const player = state.players.find(p => p.id === socket.playerId);
    if (!player?.isAdmin) return;
    const key = `${challengeId}_${teamId}`;
    state.validatedChallenges[key] = validated;
    saveState();
    io.emit('validation:update', {
      validatedChallenges: state.validatedChallenges,
      scores: computeScores(),
    });
  });

  // Manual points
  socket.on('admin:manualPoints', ({ teamId, points }) => {
    const player = state.players.find(p => p.id === socket.playerId);
    if (!player?.isAdmin) return;
    state.manualPoints[teamId] = (state.manualPoints[teamId] || 0) + points;
    saveState();
    io.emit('scores:update', computeScores());
  });

  // === KAHOOT ===
  // Phases: idle → question → answer_reveal → leaderboard → (loop) → final_results

  socket.on('admin:kahoot:start', () => {
    const player = state.players.find(p => p.id === socket.playerId);
    if (!player?.isAdmin) return;
    state.kahoot.active = true;
    state.kahoot.phase = 'idle';
    state.kahoot.currentQuestionIdx = -1;
    state.kahoot.answers = {};
    state.kahoot.results = null;
    if (state.kahoot._timer) clearTimeout(state.kahoot._timer);
    if (state.kahoot._leaderboardTimer) clearTimeout(state.kahoot._leaderboardTimer);
    saveState();
    io.emit('kahoot:started');
    console.log('🎮 Kahoot démarré');
  });

  socket.on('admin:kahoot:nextQuestion', () => {
    const player = state.players.find(p => p.id === socket.playerId);
    if (!player?.isAdmin) return;
    // Only allow advancing from idle or leaderboard phase
    if (state.kahoot.phase !== 'idle' && state.kahoot.phase !== 'leaderboard') return;

    const nextIdx = state.kahoot.currentQuestionIdx + 1;
    if (nextIdx >= state.kahoot.questions.length) {
      // All questions done — show final results
      _computeKahootResults();
      state.kahoot.phase = 'final_results';
      state.kahoot.active = false;
      saveState();
      io.emit('kahoot:finalResults', state.kahoot.results);
      io.emit('scores:update', computeScores());
      console.log('🎮 Kahoot terminé — résultats finaux envoyés');
      return;
    }

    _sendKahootQuestion(nextIdx);
  });

  socket.on('admin:kahoot:end', () => {
    const player = state.players.find(p => p.id === socket.playerId);
    if (!player?.isAdmin) return;
    if (state.kahoot._timer) clearTimeout(state.kahoot._timer);
    if (state.kahoot._leaderboardTimer) clearTimeout(state.kahoot._leaderboardTimer);
    state.kahoot.active = false;
    state.kahoot.phase = 'idle';
    saveState();
    io.emit('kahoot:ended');
    console.log('🎮 Kahoot annulé par admin');
  });

  socket.on('kahoot:answer', ({ questionId, answer }) => {
    if (!state.kahoot.active || state.kahoot.phase !== 'question') return;
    const pid = socket.playerId;
    if (!pid) return;
    if (!state.kahoot.answers[pid]) state.kahoot.answers[pid] = {};
    if (state.kahoot.answers[pid][questionId]) return; // No double answers

    state.kahoot.answers[pid][questionId] = {
      answer,
      time: Date.now() - state.kahoot.questionStartTime,
    };

    // Count answers for current question
    const qId = state.kahoot.questions[state.kahoot.currentQuestionIdx]?.id;
    let answerCount = 0;
    for (const answers of Object.values(state.kahoot.answers)) {
      if (answers[qId] !== undefined) answerCount++;
    }
    io.emit('kahoot:answerCount', { count: answerCount });
    console.log(`🎮 Réponse de ${pid} (${answerCount} total)`);

    // If all online non-admin players answered, auto-advance immediately
    const nonAdminOnline = Object.keys(state.onlinePlayers).filter(id => {
      const p = state.players.find(pp => pp.id === id);
      return p && !p.isAdmin;
    });
    if (answerCount >= nonAdminOnline.length && nonAdminOnline.length > 0) {
      console.log('🎮 Tous les joueurs ont répondu — révélation anticipée');
      if (state.kahoot._timer) clearTimeout(state.kahoot._timer);
      // Small delay so last answer UI updates
      setTimeout(() => _autoRevealAnswer(), 500);
    }
  });

  // === POEM ===

  socket.on('admin:poem:start', () => {
    const player = state.players.find(p => p.id === socket.playerId);
    if (!player?.isAdmin) return;
    state.poem.active = true;
    state.poem.phase = 'voting';
    state.poem.votes = {};
    state.poem.results = null;
    saveState();
    io.emit('poem:started', { teams: state.teams });
  });

  socket.on('poem:vote', ({ teamId }) => {
    if (!state.poem.active || state.poem.phase !== 'voting') return;
    const pid = socket.playerId;
    if (!pid || state.poem.votes[pid]) return; // No double votes
    state.poem.votes[pid] = teamId;
    const voteCount = Object.keys(state.poem.votes).length;
    io.emit('poem:voteCount', { count: voteCount });
  });

  socket.on('admin:poem:end', () => {
    const player = state.players.find(p => p.id === socket.playerId);
    if (!player?.isAdmin) return;
    _computePoemResults();
    state.poem.phase = 'results';
    state.poem.active = false;
    saveState();
    io.emit('poem:results', state.poem.results);
    io.emit('scores:update', computeScores());
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.playerId) {
      delete state.onlinePlayers[socket.playerId];
      io.emit('players:online', Object.keys(state.onlinePlayers));
    }
    console.log(`❌ Déconnexion: ${socket.id}`);
  });
});

// ============================================================
// KAHOOT SERVER-SIDE TIMER & AUTO-ADVANCE
// ============================================================
function _sendKahootQuestion(idx) {
  if (state.kahoot._timer) clearTimeout(state.kahoot._timer);
  if (state.kahoot._leaderboardTimer) clearTimeout(state.kahoot._leaderboardTimer);

  state.kahoot.currentQuestionIdx = idx;
  state.kahoot.phase = 'question';
  state.kahoot.questionStartTime = Date.now();
  const q = state.kahoot.questions[idx];

  io.emit('kahoot:question', {
    idx,
    total: state.kahoot.questions.length,
    question: q.question,
    options: q.options,
    timeLimit: q.timeLimit,
    startTime: state.kahoot.questionStartTime,
  });
  console.log(`🎮 Question ${idx + 1}/${state.kahoot.questions.length}: ${q.question.substring(0, 40)}…`);

  // Server-side timer: auto-reveal when time's up
  state.kahoot._timer = setTimeout(() => {
    if (state.kahoot.phase === 'question') {
      console.log('🎮 Temps écoulé — révélation automatique');
      _autoRevealAnswer();
    }
  }, (q.timeLimit + 1) * 1000); // +1s grace period
}

function _autoRevealAnswer() {
  if (state.kahoot.phase !== 'question') return; // Already revealed
  state.kahoot.phase = 'answer_reveal';
  const q = state.kahoot.questions[state.kahoot.currentQuestionIdx];
  const qId = q.id;

  // Count answers per option
  const answerCounts = [0, 0, 0, 0];
  let correctCount = 0;
  for (const [pid, answers] of Object.entries(state.kahoot.answers)) {
    if (answers[qId] !== undefined) {
      const a = answers[qId].answer;
      if (a >= 0 && a <= 3) answerCounts[a]++;
      if (a === q.correctAnswer) correctCount++;
    }
  }

  io.emit('kahoot:answerReveal', {
    correctAnswer: q.correctAnswer,
    answerCounts,
    correctCount,
    totalPlayers: Object.keys(state.onlinePlayers).filter(id => {
      const p = state.players.find(pp => pp.id === id);
      return p && !p.isAdmin;
    }).length,
  });

  // After 4 seconds, auto-show the leaderboard
  state.kahoot._leaderboardTimer = setTimeout(() => {
    _sendKahootLeaderboard();
  }, 4000);
}

function _sendKahootLeaderboard() {
  state.kahoot.phase = 'leaderboard';
  const leaderboard = _computeKahootStandings();
  const isLastQuestion = state.kahoot.currentQuestionIdx >= state.kahoot.questions.length - 1;

  io.emit('kahoot:leaderboard', {
    standings: leaderboard,
    questionIdx: state.kahoot.currentQuestionIdx,
    totalQuestions: state.kahoot.questions.length,
    isLast: isLastQuestion,
  });
  console.log('🎮 Leaderboard envoyé');
}

// Compute current standings (used for intermediate leaderboard)
function _computeKahootStandings() {
  const playerScores = {};
  const questions = state.kahoot.questions;

  for (const [pid, answers] of Object.entries(state.kahoot.answers)) {
    const player = state.players.find(p => p.id === pid);
    if (!player || player.isAdmin) continue;
    let score = 0;
    let correctCount = 0;
    for (const q of questions) {
      const a = answers[q.id];
      if (a && a.answer === q.correctAnswer) {
        // Real Kahoot scoring: up to 1000 points, linearly decreasing with time
        const timeLimitMs = q.timeLimit * 1000;
        const responseTime = Math.min(a.time, timeLimitMs);
        const points = Math.round(1000 * (1 - (responseTime / timeLimitMs) / 2));
        score += points;
        correctCount++;
      }
    }
    playerScores[pid] = { score, correctCount, name: player.name, teamId: player.teamId };
  }

  // Individual ranking
  const individualRanking = Object.entries(playerScores)
    .map(([pid, data]) => ({ playerId: pid, ...data }))
    .sort((a, b) => b.score - a.score);

  // Team ranking (sum)
  const teamScores = {};
  state.teams.forEach(t => { teamScores[t.id] = 0; });
  for (const data of Object.values(playerScores)) {
    teamScores[data.teamId] = (teamScores[data.teamId] || 0) + data.score;
  }
  const teamRanking = Object.entries(teamScores)
    .map(([teamId, score]) => ({
      teamId,
      teamName: state.teams.find(t => t.id === teamId)?.name || teamId,
      emoji: state.teams.find(t => t.id === teamId)?.emoji || '',
      score,
    }))
    .sort((a, b) => b.score - a.score);

  return { individualRanking, teamRanking };
}

// ============================================================
// KAHOOT FINAL RESULTS COMPUTATION
// ============================================================
function _computeKahootResults() {
  const standings = _computeKahootStandings();
  const topPlayers = standings.individualRanking.slice(0, DATA.kahootScoring.topIndividuals);

  state.kahoot.results = {
    individualRanking: standings.individualRanking,
    teamRanking: standings.teamRanking,
    topPlayers,
  };
}

// ============================================================
// POEM RESULTS COMPUTATION
// ============================================================
function _computePoemResults() {
  const voteCounts = {};
  state.teams.forEach(t => { voteCounts[t.id] = 0; });
  for (const teamId of Object.values(state.poem.votes)) {
    voteCounts[teamId] = (voteCounts[teamId] || 0) + 1;
  }
  const ranking = Object.entries(voteCounts)
    .map(([teamId, votes]) => ({
      teamId,
      teamName: state.teams.find(t => t.id === teamId)?.name || teamId,
      votes,
    }))
    .sort((a, b) => b.votes - a.votes);

  state.poem.results = { ranking, totalVotes: Object.keys(state.poem.votes).length };
}

// ============================================================
// ADMIN RESET ENDPOINT
// ============================================================
app.post('/api/admin/reset', express.json(), (req, res) => {
  state.submissions = {};
  state.validatedChallenges = {};
  state.manualPoints = {};
  state.kahoot.answers = {};
  state.kahoot.results = null;
  state.kahoot.active = false;
  state.kahoot.phase = 'idle';
  state.kahoot.currentQuestionIdx = -1;
  state.poem.votes = {};
  state.poem.results = null;
  state.poem.active = false;
  state.poem.phase = 'idle';
  state.locations = {};
  saveState();
  io.emit('state:reset');
  res.json({ success: true });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// START SERVER
// ============================================================
server.listen(PORT, '0.0.0.0', () => {
  // Get local IP for mobile access
  const os = require('os');
  const interfaces = os.networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIP = iface.address;
        break;
      }
    }
  }
  console.log('');
  console.log('🍺 ══════════════════════════════════════════════');
  console.log('🍺  PUB CRAWL APP — Serveur démarré!');
  console.log('🍺 ══════════════════════════════════════════════');
  console.log(`🍺  Local:  http://localhost:${PORT}`);
  console.log(`🍺  Réseau: http://${localIP}:${PORT}`);
  console.log('🍺');
  console.log('🍺  Partagez le lien réseau avec les participants!');
  console.log('🍺 ══════════════════════════════════════════════');
  console.log('');
});
