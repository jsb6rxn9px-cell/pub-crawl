// ============================================================
// DATA.JS — Configure your pub crawl here!
// Edit teams, players, challenges, and Kahoot questions below.
// ============================================================

const DATA = {

  // --- TEAMS ---
  // Add/remove teams as needed. Each needs a unique id.
  teams: [
    { id: 't1', name: 'Les Flamants Roses', color: '#FF6B9D', emoji: '🦩' },
    { id: 't2', name: 'Les Renards Rusés',  color: '#4ECDC4', emoji: '🦊' },
    { id: 't3', name: 'Les Loups Galants',  color: '#FFD93D', emoji: '🐺' },
    // { id: 't4', name: 'Équipe 4', color: '#A78BFA', emoji: '🦁' },
  ],

  // --- PLAYERS ---
  // Each player must have a unique id and a valid teamId from above.
  // The admin user MUST have id: 'admin' — do not change this.
  players: [
    { id: 'admin', name: '👑 Admin', teamId: 't1', isAdmin: true },
    // Équipe 1
    { id: 'p1',  name: 'Alex',     teamId: 't1' },
    { id: 'p2',  name: 'Isa',      teamId: 't1' },
    { id: 'p3',  name: 'Charlie',  teamId: 't1' },
    { id: 'p4',  name: 'Sam',      teamId: 't1' },
    // Équipe 2
    { id: 'p5',  name: 'Jordan',   teamId: 't2' },
    { id: 'p6',  name: 'Morgan',   teamId: 't2' },
    { id: 'p7',  name: 'Taylor',   teamId: 't2' },
    { id: 'p8',  name: 'Camille',  teamId: 't2' },
    // Équipe 3
    { id: 'p9',  name: 'Robin',    teamId: 't3' },
    { id: 'p10', name: 'Dominique',teamId: 't3' },
    { id: 'p11', name: 'Maxime',   teamId: 't3' },
    { id: 'p12', name: 'Lou',      teamId: 't3' },
  ],

  // --- CHALLENGES ---
  // type: 'normal' (upload proof), 'kahoot' (quiz), 'poem' (vote)
  // category: group them visually in the UI
  challenges: [
    // Défis déplacement
    { id: 'c1',  title: 'Faire un faux reportage de 15 secondes sur un événement en live', points: 2, category: 'Défis déplacement', type: 'normal', order: 1 },
    { id: 'c2',  title: 'Trouver un totem d\'équipe que vous transporterez (vidéo d\'explication)', points: 2, category: 'Défis déplacement', type: 'normal', order: 2 },
    { id: 'c3',  title: 'Réussir à avoir un drink gratuit', points: 3, category: 'Défis déplacement', type: 'normal', order: 3 },
    { id: 'c4',  title: 'Composer un poème pour Alex et un pour Isa (récités et jugés à la fin)', points: 0, category: 'Défis déplacement', type: 'poem', order: 4 },
    { id: 'c5',  title: 'Gobbler une bouteille de vin complète en équipe en moins de 5 min', points: 3, category: 'Défis déplacement', type: 'normal', order: 5 },
    { id: 'c6',  title: 'Crush une bière à un itinérant', points: 4, category: 'Défis déplacement', type: 'normal', order: 6 },
    { id: 'c7',  title: 'Trouver un mini-cadeau absurde mais sincère pour Isa ET pour Alex', points: 5, category: 'Défis déplacement', type: 'normal', order: 7 },
    { id: 'c8',  title: 'Strip sa bouteille au souper en moins de 5 min', points: 3, category: 'Défis déplacement', type: 'normal', order: 8 },
    { id: 'c9',  title: 'Ice Isa ou Alex', points: 3, category: 'Défis déplacement', type: 'normal', order: 9 },
    { id: 'c10', title: 'Acheter une bière à plus de 7%', points: 2, category: 'Défis déplacement', type: 'normal', order: 10 },
    { id: 'c11', title: 'Concevoir une structure architecturale pour embellir le quartier', points: 2, category: 'Défis déplacement', type: 'normal', order: 11 },

    // Bars
    { id: 'c12', title: 'Première équipe arrivée et servie', points: 1, category: 'Bar 1 — BAR A', type: 'normal', order: 12 },
    { id: 'c13', title: 'Get un petit refreshment rapide', points: 1, category: 'Bar 1 — BAR A', type: 'normal', order: 13 },
    { id: 'c14', title: 'Split un G (parfait)', points: 2, category: 'Bar 2 — L\'Barouf', type: 'normal', order: 14 },
    { id: 'c15', title: 'Get dequoi de tchek', points: 2, category: 'Bar 3 — Bili Kun', type: 'normal', order: 15 },

    // Kahoot
    { id: 'c16', title: 'Défi Kahoot', points: 5, category: 'Bar 4 — Mont-Royal Hot Dog', type: 'kahoot', order: 16 },

    // Bar 5
    { id: 'c17', title: 'Gagner une game de babyfoot', points: 5, category: 'Bar 5 — La Remise', type: 'normal', order: 17 },

    // Bar final
    { id: 'c18', title: 'TBD', points: 0, category: 'Bar Final', type: 'normal', order: 18 },
  ],

  // --- KAHOOT QUESTIONS ---
  // Replace with your actual questions!
  // correctAnswer is the index (0-3) of the correct option.
  // timeLimit is in seconds.
  kahootQuestions: [
    {
      id: 'q1',
      question: 'Quelle est la pire phobie à Isa ?',
      options: ['les hauteurs', 'les éoliennes', 'les araignées', 'les profondeurs marines'],
      correctAnswer: 1,
      timeLimit: 15,
    },
    {
      id: 'q2',
      question: 'Quelle est la position à Isa au hockey?',
      options: ['ailière droite', 'guardienne', 'centre', 'defense gauche'],
      correctAnswer: 2,
      timeLimit: 15,
    },
    {
      id: 'q3',
      question: 'Dans quelle ville est ce que Isa est née?',
      options: ['Montréal', 'Longueuil', 'Ville de Mexico', 'Bogota'],
      correctAnswer: 3,
      timeLimit: 15,
    },
    {
      id: 'q4',
      question: 'Quel est l'artiste de musique préféré à Isa?',
      options: ['Chief Keef', '21 Savage', 'Lana del Rey', 'Harry Styles'],
      correctAnswer: 3,
      timeLimit: 15,
    },
    {
      id: 'q5',
      question: 'Quel animal est sur la pièce de 25 cents?',
      options: ['Orignal', 'Castor', 'Caribou', 'Ours'],
      correctAnswer: 2,
      timeLimit: 15,
    },
    {
      id: 'q6',
      question: 'Quelle est la devise du Québec?',
      options: ['Je me souviens', 'Un pour tous', 'Liberté ou mort', 'À mari usque ad mare'],
      correctAnswer: 0,
      timeLimit: 15,
    },
    {
      id: 'q7',
      question: 'Combien de bières faut-il pour faire un bon pub crawl?',
      options: ['3', '5', 'Jamais assez', 'Dépend du parcours'],
      correctAnswer: 2,
      timeLimit: 10,
    },
    {
      id: 'q8',
      question: 'Quel est l\'ingrédient secret d\'une bonne poutine?',
      options: ['L\'amour', 'Le fromage en grains frais', 'La sauce brune maison', 'Les trois ensemble'],
      correctAnswer: 3,
      timeLimit: 15,
    },
  ],

  // --- POEM CHALLENGE CONFIG ---
  poemConfig: {
    challengeId: 'c4',       // Links to the poem challenge above
    pointsForWinner: 5,      // Points awarded to winning team
    pointsFor2nd: 3,
    pointsFor3rd: 1,
  },

  // --- KAHOOT SCORING ---
  kahootScoring: {
    challengeId: 'c16',
    teamPoints: { 1: 5, 2: 3, 3: 1 },  // rank -> points
    topIndividuals: 3,                     // # of individuals exempt from shot
  },
};

module.exports = DATA;
