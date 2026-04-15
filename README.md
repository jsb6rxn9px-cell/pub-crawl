# 🍺 Pub Crawl — App de gestion de pub crawl par équipes

Application web mobile-first pour gérer un pub crawl par équipes. Hébergée localement sur Windows, utilisée sur téléphones intelligents.

---

## 🚀 Installation rapide (Windows)

### Prérequis
- **Node.js** (version 18+) : télécharger sur [nodejs.org](https://nodejs.org/) (choisir LTS)

### Étapes

1. **Extraire le dossier** `pub-crawl` quelque part sur votre PC

2. **Ouvrir un terminal** dans ce dossier :
   - Clic droit dans le dossier → "Ouvrir dans le terminal"
   - OU : Win+R → `cmd` → `cd C:\chemin\vers\pub-crawl`

3. **Installer les dépendances :**
   ```
   npm install
   ```

4. **Lancer le serveur :**
   ```
   node server.js
   ```

5. Le terminal affichera :
   ```
   🍺 PUB CRAWL APP — Serveur démarré!
   🍺 Local:  http://localhost:3000
   🍺 Réseau: http://192.168.x.x:3000
   ```

6. **Partager le lien réseau** (`http://192.168.x.x:3000`) avec les participants !
   - Tous les téléphones doivent être sur le **même réseau Wi-Fi** que votre PC
   - Astuce : créez un QR code avec ce lien pour faciliter l'accès

### ⚠️ Pare-feu Windows
Si les téléphones ne peuvent pas accéder au site :
- Windows va probablement demander d'autoriser Node.js à travers le pare-feu → **Accepter**
- Si ça ne marche toujours pas : Panneau de configuration → Pare-feu Windows → Autoriser une application → Ajouter Node.js

---

## ⚙️ Configuration — `data.js`

Avant l'événement, éditez le fichier **`data.js`** avec un éditeur de texte (Notepad++, VS Code, etc.) :

### Équipes
```js
teams: [
  { id: 't1', name: 'Les Flamants Roses', color: '#FF6B9D', emoji: '🦩' },
  { id: 't2', name: 'Les Renards Rusés',  color: '#4ECDC4', emoji: '🦊' },
  { id: 't3', name: 'Les Loups Galants',  color: '#FFD93D', emoji: '🐺' },
  // Ajouter une 4e équipe :
  // { id: 't4', name: 'Nom', color: '#A78BFA', emoji: '🦁' },
],
```

### Participants
```js
players: [
  { id: 'admin', name: '👑 Admin', teamId: 't1', isAdmin: true },
  { id: 'p1', name: 'Alex', teamId: 't1' },
  { id: 'p2', name: 'Isa',  teamId: 't1' },
  // etc.
],
```
- Chaque joueur doit avoir un `id` unique et un `teamId` existant
- L'admin doit garder `id: 'admin'` et `isAdmin: true`

### Questions Kahoot
```js
kahootQuestions: [
  {
    id: 'q1',
    question: 'Votre question ici?',
    options: ['Choix A', 'Choix B', 'Choix C', 'Choix D'],
    correctAnswer: 0,  // index du bon choix (0 = A, 1 = B, etc.)
    timeLimit: 15,      // secondes
  },
  // ...
],
```

---

## 📱 Fonctionnalités

### Pour les participants
- **Connexion simple** : choisir son nom dans une liste, aucun mot de passe
- **Page équipe** : voir tous les défis, leur statut, et uploader des preuves (photo/vidéo)
- **Galerie** : consulter les preuves de toutes les équipes
- **Scoreboard** : classement en temps réel
- **Position** : voir la localisation approximative des autres équipes

### Pour l'admin
- **Valider les défis** : toggle on/off pour chaque soumission
- **Points manuels** : ajouter/retirer des points bonus
- **Mode Kahoot** : lancer le quiz, contrôler les questions, voir les résultats
- **Mode Poème** : ouvrir le vote, fermer et afficher les résultats
- **Reset** : tout réinitialiser si nécessaire

### Modes spéciaux

#### 🎮 Kahoot
1. Admin clique "Lancer le Kahoot"
2. Tous les écrans basculent automatiquement en mode Kahoot
3. Admin avance les questions une par une
4. Les participants répondent sur leur téléphone
5. Points calculés selon rapidité + justesse
6. Classement par équipe et individuel à la fin
7. Les 3 meilleurs individus sont exemptés du shot

#### 📝 Poème
1. Admin clique "Ouvrir le vote"
2. Tous les participants votent pour la meilleure équipe
3. Un seul vote par personne
4. Admin ferme le vote → résultats affichés avec barres animées

---

## 🔧 Notes techniques

- **Données persistantes** : l'état est sauvegardé dans `state.json` toutes les 10 secondes
- **Uploads** : stockés dans le dossier `uploads/` (photo + vidéo, max 100 MB)
- **Temps réel** : Socket.IO pour les mises à jour instantanées
- **Géolocalisation** : mise à jour toutes les 30 secondes (nécessite l'autorisation du navigateur)
- **Pas de base de données** : tout fonctionne avec des fichiers JSON, zéro configuration

### Redémarrage
Si vous redémarrez le serveur, les données sont restaurées automatiquement depuis `state.json`. Les participants doivent juste recharger la page.

### Reset complet
Pour repartir de zéro :
- Soit utiliser le bouton Reset dans le panneau admin
- Soit supprimer le fichier `state.json` et relancer le serveur

---

## 📂 Structure du projet
```
pub-crawl/
├── server.js          # Serveur Express + Socket.IO
├── data.js            # Configuration (équipes, joueurs, défis, Kahoot)
├── package.json       # Dépendances Node.js
├── state.json         # État persistant (créé automatiquement)
├── public/
│   ├── index.html     # Page principale
│   ├── css/style.css  # Thème mobile-first sombre
│   └── js/app.js      # Application frontend complète
└── uploads/           # Photos et vidéos uploadées
```
