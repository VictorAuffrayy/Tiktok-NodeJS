// app.js (ou où vous définissez votre application Express)
const express = require('express');
const app = express();
const { Op } = require('sequelize');
const User = require('./User'); // Importer le modèle Sequelize
const Session = require('./Session'); // Importer le modèle de session
const Post = require('./Post'); // Importer le modèle de session
const Comment = require('./Comment'); // Importer le modèle de commentaire
const Reaction = require('./Reaction'); // Importer le modèle de réaction (like sur un commentaire)
const Follow = require('./Follow'); // Importer le modèle d'abonnement (follow)
const PostLike = require('./PostLike'); // Importer le modèle de like sur un post/vidéo
const md5 = require('md5'); // Assurez-vous d'installer md5 avec npm install md5

app.use(express.json());

// Associations Sequelize entre les modèles
User.hasMany(Post, { foreignKey: 'userId' });
Post.belongsTo(User, { foreignKey: 'userId' });

Post.hasMany(Comment, { foreignKey: 'postId' });
Comment.belongsTo(Post, { foreignKey: 'postId' });

User.hasMany(Comment, { foreignKey: 'userId' });
Comment.belongsTo(User, { foreignKey: 'userId' });

Comment.hasMany(Reaction, { foreignKey: 'commentId' });
Reaction.belongsTo(Comment, { foreignKey: 'commentId' });

User.hasMany(Reaction, { foreignKey: 'userId' });
Reaction.belongsTo(User, { foreignKey: 'userId' });

// Follow : relation auto-référencée sur User (followerId suit followingId)
User.belongsToMany(User, { as: 'Following', through: Follow, foreignKey: 'followerId', otherKey: 'followingId' });
User.belongsToMany(User, { as: 'FollowedBy', through: Follow, foreignKey: 'followingId', otherKey: 'followerId' });
Follow.belongsTo(User, { as: 'FollowerUser', foreignKey: 'followerId' });
Follow.belongsTo(User, { as: 'FollowingUser', foreignKey: 'followingId' });

// PostLike : like sur un post/vidéo (distinct de Reaction qui porte sur les commentaires)
Post.hasMany(PostLike, { foreignKey: 'postId' });
PostLike.belongsTo(Post, { foreignKey: 'postId' });
User.hasMany(PostLike, { foreignKey: 'userId' });
PostLike.belongsTo(User, { foreignKey: 'userId' });

// Liste de mots interdits pour la modération des commentaires
const BLACKLISTED_KEYWORDS = ['spam', 'arnaque', 'insulte'];

const hashPassword = (password) => {
  // use md5
  const newPassword = password + 'salt'; // Ajouter un sel pour renforcer la sécurité
  return md5(newPassword); // Remplacez ceci par le mot de passe haché
}

// Vérifie le token d'authentification et renvoie l'utilisateur associé.
// En cas d'échec, envoie directement la réponse d'erreur et renvoie null
// (le caller doit alors faire `if (!user) return;`).
const requireAuth = async (req, res) => {
  const token = req.headers['authorization'];
  if (!token) {
    res.status(401).json({ error: 'Token is required' });
    return null;
  }
  const session = await Session.findOne({ where: { token } });
  if (!session) {
    res.status(401).json({ error: 'Invalid token' });
    return null;
  }
  const user = await User.findByPk(session.userId);
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return null;
  }
  return user;
};

// Génère un username disponible à partir de l'email (ou du nom), utilisé
// quand l'utilisateur ne fournit pas explicitement de pseudo à l'inscription.
const generateUsername = async (email, name) => {
  let base = (email ? email.split('@')[0] : name || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  if (!base) base = 'user';

  let username = base;
  let counter = 1;
  while (await User.findOne({ where: { username } })) {
    username = `${base}${counter}`;
    counter++;
  }
  return username;
};

// Lit ?limit=&?offset= sur la requête avec des bornes raisonnables par défaut,
// pour éviter de renvoyer des listes illimitées (feed, users, followers...).
const parsePagination = (req, defaultLimit = 20, maxLimit = 100) => {
  let limit = parseInt(req.query.limit, 10);
  let offset = parseInt(req.query.offset, 10);
  if (!Number.isInteger(limit) || limit <= 0) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  if (!Number.isInteger(offset) || offset < 0) offset = 0;
  return { limit, offset };
};

// Extrait les hashtags (#exemple) d'un texte -> tableau de tags uniques, en minuscules
const extractHashtags = (text) => {
  if (!text) return [];
  const matches = text.match(/#[a-zA-Z0-9_]+/g) || [];
  return [...new Set(matches.map((h) => h.slice(1).toLowerCase()))];
};

// Convertit le champ hashtags (stocké en JSON stringifié) en tableau JS
const parseHashtags = (raw) => {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

// Route pour créer un utilisateur
app.post('/signup', async (req, res) => {
  const { name, email, password, username, bio, avatar } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  if (!/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    return res.status(400).json({ error: 'Email already in use' });
  }

  // Le username est optionnel : s'il n'est pas fourni, on en génère un à partir
  // de l'email (comportement à la TikTok : @pseudo public + nom d'affichage).
  let finalUsername = username;
  if (finalUsername) {
    const existingUsername = await User.findOne({ where: { username: finalUsername } });
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already taken' });
    }
  } else {
    finalUsername = await generateUsername(email, name);
  }

  const passwordEncrypted = hashPassword(password); // Implémentez cette fonction pour chiffrer les mots de passe
  try {
    const user = await User.create({
      name,
      email,
      password: passwordEncrypted,
      username: finalUsername,
      bio: bio || null,
      avatar: avatar || null
    });
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await User.findOne({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const passwordEncrypted = hashPassword(password);
  if (user.password !== passwordEncrypted) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Générer un token de session (vous pouvez utiliser une bibliothèque comme uuid ou crypto)
  const token = require('crypto').randomBytes(64).toString('hex');
  const expirationDate = new Date(Date.now() + 60 * 60 * 1000); // Expiration dans 1 heure

  // Créer une session dans la base de données
  await Session.create({ token, expirationDate, userId: user.id });

  res.json({ token, expirationDate });
});

app.post('/logout', async (req, res) => {
  const {token } = req.body;
  const session = await Session.findOne({ where: { token } });
  if (!session) {
    return res.status(400).json({ error: 'Invalid token' });
  }
  session.destroy();
  res.json({ message: 'Logged out successfully' });
});

app.post('/users', async (req, res) => {
  const { name, email, password, username, bio, avatar } = req.body;
  const passwordEncrypted = hashPassword(password);
  try {
    const finalUsername = username || await generateUsername(email, name);
    const user = await User.create({
      name,
      email,
      password: passwordEncrypted,
      username: finalUsername,
      bio: bio || null,
      avatar: avatar || null
    });
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/posts', async (req, res) => {
  const { title, content, videoUrl, thumbnail, duration } = req.body;
  const token = req.headers['authorization'];
  // Vérifier si le token est présent
  if (!token) {
    return res.status(401).json({ error: 'Token is required' });
  }

  // Vérifier si le token est valide et récupérer l'utilisateur associé
  const session = await Session.findOne({ where: { token } });
  if (!session) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const userId = session.userId;

  // Vérifier si l'utilisateur existe
  const user = await User.findByPk(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  try {
    // Créer le post avec l'ID de l'utilisateur associé
    // (videoUrl/thumbnail/duration sont optionnels pour rester compatible
    // avec les anciens posts texte)
    const hashtags = extractHashtags(`${title || ''} ${content || ''}`);
    const post = await Post.create({
      title,
      content,
      userId,
      videoUrl,
      thumbnail,
      duration,
      hashtags: JSON.stringify(hashtags)
    });
    res.status(201).json({ ...post.toJSON(), hashtags });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Route pour créer un commentaire
app.post('/comment', async (req, res) => {
  const token = req.headers['authorization'];
  // Vérifier si le token est présent
  if (!token) {
    return res.status(401).json({ error: 'Token is required' });
  }

  // Vérifier si le token est valide et récupérer l'utilisateur associé
  const session = await Session.findOne({ where: { token } });
  if (!session) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const userId = session.userId;

  // Vérifier si l'utilisateur existe
  const user = await User.findByPk(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  const { postId, content } = req.body;
  if (!postId || !content) {
    return res.status(400).json({ error: 'postId and content are required' });
  }

  // Vérifier la présence de mots interdits dans le commentaire
  const lowerCaseContent = content.toLowerCase();
  const containsBlacklistedWord = BLACKLISTED_KEYWORDS.some((word) =>
    lowerCaseContent.includes(word.toLowerCase())
  );
  if (containsBlacklistedWord) {
    return res.status(422).json({ error: 'Comment contains forbidden content' });
  }

  try {
    // Créer le commentaire avec l'ID de l'utilisateur et l'ID du post associés
    const comment = await Comment.create({ userId, postId, textComment: content });
    res.status(201).json(comment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Route pour réagir (like) à un commentaire, avec toggle si déjà réagi
app.post('/reaction', async (req, res) => {
  const token = req.headers['authorization'];
  // Vérifier si le token est présent
  if (!token) {
    return res.status(401).json({ error: 'Token is required' });
  }

  // Vérifier si le token est valide et récupérer l'utilisateur associé
  const session = await Session.findOne({ where: { token } });
  if (!session) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const userId = session.userId;

  // Vérifier si l'utilisateur existe
  const user = await User.findByPk(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  const { commentId, reactionType } = req.body;

  // Vérifier que le commentaire existe
  const comment = await Comment.findByPk(commentId);
  if (!comment) {
    return res.status(401).json({ error: 'Comment not found' });
  }

  try {
    // Vérifier si l'utilisateur a déjà réagi à ce commentaire
    const existingReaction = await Reaction.findOne({ where: { userId, commentId } });

    if (existingReaction) {
      // Déjà réagi -> on retire la réaction (dislike / toggle off)
      await existingReaction.destroy();
      return res.status(200).json({ message: 'Reaction removed' });
    }

    // Pas encore réagi -> on crée la réaction (like)
    const reaction = await Reaction.create({ userId, commentId, reactionType });
    res.status(201).json(reaction);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/posts', async (req, res) => {
  const token = req.headers['authorization'];
  // Vérifier si le token est présent
  if (!token) {
    return res.status(401).json({ error: 'Token is required' });
  }

  // Vérifier si le token est valide et récupérer l'utilisateur associé
  const session = await Session.findOne({ where: { token } });
  if (!session) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const userId = session.userId;

  // Vérifier si l'utilisateur existe
  const user = await User.findByPk(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  try {
    // Récupérer tous les posts avec l'ID de l'utilisateur associé
    const post = await Post.findAll({where: { userId } });
    res.status(201).json(post);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/me', async (req, res) => {
  const token = req.headers['authorization'];
  // Vérifier si le token est présent
  if (!token) {
    return res.status(401).json({ error: 'Token is required' });
  }

  // Vérifier si le token est valide et récupérer l'utilisateur associé
  const session = await Session.findOne({ where: { token } });
  if (!session) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const userId = session.userId;

  // Vérifier si l'utilisateur existe
  const user = await User.findByPk(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  try {
    // Récupérer les posts de l'utilisateur, avec pour chacun ses commentaires,
    // et pour chaque commentaire ses réactions (jointure imbriquée Post -> Comment -> Reaction)
    const posts = await Post.findAll({
      where: { userId },
      include: [
        {
          model: Comment,
          include: [
            {
              model: Reaction
            }
          ]
        }
      ]
    });
    res.status(200).json({ user, posts });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Autres routes CRUD (GET par ID, PUT,
// Route pour obtenir tous les utilisateurs
app.get('/users', async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req, 50, 200);
    const total = await User.count();
    const users = await User.findAll({ limit, offset });
    res.setHeader('X-Total-Count', total);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------
// Profil utilisateur (à la TikTok : username, bio, avatar, compteurs)
// ---------------------------------------------------------------------

// Mettre à jour son propre profil
app.patch('/profile', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const { username, bio, avatar, name } = req.body;
  try {
    if (username && username !== user.username) {
      const existing = await User.findOne({ where: { username } });
      if (existing) {
        return res.status(400).json({ error: 'Username already taken' });
      }
      user.username = username;
    }
    if (name !== undefined) user.name = name;
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Consulter le profil public de n'importe quel utilisateur (followers,
// following, nombre de posts, nombre de likes cumulés sur ses posts)
app.get('/users/:id/profile', async (req, res) => {
  try {
    const targetUser = await User.findByPk(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const followersCount = await Follow.count({ where: { followingId: targetUser.id } });
    const followingCount = await Follow.count({ where: { followerId: targetUser.id } });
    const postsCount = await Post.count({ where: { userId: targetUser.id } });

    const userPosts = await Post.findAll({ where: { userId: targetUser.id }, attributes: ['id'] });
    const postIds = userPosts.map((p) => p.id);
    const likesCount = postIds.length ? await PostLike.count({ where: { postId: postIds } }) : 0;

    res.json({
      id: targetUser.id,
      name: targetUser.name,
      username: targetUser.username,
      bio: targetUser.bio,
      avatar: targetUser.avatar,
      followersCount,
      followingCount,
      postsCount,
      likesCount
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Liste des followers d'un utilisateur
app.get('/users/:id/followers', async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req);
    const total = await Follow.count({ where: { followingId: req.params.id } });
    const follows = await Follow.findAll({
      where: { followingId: req.params.id },
      include: [{ model: User, as: 'FollowerUser', attributes: ['id', 'name', 'username', 'avatar'] }],
      limit,
      offset
    });
    res.setHeader('X-Total-Count', total);
    res.json(follows.map((f) => f.FollowerUser));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Liste des comptes suivis par un utilisateur
app.get('/users/:id/following', async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req);
    const total = await Follow.count({ where: { followerId: req.params.id } });
    const follows = await Follow.findAll({
      where: { followerId: req.params.id },
      include: [{ model: User, as: 'FollowingUser', attributes: ['id', 'name', 'username', 'avatar'] }],
      limit,
      offset
    });
    res.setHeader('X-Total-Count', total);
    res.json(follows.map((f) => f.FollowingUser));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------
// Follow (abonnements), avec toggle comme pour /reaction
// ---------------------------------------------------------------------
app.post('/follow', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const { followingId } = req.body;
  if (!followingId) {
    return res.status(400).json({ error: 'followingId is required' });
  }
  if (parseInt(followingId, 10) === user.id) {
    return res.status(400).json({ error: 'You cannot follow yourself' });
  }

  const targetUser = await User.findByPk(followingId);
  if (!targetUser) {
    return res.status(404).json({ error: 'User to follow not found' });
  }

  try {
    const existing = await Follow.findOne({ where: { followerId: user.id, followingId } });
    if (existing) {
      // Déjà suivi -> on se désabonne (toggle off)
      await existing.destroy();
      return res.status(200).json({ message: 'Unfollowed' });
    }
    const follow = await Follow.create({ followerId: user.id, followingId });
    res.status(201).json(follow);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------
// Likes sur les posts/vidéos (distinct des reactions sur commentaires)
// ---------------------------------------------------------------------
app.post('/posts/:postId/like', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const post = await Post.findByPk(req.params.postId);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  try {
    const existing = await PostLike.findOne({ where: { userId: user.id, postId: post.id } });
    if (existing) {
      // Déjà liké -> on retire le like (toggle off)
      await existing.destroy();
      return res.status(200).json({ message: 'Like removed' });
    }
    const like = await PostLike.create({ userId: user.id, postId: post.id });
    res.status(201).json(like);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------
// Feed "For You" : posts des comptes suivis en priorité, puis les posts
// les plus likés parmi le reste (fallback simple type "trending").
// L'authentification est optionnelle : sans token, on renvoie juste le
// feed trending (comme un visiteur non connecté sur TikTok).
// ---------------------------------------------------------------------
app.get('/feed', async (req, res) => {
  const token = req.headers['authorization'];
  let currentUserId = null;
  if (token) {
    const session = await Session.findOne({ where: { token } });
    if (session) currentUserId = session.userId;
  }

  try {
    const { limit, offset } = parsePagination(req);
    let followingIds = [];
    if (currentUserId) {
      const follows = await Follow.findAll({ where: { followerId: currentUserId } });
      followingIds = follows.map((f) => f.followingId);
    }

    const posts = await Post.findAll({
      include: [
        { model: User, attributes: ['id', 'name', 'username', 'avatar'] },
        { model: Comment },
        { model: PostLike }
      ],
      order: [['createdAt', 'DESC']]
    });

    const feed = posts.map((post) => {
      const p = post.toJSON();
      const likesCount = p.PostLikes ? p.PostLikes.length : 0;
      const commentsCount = p.Comments ? p.Comments.length : 0;
      const isLiked = currentUserId ? p.PostLikes.some((l) => l.userId === currentUserId) : false;
      const isFollowingAuthor = followingIds.includes(p.userId);
      delete p.PostLikes;
      delete p.Comments;
      p.hashtags = parseHashtags(p.hashtags);
      return { ...p, likesCount, commentsCount, isLiked, isFollowingAuthor };
    });

    // Posts des comptes suivis d'abord (ordre chronologique déjà appliqué),
    // puis le reste trié par popularité (proxy simple d'un algo "For You").
    const followingPosts = feed.filter((p) => p.isFollowingAuthor);
    const otherPosts = feed
      .filter((p) => !p.isFollowingAuthor)
      .sort((a, b) => b.likesCount - a.likesCount);

    const merged = [...followingPosts, ...otherPosts];
    res.setHeader('X-Total-Count', merged.length);
    res.json(merged.slice(offset, offset + limit));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Autres routes CRUD (GET par ID, PUT, DELETE) similaires...

// ---------------------------------------------------------------------
// Compteur de vues (simple : pas de dédoublonnage par utilisateur,
// chaque appel incrémente le compteur, comme un "play count" basique)
// ---------------------------------------------------------------------
app.post('/posts/:id/view', async (req, res) => {
  const post = await Post.findByPk(req.params.id);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  try {
    post.views += 1;
    await post.save();
    res.status(200).json({ views: post.views });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------
// Suppression (seul l'auteur peut supprimer son propre contenu)
// ---------------------------------------------------------------------
app.delete('/posts/:id', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const post = await Post.findByPk(req.params.id);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  if (post.userId !== user.id) {
    return res.status(403).json({ error: 'You can only delete your own posts' });
  }

  try {
    // Nettoyage manuel des dépendances (pas de cascade configurée sur SQLite ici)
    const comments = await Comment.findAll({ where: { postId: post.id }, attributes: ['id'] });
    const commentIds = comments.map((c) => c.id);
    if (commentIds.length) {
      await Reaction.destroy({ where: { commentId: commentIds } });
    }
    await Comment.destroy({ where: { postId: post.id } });
    await PostLike.destroy({ where: { postId: post.id } });
    await post.destroy();
    res.status(200).json({ message: 'Post deleted' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/comment/:id', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  const comment = await Comment.findByPk(req.params.id);
  if (!comment) {
    return res.status(404).json({ error: 'Comment not found' });
  }
  if (comment.userId !== user.id) {
    return res.status(403).json({ error: 'You can only delete your own comments' });
  }

  try {
    await Reaction.destroy({ where: { commentId: comment.id } });
    await comment.destroy();
    res.status(200).json({ message: 'Comment deleted' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------
// Hashtags & recherche
// ---------------------------------------------------------------------

// Tous les posts contenant un hashtag donné (ex: GET /hashtags/judo)
app.get('/hashtags/:tag', async (req, res) => {
  const tag = req.params.tag.toLowerCase().replace(/^#/, '');
  const { limit, offset } = parsePagination(req);

  try {
    const posts = await Post.findAll({
      where: { hashtags: { [Op.like]: `%"${tag}"%` } },
      include: [{ model: User, attributes: ['id', 'name', 'username', 'avatar'] }],
      order: [['createdAt', 'DESC']]
    });

    // Double vérification exacte (le LIKE peut remonter des faux positifs
    // sur des tags partiellement identiques, ex: "judo" vs "judoclub")
    const filtered = posts.filter((p) => parseHashtags(p.hashtags).includes(tag));

    res.setHeader('X-Total-Count', filtered.length);
    const paginated = filtered.slice(offset, offset + limit).map((p) => ({
      ...p.toJSON(),
      hashtags: parseHashtags(p.hashtags)
    }));
    res.json(paginated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Recherche globale : utilisateurs (name/username) + posts (title/content)
app.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'q query parameter is required' });
  }
  const { limit, offset } = parsePagination(req);

  try {
    const users = await User.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.like]: `%${q}%` } },
          { username: { [Op.like]: `%${q}%` } }
        ]
      },
      attributes: ['id', 'name', 'username', 'avatar'],
      limit,
      offset
    });

    const posts = await Post.findAll({
      where: {
        [Op.or]: [
          { title: { [Op.like]: `%${q}%` } },
          { content: { [Op.like]: `%${q}%` } }
        ]
      },
      limit,
      offset
    });

    res.json({
      users,
      posts: posts.map((p) => ({ ...p.toJSON(), hashtags: parseHashtags(p.hashtags) }))
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Exporter l'app pour les tests
module.exports = app;

// Lancer le serveur seulement si ce fichier est exécuté directement
if (require.main === module) {
  const PORT = 80;
  app.listen(PORT, () => {
    console.log(`Le serveur Express écoute sur le port ${PORT}`);
  });
}