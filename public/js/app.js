// ============================================================
// APP.JS — Pub Crawl Frontend SPA
// ============================================================

(function () {
  'use strict';

  // ── STATE ──
  let currentUser = null;   // { id, name, teamId, isAdmin }
  let teams = [];
  let players = [];
  let challenges = [];
  let submissions = {};
  let validatedChallenges = {};
  let scores = {};
  let locations = {};
  let kahootState = {};
  let poemState = {};
  let onlinePlayers = [];
  let currentTab = 'team';

  // Kahoot local state
  let kahootTimer = null;
  let kahootTimeLeft = 0;
  let kahootSelectedAnswer = null;
  let kahootAnswered = false;

  // Poem local state
  let poemVoted = false;
  let poemSelectedTeam = null;

  const socket = io({ reconnection: true, reconnectionDelay: 1000 });
  const $app = document.getElementById('app');

  // ── HELPERS ──
  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'à l\'instant';
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
    return `il y a ${Math.floor(diff / 3600)} h`;
  }

  function getTeam(id) { return teams.find(t => t.id === id); }
  function getTeamScore(teamId) { return scores[teamId]?.total || 0; }

  // ── TOASTS ──
  function showToast(msg, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => { t.remove(); }, 3500);
  }

  // ── LIGHTBOX ──
  function showLightbox(src, type) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.onclick = () => lb.remove();
    if (type === 'video') {
      lb.innerHTML = `
        <button class="lightbox-close" onclick="this.parentElement.remove(); event.stopPropagation();">✕</button>
        <video class="lightbox-content" src="${src}" controls autoplay playsinline></video>`;
    } else {
      lb.innerHTML = `
        <button class="lightbox-close" onclick="this.parentElement.remove(); event.stopPropagation();">✕</button>
        <img class="lightbox-content" src="${src}">`;
    }
    document.body.appendChild(lb);
  }

  // ============================================================
  // RENDER: LOGIN
  // ============================================================
  function renderLogin() {
    const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));
    $app.innerHTML = `
      <div class="login-screen">
        <div class="login-logo">🍺</div>
        <h1 class="login-title">Pub Crawl</h1>
        <p class="login-subtitle">Choisis ton nom pour rejoindre ton équipe</p>
        <div class="login-select-wrap">
          <select class="login-select" id="loginSelect">
            <option value="">— Choisir ton nom —</option>
            ${sortedPlayers.map(p => `<option value="${p.id}">${esc(p.name)}${p.isAdmin ? ' 👑' : ''}</option>`).join('')}
          </select>
          <span class="login-select-arrow">▼</span>
        </div>
        <button class="login-btn" id="loginBtn" disabled>Rejoindre 🚀</button>
      </div>`;

    const select = document.getElementById('loginSelect');
    const btn = document.getElementById('loginBtn');
    select.onchange = () => { btn.disabled = !select.value; };
    btn.onclick = () => {
      const pid = select.value;
      if (!pid) return;
      const player = players.find(p => p.id === pid);
      if (!player) return;
      currentUser = player;
      localStorage.setItem('pubcrawl_user', pid);
      socket.emit('player:login', pid);
      startLocationTracking();
      renderMainApp();
    };
  }

  // ============================================================
  // RENDER: MAIN APP SHELL
  // ============================================================
  function renderMainApp() {
    const team = getTeam(currentUser.teamId);
    const tabs = [
      { id: 'team', icon: '🏠', label: 'Équipe' },
      { id: 'gallery', icon: '📸', label: 'Galerie' },
      { id: 'scores', icon: '🏆', label: 'Scores' },
      { id: 'location', icon: '📍', label: 'Position' },
    ];
    if (currentUser.isAdmin) tabs.push({ id: 'admin', icon: '⚙️', label: 'Admin' });

    $app.innerHTML = `
      <div id="page-team" class="page active"></div>
      <div id="page-gallery" class="page"></div>
      <div id="page-scores" class="page"></div>
      <div id="page-location" class="page"></div>
      ${currentUser.isAdmin ? '<div id="page-admin" class="page"></div>' : ''}
      <nav class="tab-bar">
        ${tabs.map(t => `
          <div class="tab-item ${t.id === currentTab ? 'active' : ''}" data-tab="${t.id}">
            <span class="tab-icon">${t.icon}</span>
            <span class="tab-label">${t.label}</span>
          </div>`).join('')}
      </nav>`;

    // Tab switching
    document.querySelectorAll('.tab-item').forEach(el => {
      el.onclick = () => {
        currentTab = el.dataset.tab;
        document.querySelectorAll('.tab-item').forEach(t => t.classList.toggle('active', t.dataset.tab === currentTab));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(`page-${currentTab}`).classList.add('active');
        renderCurrentPage();
      };
    });

    renderCurrentPage();
  }

  function renderCurrentPage() {
    switch (currentTab) {
      case 'team': renderTeamPage(); break;
      case 'gallery': renderGallery(); break;
      case 'scores': renderScoreboard(); break;
      case 'location': renderLocation(); break;
      case 'admin': renderAdmin(); break;
    }
  }

  // ============================================================
  // RENDER: TEAM PAGE
  // ============================================================
  function renderTeamPage() {
    const page = document.getElementById('page-team');
    if (!page) return;
    const team = getTeam(currentUser.teamId);
    const teamScore = getTeamScore(currentUser.teamId);

    // Group challenges by category
    const cats = {};
    challenges.forEach(c => {
      if (!cats[c.category]) cats[c.category] = [];
      cats[c.category].push(c);
    });

    let html = `
      <div class="page-header">
        <h1>${team.emoji} ${esc(team.name)}</h1>
        <div class="subtitle">${onlinePlayers.filter(id => players.find(p => p.id === id && p.teamId === team.id)).length} membre(s) en ligne</div>
      </div>
      <div class="team-score-banner">
        <div class="team-emoji">${team.emoji}</div>
        <div>
          <div class="team-score-value">${teamScore}</div>
          <div class="team-score-label">Points</div>
        </div>
      </div>`;

    for (const [cat, chs] of Object.entries(cats)) {
      html += `<div class="challenge-category">${esc(cat)}</div>`;
      for (const ch of chs) {
        const key = `${ch.id}_${team.id}`;
        const subs = submissions[key] || [];
        const isValidated = !!validatedChallenges[key];
        const hasSubmission = subs.length > 0;
        const statusClass = isValidated ? 'validated' : hasSubmission ? 'submitted' : '';
        const statusText = isValidated ? 'Validé ✓' : hasSubmission ? 'Preuve soumise' : 'Non complété';
        const dotClass = isValidated ? 'validated' : hasSubmission ? 'submitted' : 'pending';

        const isSpecial = ch.type === 'kahoot' || ch.type === 'poem';

        html += `
          <div class="challenge-card ${statusClass}">
            <div class="challenge-top">
              <div class="challenge-title">${esc(ch.title)}</div>
              ${ch.points > 0 ? `<div class="challenge-points">${ch.points} pt${ch.points > 1 ? 's' : ''}</div>` : ''}
            </div>
            <div class="challenge-status">
              <div class="status-dot ${dotClass}"></div>
              <span>${statusText}</span>
            </div>
            ${!isSpecial ? `
              <div class="challenge-actions">
                <label class="upload-btn" id="upload-btn-${ch.id}">
                  📷 Ajouter une preuve
                  <input type="file" accept="image/*,video/*" capture="environment"
                    onchange="window._handleUpload(this, '${ch.id}', '${team.id}')">
                </label>
              </div>` : `
              <div class="challenge-actions">
                <span style="color:var(--text-muted);font-size:13px;">${ch.type === 'kahoot' ? '🎮 Mode spécial Kahoot' : '📝 Mode spécial Poème'}</span>
              </div>`}
            ${subs.length > 0 ? `
              <div class="submissions-row">
                ${subs.map(s => s.mediaType === 'video'
                  ? `<div class="submission-thumb-video" onclick="window._lightbox('/uploads/${s.filename}','video')">🎬</div>`
                  : `<img class="submission-thumb" src="/uploads/${s.filename}" onclick="window._lightbox('/uploads/${s.filename}','image')" loading="lazy">`
                ).join('')}
              </div>` : ''}
          </div>`;
      }
    }
    // === SECTION MEMBRES ===
    html += `<div class="challenge-category">👥 Mon équipe</div>`;
    const myTeamPlayers = players.filter(p => p.teamId === currentUser.teamId && !p.isAdmin);
    html += `<div class="challenge-card">
      <div class="members-list">
        ${myTeamPlayers.map(p => `
          <div class="member-row ${p.id === currentUser.id ? 'member-me' : ''}">
            <span class="member-dot" style="background:${team.color}"></span>
            <span class="member-name">${esc(p.name)}</span>
            ${p.id === currentUser.id ? '<span class="member-badge">Toi</span>' : ''}
            ${onlinePlayers.includes(p.id) ? '<span class="member-online">●</span>' : ''}
          </div>`).join('')}
      </div>
    </div>`;

    // Autres équipes
    html += `<div class="challenge-category">🏅 Autres équipes</div>`;
    for (const t of teams) {
      if (t.id === currentUser.teamId) continue;
      const tPlayers = players.filter(p => p.teamId === t.id && !p.isAdmin);
      html += `<div class="challenge-card">
        <div class="challenge-top">
          <div class="challenge-title">${t.emoji} ${esc(t.name)}</div>
          <div class="challenge-points">${getTeamScore(t.id)} pts</div>
        </div>
        <div class="members-list">
          ${tPlayers.map(p => `
            <div class="member-row">
              <span class="member-dot" style="background:${t.color}"></span>
              <span class="member-name">${esc(p.name)}</span>
              ${onlinePlayers.includes(p.id) ? '<span class="member-online">●</span>' : ''}
            </div>`).join('')}
        </div>
      </div>`;
    }
    page.innerHTML = html;
  }

  // ============================================================
  // FILE UPLOAD HANDLER
  // ============================================================
  let uploadingSet = new Set(); // prevent double uploads

  window._handleUpload = function (input, challengeId, teamId) {
    const file = input.files[0];
    if (!file) return;
    const uploadKey = `${challengeId}_${teamId}_${file.name}_${file.size}`;
    if (uploadingSet.has(uploadKey)) return;
    uploadingSet.add(uploadKey);

    // Show spinner
    const btn = document.getElementById(`upload-btn-${challengeId}`);
    if (btn) {
      btn.innerHTML = `<div class="upload-spinner"></div> Envoi en cours…`;
      btn.style.pointerEvents = 'none';
    }

    const fd = new FormData();
    fd.append('media', file);
    fd.append('challengeId', challengeId);
    fd.append('teamId', teamId);
    fd.append('playerId', currentUser.id);

    fetch('/api/upload', { method: 'POST', body: fd })
      .then(r => {
        if (!r.ok) throw new Error('Upload échoué');
        return r.json();
      })
      .then(data => {
        showToast('Preuve envoyée! 🎉', 'success');
      })
      .catch(err => {
        showToast('Erreur d\'envoi: ' + err.message, 'error');
      })
      .finally(() => {
        uploadingSet.delete(uploadKey);
        // Reset input
        input.value = '';
        if (btn) {
          btn.innerHTML = `📷 Ajouter une preuve<input type="file" accept="image/*,video/*" capture="environment" onchange="window._handleUpload(this, '${challengeId}', '${teamId}')">`;
          btn.style.pointerEvents = '';
        }
      });
  };

  window._lightbox = function (src, type) { showLightbox(src, type); };

  // ============================================================
  // RENDER: GALLERY
  // ============================================================
  function renderGallery() {
    const page = document.getElementById('page-gallery');
    if (!page) return;
    let html = `<div class="page-header"><h1>📸 Galerie</h1><div class="subtitle">Preuves de toutes les équipes</div></div>`;

    for (const team of teams) {
      const teamSubs = [];
      for (const ch of challenges) {
        const key = `${ch.id}_${team.id}`;
        const subs = submissions[key] || [];
        if (subs.length > 0) teamSubs.push({ challenge: ch, subs });
      }

      html += `
        <div class="gallery-team-section">
          <div class="gallery-team-header">
            <span class="gallery-team-emoji">${team.emoji}</span>
            <span class="gallery-team-name">${esc(team.name)}</span>
            <span class="gallery-team-score">${getTeamScore(team.id)} pts</span>
          </div>`;

      if (teamSubs.length === 0) {
        html += `<div class="empty-state"><p>Aucune preuve soumise</p></div>`;
      } else {
        for (const { challenge, subs } of teamSubs) {
          html += `<div class="gallery-challenge-title">${esc(challenge.title)}</div>
            <div class="gallery-grid">
              ${subs.map(s => `
                <div class="gallery-item" onclick="window._lightbox('/uploads/${s.filename}','${s.mediaType}')">
                  ${s.mediaType === 'video'
                    ? `<video src="/uploads/${s.filename}" preload="metadata"></video><div class="gallery-item-video-icon">▶</div>`
                    : `<img src="/uploads/${s.filename}" loading="lazy">`}
                </div>`).join('')}
            </div>`;
        }
      }
      html += `</div>`;
    }

    page.innerHTML = html;
  }

  // ============================================================
  // RENDER: SCOREBOARD
  // ============================================================
  function renderScoreboard() {
    const page = document.getElementById('page-scores');
    if (!page) return;
    const sorted = [...teams].sort((a, b) => getTeamScore(b.id) - getTeamScore(a.id));
    const rankClasses = ['gold', 'silver', 'bronze'];

    let html = `
      <div class="page-header"><h1>🏆 Classement</h1></div>
      <div class="scoreboard-list">
        ${sorted.map((t, i) => {
          const sc = scores[t.id] || { total: 0, byChallenges: {} };
          const completedCount = Object.keys(sc.byChallenges).filter(k => k !== 'bonus' && sc.byChallenges[k] > 0).length;
          return `
            <div class="score-card">
              <div class="score-rank ${rankClasses[i] || ''}">${i + 1}</div>
              <div class="score-info">
                <div class="score-team-name">${t.emoji} ${esc(t.name)}</div>
                <div class="score-team-detail">${completedCount} défi(s) complété(s)</div>
              </div>
              <div class="score-points">${sc.total}</div>
            </div>`;
        }).join('')}
      </div>`;

    page.innerHTML = html;
  }

  // ============================================================
  // RENDER: LOCATION
  // ============================================================
  function renderLocation() {
    const page = document.getElementById('page-location');
    if (!page) return;

    const locEntries = Object.entries(locations).filter(([, v]) => v.lat && v.lng);

    let html = `<div class="page-header"><h1>📍 Positions</h1><div class="subtitle">Dernière activité détectée</div></div>
      <div class="location-page">`;

    if (locEntries.length === 0) {
      html += `<div class="empty-state"><div class="emoji">🗺️</div><p>Aucune position détectée pour le moment.<br>Les positions se mettent à jour automatiquement.</p></div>`;
    } else {
      // Embedded map
      const center = locEntries.reduce((acc, [, v]) => ({ lat: acc.lat + v.lat / locEntries.length, lng: acc.lng + v.lng / locEntries.length }), { lat: 0, lng: 0 });
      const markers = locEntries.map(([tid, v]) => {
        const t = getTeam(tid);
        return `markers=color:red%7Clabel:${encodeURIComponent(t?.emoji?.[0] || 'T')}%7C${v.lat},${v.lng}`;
      }).join('&');

      // Simple OSM iframe
      if (locEntries.length > 0) {
        const bbox = locEntries.reduce((b, [, v]) => ({
          minLat: Math.min(b.minLat, v.lat), maxLat: Math.max(b.maxLat, v.lat),
          minLng: Math.min(b.minLng, v.lng), maxLng: Math.max(b.maxLng, v.lng)
        }), { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 });
        const pad = 0.005;
        const osmUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox.minLng - pad},${bbox.minLat - pad},${bbox.maxLng + pad},${bbox.maxLat + pad}&layer=mapnik`;
        html += `<div class="location-map-wrap"><iframe src="${osmUrl}" allowfullscreen loading="lazy"></iframe></div>`;
      }

      for (const [tid, loc] of locEntries) {
        const t = getTeam(tid);
        if (!t) continue;
        html += `
          <div class="location-card">
            <div class="location-emoji">${t.emoji}</div>
            <div class="location-info">
              <div class="location-team-name">${esc(t.name)}</div>
              <div class="location-detail">via ${esc(loc.playerName)} · ${timeAgo(loc.timestamp)}</div>
              <div class="location-detail" style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}</div>
            </div>
          </div>`;
      }
    }

    html += `</div>`;
    page.innerHTML = html;
  }

  // ============================================================
  // RENDER: ADMIN
  // ============================================================
  function renderAdmin() {
    const page = document.getElementById('page-admin');
    if (!page || !currentUser.isAdmin) return;

    let html = `
      <div class="page-header"><h1>⚙️ Admin</h1></div>
      <div class="admin-panel">

        <!-- KAHOOT CONTROL -->
        <div class="admin-section">
          <h3>🎮 Mode Kahoot</h3>
          ${kahootState.phase === 'final_results' || kahootState.results
            ? '<p style="color:var(--success);font-size:14px;margin-bottom:8px;">✓ Kahoot terminé — résultats enregistrés</p>'
            : kahootState.active
              ? '<p style="color:var(--warning);font-size:14px;margin-bottom:8px;">⏳ Kahoot en cours — contrôles dans l\'overlay</p>'
              : ''}
          <button class="admin-btn primary" onclick="window._adminKahootStart()" ${kahootState.active ? 'disabled' : ''}>
            ${kahootState.results ? 'Relancer un Kahoot' : 'Lancer le Kahoot'}
          </button>
        </div>

        <!-- POEM CONTROL -->
        <div class="admin-section">
          <h3>📝 Mode Poème</h3>
          <button class="admin-btn primary" onclick="window._adminPoemStart()" ${poemState.active ? 'disabled' : ''}>
            Ouvrir le vote
          </button>
          ${poemState.active ? `
            <button class="admin-btn success" onclick="window._adminPoemEnd()">Fermer le vote & résultats</button>
            <p style="margin-top:8px;color:var(--text-muted);font-size:13px;">Votes reçus: <span id="poem-vote-count">${poemState.voteCount || 0}</span></p>
          ` : ''}
          ${poemState.results ? '<p style="margin-top:8px;color:var(--success);font-size:13px;">✓ Résultats enregistrés</p>' : ''}
        </div>

        <!-- VALIDATE CHALLENGES -->
        <div class="admin-section">
          <h3>✅ Valider les défis</h3>
          <div class="admin-validate-list">
            ${teams.map(t => challenges.filter(c => c.type === 'normal' && c.points > 0).map(c => {
              const key = `${c.id}_${t.id}`;
              const hasSub = (submissions[key] || []).length > 0;
              const isVal = !!validatedChallenges[key];
              if (!hasSub && !isVal) return '';
              return `
                <div class="admin-validate-row">
                  <span>${t.emoji}</span>
                  <span class="v-title">${esc(c.title).substring(0, 40)}…</span>
                  <button class="admin-validate-toggle ${isVal ? 'on' : ''}"
                    onclick="window._adminValidate('${c.id}','${t.id}',${!isVal})"></button>
                </div>`;
            }).join('')).join('')}
          </div>
        </div>

        <!-- MANUAL POINTS -->
        <div class="admin-section">
          <h3>➕ Points manuels</h3>
          ${teams.map(t => `
            <div class="admin-points-row">
              <span class="team-label">${t.emoji} ${esc(t.name)} <span style="color:var(--text-muted);font-size:12px;">(bonus: ${state_manualPoints(t.id)})</span></span>
              <button class="admin-points-btn" onclick="window._adminPoints('${t.id}',-1)">−</button>
              <button class="admin-points-btn" onclick="window._adminPoints('${t.id}',1)">+</button>
            </div>`).join('')}
        </div>

        <!-- RESET -->
        <div class="admin-section">
          <h3>🔄 Reset</h3>
          <button class="admin-btn danger" onclick="if(confirm('Tout réinitialiser?')) fetch('/api/admin/reset',{method:'POST'}).then(()=>location.reload())">
            Réinitialiser tout
          </button>
        </div>

      </div>`;

    page.innerHTML = html;
  }

  // Track manual points locally for display
  let _manualPointsLocal = {};
  function state_manualPoints(teamId) { return _manualPointsLocal[teamId] || 0; }

  // ── ADMIN ACTIONS ──
  window._adminValidate = (cid, tid, val) => { socket.emit('admin:validate', { challengeId: cid, teamId: tid, validated: val }); };
  window._adminPoints = (tid, pts) => { socket.emit('admin:manualPoints', { teamId: tid, points: pts }); _manualPointsLocal[tid] = (_manualPointsLocal[tid] || 0) + pts; };
  window._adminKahootStart = () => { socket.emit('admin:kahoot:start'); };
  window._adminKahootNext = () => { socket.emit('admin:kahoot:nextQuestion'); };
  window._adminKahootEnd = () => { socket.emit('admin:kahoot:end'); };
  window._adminPoemStart = () => { socket.emit('admin:poem:start'); };
  window._adminPoemEnd = () => { socket.emit('admin:poem:end'); };
  window._adminPoemCancel = () => {
    socket.emit('admin:poem:end');
    removeOverlay('poem-overlay');
  };

  // ============================================================
  // KAHOOT UI — Server-managed timer, auto-reveal, auto-leaderboard
  // Phases: idle → question → answer_reveal → leaderboard → (loop) → final_results
  // ============================================================
  function showKahootOverlay() {
    removeOverlay('kahoot-overlay');
    const ol = document.createElement('div');
    ol.className = 'kahoot-overlay';
    ol.id = 'kahoot-overlay-el';
    ol.innerHTML = `
      <div class="kahoot-header">
        <h2>🎮 Kahoot</h2>
        <div class="q-counter" id="kahoot-counter"></div>
      </div>
      <div class="kahoot-body" id="kahoot-body">
        <div class="kahoot-waiting">
          <div class="big-emoji">🎮</div>
          <p>Le Kahoot va commencer…<br>Préparez-vous!</p>
        </div>
      </div>
      ${currentUser?.isAdmin ? '<div class="kahoot-admin-bar" id="kahoot-admin-bar"></div>' : ''}`;
    document.body.appendChild(ol);
    updateKahootAdminBar();
  }

  function updateKahootAdminBar() {
    const bar = document.getElementById('kahoot-admin-bar');
    if (!bar || !currentUser?.isAdmin) return;
    const phase = kahootState.phase;
    let btns = '';
    if (phase === 'idle') {
      btns = `<button class="admin-btn warning" onclick="window._adminKahootNext()">Première question ▶</button>`;
    } else if (phase === 'question') {
      btns = `<span style="color:var(--text-muted);font-size:14px;">⏳ En attente des réponses…</span>`;
    } else if (phase === 'answer_reveal') {
      btns = `<span style="color:var(--text-muted);font-size:14px;">👁️ Révélation…</span>`;
    } else if (phase === 'leaderboard') {
      const isLast = kahootState.currentQuestionIdx >= (kahootState.totalQuestions || 999) - 1;
      btns = `<button class="admin-btn warning" onclick="window._adminKahootNext()">${isLast ? 'Résultats finaux 🏆' : 'Question suivante ▶'}</button>`;
    } else if (phase === 'final_results') {
      btns = `<span style="color:var(--success);font-weight:600;">✓ Kahoot terminé!</span>`;
    }
    btns += ` <button class="admin-btn danger" onclick="window._adminKahootEnd()" style="margin-left:8px;">Fermer ✕</button>`;
    bar.innerHTML = btns;
  }

  function renderKahootQuestion(data) {
    kahootSelectedAnswer = null;
    kahootAnswered = false;
    kahootState.currentQuestionIdx = data.idx;
    kahootState.totalQuestions = data.total;

    const body = document.getElementById('kahoot-body');
    const counter = document.getElementById('kahoot-counter');
    if (!body) return;
    counter.textContent = `Question ${data.idx + 1} / ${data.total}`;

    body.innerHTML = `
      <div class="kahoot-question">${esc(data.question)}</div>
      <div class="kahoot-timer" id="kahoot-timer">${data.timeLimit}</div>
      <div class="kahoot-options" id="kahoot-options">
        ${data.options.map((opt, i) => `
          <button class="kahoot-option" data-idx="${i}" onclick="window._kahootAnswer(${i}, '${data.idx}')">${esc(opt)}</button>
        `).join('')}
      </div>
      <div class="kahoot-answer-count" id="kahoot-ac"></div>`;

    // Visual countdown (server controls the real timer)
    kahootTimeLeft = data.timeLimit;
    clearInterval(kahootTimer);
    kahootTimer = setInterval(() => {
      kahootTimeLeft--;
      const timerEl = document.getElementById('kahoot-timer');
      if (timerEl) {
        timerEl.textContent = Math.max(0, kahootTimeLeft);
        if (kahootTimeLeft <= 5) timerEl.classList.add('urgent');
      }
      if (kahootTimeLeft <= 0) clearInterval(kahootTimer);
    }, 1000);
  }

  window._kahootAnswer = (idx, qIdx) => {
    if (kahootAnswered) return;
    kahootAnswered = true;
    kahootSelectedAnswer = idx;
    const questionId = `q${parseInt(qIdx) + 1}`;
    socket.emit('kahoot:answer', { questionId, answer: idx });
    document.querySelectorAll('.kahoot-option').forEach((btn, i) => {
      btn.disabled = true;
      if (i === idx) btn.classList.add('selected');
    });
    clearInterval(kahootTimer);
    const timerEl = document.getElementById('kahoot-timer');
    if (timerEl) { timerEl.textContent = '✓'; timerEl.classList.remove('urgent'); }
  };

  function renderKahootReveal(data) {
    clearInterval(kahootTimer);
    document.querySelectorAll('.kahoot-option').forEach((btn, i) => {
      btn.disabled = true;
      if (i === data.correctAnswer) btn.classList.add('correct');
      else btn.classList.add('wrong');
    });
    const timerEl = document.getElementById('kahoot-timer');
    if (timerEl) {
      if (kahootAnswered && kahootSelectedAnswer === data.correctAnswer) {
        timerEl.textContent = '🎉 Bonne réponse!';
        timerEl.style.color = 'var(--success)';
      } else if (kahootAnswered) {
        timerEl.textContent = '❌ Mauvaise réponse';
        timerEl.style.color = 'var(--danger)';
      } else {
        timerEl.textContent = '⏰ Temps écoulé!';
        timerEl.style.color = 'var(--warning)';
      }
      timerEl.style.fontSize = '24px';
    }
    const acEl = document.getElementById('kahoot-ac');
    if (acEl) acEl.innerHTML = `${data.correctCount}/${data.totalPlayers} bonne(s) réponse(s)`;
  }

  function renderKahootLeaderboard(data) {
    clearInterval(kahootTimer);
    const body = document.getElementById('kahoot-body');
    const counter = document.getElementById('kahoot-counter');
    if (!body) return;
    counter.textContent = `Classement — après question ${data.questionIdx + 1}/${data.totalQuestions}`;

    const s = data.standings;
    body.innerHTML = `
      <div class="kahoot-results">
        <h3>🏆 Classement des équipes</h3>
        ${(s.teamRanking || []).map((t, i) => `
          <div class="kahoot-result-row" style="animation:slideDown 0.3s ease ${i * 0.1}s both;">
            <div class="kahoot-result-rank">${['🥇','🥈','🥉'][i] || (i+1)}</div>
            <div class="kahoot-result-name">${t.emoji || ''} ${esc(t.teamName)}</div>
            <div class="kahoot-result-score">${t.score}</div>
          </div>`).join('')}

        <h3 style="margin-top:20px;">🌟 Top joueurs</h3>
        ${(s.individualRanking || []).slice(0, 5).map((p, i) => `
          <div class="kahoot-result-row" style="animation:slideDown 0.3s ease ${(i+3)*0.1}s both;">
            <div class="kahoot-result-rank" style="font-size:14px;">${i + 1}</div>
            <div class="kahoot-result-name">${esc(p.name)}</div>
            <div class="kahoot-result-score">${p.score}</div>
          </div>`).join('')}
        ${!currentUser?.isAdmin ? '<p style="text-align:center;color:var(--text-muted);margin-top:20px;font-size:14px;">En attente de la prochaine question…</p>' : ''}
      </div>`;
  }

  function renderKahootFinalResults(results) {
    clearInterval(kahootTimer);
    const body = document.getElementById('kahoot-body');
    const counter = document.getElementById('kahoot-counter');
    if (!body) return;
    counter.textContent = 'Résultats finaux';
    const topIds = (results.topPlayers || []).map(p => p.playerId);
    const kahootPts = { 1: 5, 2: 3, 3: 1 };

    body.innerHTML = `
      <div class="kahoot-results">
        <h3>🏆 Classement final par équipe</h3>
        ${(results.teamRanking || []).map((t, i) => {
          const pts = kahootPts[i + 1] || 0;
          return `
            <div class="kahoot-result-row" style="animation:slideDown 0.4s ease ${i*0.15}s both;">
              <div class="kahoot-result-rank">${['🥇','🥈','🥉'][i] || (i+1)}</div>
              <div class="kahoot-result-name">${t.emoji || ''} ${esc(t.teamName)} ${pts ? '<span style="color:var(--warning);font-size:12px;margin-left:4px;">+'+pts+' pts</span>' : ''}</div>
              <div class="kahoot-result-score">${t.score}</div>
            </div>`;
        }).join('')}

        <h3 style="margin-top:24px;">🌟 Classement individuel</h3>
        ${(results.individualRanking || []).map((p, i) => `
          <div class="kahoot-result-row" style="animation:slideDown 0.3s ease ${(i+3)*0.08}s both;">
            <div class="kahoot-result-rank" style="font-size:14px;">${i + 1}</div>
            <div class="kahoot-result-name">${esc(p.name)} ${topIds.includes(p.playerId) ? '<span class="kahoot-exempt-badge">Pas de shot! 🎉</span>' : ''}</div>
            <div class="kahoot-result-score">${p.score}</div>
          </div>`).join('')}
      </div>`;
  }

  function removeOverlay(className) {
    const el = document.querySelector(`.${className}`);
    if (el) el.remove();
  }

  // ============================================================
  // POEM UI
  // ============================================================
  function showPoemOverlay() {
    removeOverlay('poem-overlay');
    poemVoted = false;
    poemSelectedTeam = null;
    const ol = document.createElement('div');
    ol.className = 'poem-overlay';
    ol.id = 'poem-overlay-el';
    ol.innerHTML = `
      <div class="poem-header">
        <h2>📝 Vote — Meilleur poème</h2>
      </div>
      <div class="poem-body">
        <p style="color:var(--text-muted);margin-bottom:24px;text-align:center;">Votez pour l'équipe qui a présenté le meilleur poème!</p>
        <div class="poem-vote-options" id="poem-options">
          ${teams.map(t => `
            <button class="poem-vote-btn" data-team="${t.id}" onclick="window._poemVote('${t.id}')">
              <span style="font-size:28px;">${t.emoji}</span>
              ${esc(t.name)}
            </button>`).join('')}
        </div>
        <div id="poem-status" style="margin-top:20px;color:var(--text-muted);font-size:14px;"></div>
      </div>
      ${currentUser?.isAdmin ? `
        <div class="poem-admin-bar" id="poem-admin-bar">
          <span style="font-size:13px;color:var(--text-muted);" id="poem-admin-count">0 votes reçus</span>
          <button class="admin-btn success" onclick="window._adminPoemEnd()">Fermer le vote & résultats</button>
          <button class="admin-btn danger" onclick="window._adminPoemCancel()" style="margin-left:4px;">Annuler ✕</button>
        </div>` : ''}`;
    document.body.appendChild(ol);
  }

  window._poemVote = (teamId) => {
    if (poemVoted) return;
    poemVoted = true;
    poemSelectedTeam = teamId;
    socket.emit('poem:vote', { teamId });
    document.querySelectorAll('.poem-vote-btn').forEach(btn => {
      btn.disabled = true;
      if (btn.dataset.team === teamId) btn.classList.add('selected');
    });
    document.getElementById('poem-status').textContent = 'Vote enregistré! ✓ En attente des résultats…';
  };

  function renderPoemResults(results) {
    const body = document.querySelector('.poem-body');
    if (!body) return;
    const maxVotes = Math.max(...results.ranking.map(r => r.votes), 1);
    const teamColors = {};
    teams.forEach(t => { teamColors[t.id] = t.color; });

    body.innerHTML = `
      <h3 style="font-size:22px;margin-bottom:20px;">Résultats du vote</h3>
      <div class="poem-results">
        ${results.ranking.map((r, i) => `
          <div class="poem-result-bar">
            <div class="poem-result-label">
              <span>${['🥇','🥈','🥉'][i] || ''} ${esc(r.teamName)}</span>
              <span>${r.votes} vote(s)</span>
            </div>
            <div class="poem-bar-bg">
              <div class="poem-bar-fill" style="width:${(r.votes / maxVotes) * 100}%;background:${teamColors[r.teamId] || 'var(--accent)'}">
                ${r.votes}
              </div>
            </div>
          </div>`).join('')}
        <p style="text-align:center;color:var(--text-muted);margin-top:16px;">${results.totalVotes} votes au total</p>
      </div>`;
  }

  // ============================================================
  // GEOLOCATION
  // ============================================================
  function startLocationTracking() {
    if (!navigator.geolocation) return;
    // Update every 30 seconds
    const send = () => {
      navigator.geolocation.getCurrentPosition(
        pos => {
          socket.emit('location:update', {
            playerId: currentUser.id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => {}, // silently fail
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
      );
    };
    send();
    setInterval(send, 30000);
  }

  // ============================================================
  // SOCKET EVENTS
  // ============================================================
  socket.on('submission:new', (data) => {
    submissions[data.key] = submissions[data.key] || [];
    // Avoid duplicates
    if (!submissions[data.key].find(s => s.id === data.submission.id)) {
      submissions[data.key].push(data.submission);
    }
    if (data.scores) scores = data.scores;
    renderCurrentPage();
  });

  socket.on('validation:update', (data) => {
    validatedChallenges = data.validatedChallenges;
    scores = data.scores;
    renderCurrentPage();
  });

  socket.on('scores:update', (s) => {
    scores = s;
    renderCurrentPage();
  });

  socket.on('locations:update', (locs) => {
    locations = locs;
    if (currentTab === 'location') renderLocation();
  });

  socket.on('players:online', (list) => {
    onlinePlayers = list;
  });

  // Kahoot events
  socket.on('kahoot:started', () => {
    kahootState.active = true;
    kahootState.phase = 'idle';
    showKahootOverlay();
    if (currentTab === 'admin') renderAdmin();
  });

  socket.on('kahoot:question', (data) => {
    kahootState.phase = 'question';
    kahootState.currentQuestionIdx = data.idx;
    kahootState.totalQuestions = data.total;
    if (!document.querySelector('.kahoot-overlay')) showKahootOverlay();
    renderKahootQuestion(data);
    updateKahootAdminBar();
  });

  socket.on('kahoot:answerReveal', (data) => {
    kahootState.phase = 'answer_reveal';
    renderKahootReveal(data);
    updateKahootAdminBar();
  });

  socket.on('kahoot:answerCount', (data) => {
    const el = document.getElementById('kahoot-ac');
    if (el) el.textContent = `${data.count} réponse(s) reçue(s)`;
  });

  socket.on('kahoot:leaderboard', (data) => {
    kahootState.phase = 'leaderboard';
    renderKahootLeaderboard(data);
    updateKahootAdminBar();
  });

  socket.on('kahoot:finalResults', (results) => {
    kahootState.phase = 'final_results';
    kahootState.results = results;
    renderKahootFinalResults(results);
    updateKahootAdminBar();
  });

  socket.on('kahoot:ended', () => {
    kahootState.active = false;
    kahootState.phase = 'idle';
    clearInterval(kahootTimer);
    removeOverlay('kahoot-overlay');
    if (currentTab === 'admin') renderAdmin();
  });

  // Poem events
  socket.on('poem:started', () => {
    poemState.active = true;
    poemState.phase = 'voting';
    poemState.votes = {};
    showPoemOverlay();
    if (currentTab === 'admin') renderAdmin();
  });

  socket.on('poem:voteCount', (data) => {
    poemState.voteCount = data.count;
    const el = document.getElementById('poem-vote-count');
    if (el) el.textContent = data.count;
    const adminCount = document.getElementById('poem-admin-count');
    if (adminCount) adminCount.textContent = `${data.count} votes reçus`;
  });

  socket.on('poem:results', (results) => {
    poemState.phase = 'results';
    poemState.results = results;
    poemState.active = false;
    renderPoemResults(results);
    // Auto-close after 10s if not admin
    if (!currentUser?.isAdmin) {
      setTimeout(() => { removeOverlay('poem-overlay'); }, 12000);
    }
    if (currentTab === 'admin') renderAdmin();
  });

  // State reset
  socket.on('state:reset', () => {
    location.reload();
  });

  // Reconnect
  socket.on('connect', () => {
    if (currentUser) {
      socket.emit('player:login', currentUser.id);
    }
  });

  // ============================================================
  // INIT
  // ============================================================
  async function init() {
    try {
      const res = await fetch('/api/init');
      const data = await res.json();
      teams = data.teams;
      players = data.players;
      challenges = data.challenges;
      submissions = data.submissions;
      validatedChallenges = data.validatedChallenges;
      scores = data.scores;
      locations = data.locations;
      kahootState = data.kahoot;
      poemState = data.poem;
      _manualPointsLocal = data.manualPoints || {};

      // Auto-login from localStorage
      const savedId = localStorage.getItem('pubcrawl_user');
      if (savedId) {
        const player = players.find(p => p.id === savedId);
        if (player) {
          currentUser = player;
          socket.emit('player:login', savedId);
          startLocationTracking();
          renderMainApp();

          // Restore overlays if active
          if (kahootState.active) showKahootOverlay();
          if (poemState.active) showPoemOverlay();
          return;
        }
      }
      renderLogin();
    } catch (e) {
      $app.innerHTML = `<div class="login-screen"><div class="login-logo">⚠️</div><h1 class="login-title">Connexion impossible</h1><p class="login-subtitle">Vérifiez que le serveur est démarré et rechargez la page.</p><button class="login-btn" onclick="location.reload()">Réessayer</button></div>`;
    }
  }

  init();
})();
