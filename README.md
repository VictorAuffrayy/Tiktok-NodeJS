# TikTok NodeJS

API REST inspirée de TikTok, développée en Node.js / Express avec Sequelize (SQLite). Permet de gérer des comptes utilisateurs, publier des vidéos, suivre d'autres utilisateurs, aimer et commenter des posts, avec un feed personnalisé.

## Stack technique

- **Node.js** / **Express** — serveur HTTP et routage
- **Sequelize** + **SQLite** — ORM et base de données
- **Mocha** / **Chai** / **Supertest** — tests automatisés
- **NYC** — couverture de code
- **ESLint** — analyse statique du code

## Installation

```bash
npm install
```

## Lancer le serveur

```bash
npm start
```

## Lancer les tests

```bash
npm test
```

Les tests couvrent l'authentification, les posts, les commentaires, les réactions, les follows, les likes, le feed, les hashtags, la recherche et la pagination (`app_test.js`, `tiktok_test.js`, `advanced_test.js`).

## Couverture de code

```bash
npm run coverage
```

Génère un rapport de couverture (texte, HTML, lcov) dans le dossier `coverage/`.

## Linting

Le projet utilise ESLint pour détecter les erreurs et incohérences de code.

```bash
npx eslint .
```

Aucune sortie = aucun problème détecté. Pour corriger automatiquement ce qui peut l'être :

```bash
npx eslint . --fix
```

La configuration (`eslint.config.mjs`) cible un environnement Node.js en CommonJS, avec les globals Mocha activés pour les fichiers de test (`*_test.js`).

## Fonctionnalités principales

### Authentification
- `POST /signup` — inscription (génère un `username` automatiquement si non fourni)
- `POST /login` — connexion, retourne un token de session
- `POST /logout` — déconnexion

### Profil utilisateur
- `GET /me` — profil de l'utilisateur connecté
- `GET /users` — liste des utilisateurs (paginable)
- `GET /users/:id/profile` — profil public (followers, following, posts, likes)
- `PATCH /profile` — mise à jour du profil (bio, avatar, username)

### Posts / vidéos
- `POST /posts` — création d'un post (titre, contenu, vidéo, miniature, durée, hashtags auto-extraits)
- `GET /posts` — liste des posts
- `DELETE /posts/:id` — suppression (auteur uniquement)
- `POST /posts/:id/view` — incrémente le compteur de vues
- `POST /posts/:postId/like` — like / unlike (toggle)

### Commentaires et réactions
- `POST /comment` — commenter un post
- `DELETE /comment/:id` — suppression (auteur uniquement)
- `POST /reaction` — réagir à un commentaire (toggle)

### Réseau social
- `POST /follow` — suivre / ne plus suivre (toggle)
- `GET /users/:id/followers` — liste des followers
- `GET /users/:id/following` — liste des comptes suivis
- `GET /feed` — fil d'actualité (priorise les comptes suivis)

### Découverte
- `GET /hashtags/:tag` — posts associés à un hashtag
- `GET /search?q=` — recherche d'utilisateurs et de posts

## Structure du projet

```
.
├── app.js              # Point d'entrée, routes Express
├── sequelize.js         # Configuration de la connexion Sequelize
├── User.js               # Modèle utilisateur
├── Post.js               # Modèle post/vidéo
├── Comment.js            # Modèle commentaire
├── Reaction.js           # Modèle réaction sur commentaire
├── Follow.js              # Modèle abonnement (follow)
├── Postlike.js            # Modèle like sur post
├── Session.js             # Modèle session (token d'authentification)
├── app_test.js            # Tests des fonctionnalités de base
├── tiktok_test.js         # Tests des fonctionnalités TikTok (feed, follow, like...)
├── advanced_test.js       # Tests avancés (pagination, suppression, recherche, hashtags)
├── eslint.config.mjs      # Configuration ESLint
└── .nycrc.json            # Configuration de la couverture de code