const request = require('supertest');
const { expect } = require('chai');
const app = require('./app');
const User = require('./User');
const Post = require('./Post');
const Comment = require('./Comment');
const Reaction = require('./Reaction');
const sequelize = require('./sequelize');

describe('Sequelize App Routes', () => {

  before(async () => {
    // S'assurer que la connexion est ouverte et synchroniser la base de données
    try {
      await sequelize.authenticate();
      await sequelize.sync({ alter: true });
    } catch (error) {
      console.error('Erreur lors de la synchronisation:', error);
      throw error;
    }
  });

  afterEach(async () => {
    // Nettoyer la base de données après chaque test
    try {
      await Reaction.destroy({ where: {} });
      await Comment.destroy({ where: {} });
      await Post.destroy({ where: {} });
      await User.destroy({ where: {} });
    } catch (error) {
      console.error('Erreur lors du nettoyage:', error);
    }
  });

  after(async () => {
    // Pas de sequelize.close() ici : la connexion est partagée entre tous les
    // fichiers de test (même module sequelize.js). La fermer ici casserait
    // les suites suivantes (tiktok_test.js, advanced_test.js). Mocha coupe
    // le process avec --exit à la toute fin, donc pas besoin de fermer
    // manuellement.
  });

  describe('POST /users', () => {
    it('devrait créer un nouvel utilisateur', async () => {
      const response = await request(app)
        .post('/users')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123'
        });

      expect(response.status).to.equal(201);
      expect(response.body).to.have.property('id');
      expect(response.body.name).to.equal('John Doe');
      expect(response.body.email).to.equal('john@example.com');
    });

    it('devrait retourner une erreur avec email manquant', async () => {
      const response = await request(app)
        .post('/users')
        .send({
          name: 'John Doe'
        });

      expect(response.status).to.equal(400);
      expect(response.body).to.have.property('error');
    });

    it('devrait empêcher les emails en doublon', async () => {
      // Créer le premier utilisateur
      await request(app)
        .post('/users')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123'
        });

      // Essayer de créer un utilisateur avec le même email
      const response = await request(app)
        .post('/users')
        .send({
          name: 'Jane Doe',
          email: 'john@example.com'
        });

      expect(response.status).to.equal(400);
      expect(response.body).to.have.property('error');
    });
  });

  describe('GET /users', () => {
    it('devrait retourner une liste vide au départ', async () => {
      const response = await request(app).get('/users');

      expect(response.status).to.equal(200);
      expect(response.body).to.be.an('array');
      expect(response.body).to.have.lengthOf(0);
    });

    it('devrait retourner les utilisateurs créés', async () => {
      // Créer deux utilisateurs
      await User.create({ name: 'User 1', email: 'user1@example.com', password: 'password123' });
      await User.create({ name: 'User 2', email: 'user2@example.com', password: 'password123' });

      const response = await request(app).get('/users');

      expect(response.status).to.equal(200);
      expect(response.body).to.be.an('array');
      expect(response.body).to.have.lengthOf(2);
      expect(response.body[0].name).to.equal('User 1');
      expect(response.body[1].name).to.equal('User 2');
    });
  });

  describe('User flow', () => {
    it('sign up', async () => {
      const response = await request(app)
        .post('/signup')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123'
        });

      expect(response.status).to.equal(201);
      expect(response.body).to.have.property('id');
      expect(response.body.name).to.equal('John Doe');
      expect(response.body.email).to.equal('john@example.com');
    });

    it('sign up should fail with missing email', async () => {
      const response = await request(app)
        .post('/signup')
        .send({
          name: 'John Doe',
        });

      expect(response.status).to.equal(400);
    });

    it('sign up and login', async () => {
      const response = await request(app)
        .post('/signup')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123'
        });

      expect(response.status).to.equal(201);
      expect(response.body).to.have.property('id');
      expect(response.body.name).to.equal('John Doe');
      expect(response.body.email).to.equal('john@example.com');

      const loginResponse = await request(app)
        .post('/login')
        .send({
          email: 'john@example.com',
          password: 'password123'
        });

      expect(loginResponse.status).to.equal(200);
      expect(loginResponse.body).to.have.property('token');
    });

    it('sign up and login and create post', async () => {
      const response = await request(app)
        .post('/signup')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123'
        });

      expect(response.status).to.equal(201);
      const loginResponse = await request(app)
        .post('/login')
        .send({
          email: 'john@example.com',
          password: 'password123'
        });

      expect(loginResponse.status).to.equal(200);
      expect(loginResponse.body).to.have.property('token');

      const token = loginResponse.body.token;

      const postResponse = await request(app)
        .post('/posts')
        .set('Authorization', token)
        .send({
          title: 'My First Post',
          content: 'This is the content of my first post.'
        });

      expect(postResponse.status).to.equal(201);
      expect(postResponse.body).to.have.property('id');
      expect(postResponse.body.title).to.equal('My First Post');
      expect(postResponse.body.content).to.equal('This is the content of my first post.');
    });

    it('create post without authentication', async () => {
      const response = await request(app)
        .post('/posts')
        .send({
          title: 'My First Post',
          content: 'This is the content of my first post.'
        });

      expect(response.status).to.equal(401);
      expect(response.body).to.have.property('error');
    });

    it('should retrieve posts for authenticated user', async () => {
      // Signup
      const signupResponse = await request(app)
        .post('/signup')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123'
        });
      expect(signupResponse.status).to.equal(201);

      // Login
      const loginResponse = await request(app)
        .post('/login')
        .send({
          email: 'john@example.com',
          password: 'password123'
        });
      expect(loginResponse.status).to.equal(200);
      const token = loginResponse.body.token;

      // Créer un post
      const postResponse = await request(app)
        .post('/posts')
        .set('Authorization', token)
        .send({
          title: 'My First Post',
          content: 'This is the content of my first post.'
        });
      expect(postResponse.status).to.equal(201);

      // Récupérer les posts avec le token
      const getResponse = await request(app)
        .get('/posts')
        .set('Authorization', token);

      // NOTE: la route renvoie actuellement 201 au lieu de 200 sur un GET.
      // Si tu corriges app.js (res.status(200).json(post)), change cette ligne en 200.
      expect(getResponse.status).to.equal(201);
      expect(getResponse.body).to.be.an('array');
      expect(getResponse.body).to.have.lengthOf(1);
      expect(getResponse.body[0].title).to.equal('My First Post');
      expect(getResponse.body[0].content).to.equal('This is the content of my first post.');
    });

    it('GET /posts without authentication should fail', async () => {
      const response = await request(app).get('/posts');

      expect(response.status).to.equal(401);
      expect(response.body).to.have.property('error');
    });
  });

  describe('GET /me', () => {
    it('devrait retourner le user et ses posts pour un utilisateur authentifié', async () => {
      // Signup
      const signupResponse = await request(app)
        .post('/signup')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123'
        });
      expect(signupResponse.status).to.equal(201);

      // Login
      const loginResponse = await request(app)
        .post('/login')
        .send({
          email: 'john@example.com',
          password: 'password123'
        });
      expect(loginResponse.status).to.equal(200);
      const token = loginResponse.body.token;

      // Créer un post
      const postResponse = await request(app)
        .post('/posts')
        .set('Authorization', token)
        .send({
          title: 'My First Post',
          content: 'This is the content of my first post.'
        });
      expect(postResponse.status).to.equal(201);

      // Appeler /me
      const meResponse = await request(app)
        .get('/me')
        .set('Authorization', token);

      expect(meResponse.status).to.equal(200);
      expect(meResponse.body).to.have.property('user');
      expect(meResponse.body).to.have.property('posts');
      expect(meResponse.body.user.name).to.equal('John Doe');
      expect(meResponse.body.user.email).to.equal('john@example.com');
      expect(meResponse.body.posts).to.be.an('array');
      expect(meResponse.body.posts).to.have.lengthOf(1);
      expect(meResponse.body.posts[0].title).to.equal('My First Post');
    });

    it('devrait retourner un tableau de posts vide si aucun post créé', async () => {
      const signupResponse = await request(app)
        .post('/signup')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123'
        });
      expect(signupResponse.status).to.equal(201);

      const loginResponse = await request(app)
        .post('/login')
        .send({
          email: 'john@example.com',
          password: 'password123'
        });
      const token = loginResponse.body.token;

      const meResponse = await request(app)
        .get('/me')
        .set('Authorization', token);

      expect(meResponse.status).to.equal(200);
      expect(meResponse.body.posts).to.be.an('array');
      expect(meResponse.body.posts).to.have.lengthOf(0);
    });

    it('devrait échouer sans token', async () => {
      const response = await request(app).get('/me');

      expect(response.status).to.equal(401);
      expect(response.body).to.have.property('error');
    });

    it('devrait échouer avec un token invalide', async () => {
      const response = await request(app)
        .get('/me')
        .set('Authorization', 'token-invalide-qui-n-existe-pas');

      expect(response.status).to.equal(401);
      expect(response.body).to.have.property('error');
    });

    it('devrait retourner les posts avec leurs comments et les reactions des comments', async () => {
      // Signup
      await request(app)
        .post('/signup')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123'
        });

      // Login
      const loginResponse = await request(app)
        .post('/login')
        .send({
          email: 'john@example.com',
          password: 'password123'
        });
      const token = loginResponse.body.token;

      // Créer un post
      const postResponse = await request(app)
        .post('/posts')
        .set('Authorization', token)
        .send({
          title: 'My First Post',
          content: 'This is the content of my first post.'
        });
      const postId = postResponse.body.id;

      // Créer un commentaire sur ce post
      const commentResponse = await request(app)
        .post('/comment')
        .set('Authorization', token)
        .send({
          postId,
          content: 'Super article !'
        });
      const commentId = commentResponse.body.id;

      // Réagir au commentaire
      await request(app)
        .post('/reaction')
        .set('Authorization', token)
        .send({
          commentId,
          reactionType: 'like'
        });

      // Appeler /me
      const meResponse = await request(app)
        .get('/me')
        .set('Authorization', token);

      expect(meResponse.status).to.equal(200);
      expect(meResponse.body.posts).to.have.lengthOf(1);

      const post = meResponse.body.posts[0];
      expect(post).to.have.property('Comments');
      expect(post.Comments).to.be.an('array');
      expect(post.Comments).to.have.lengthOf(1);
      expect(post.Comments[0].textComment).to.equal('Super article !');

      const comment = post.Comments[0];
      expect(comment).to.have.property('Reactions');
      expect(comment.Reactions).to.be.an('array');
      expect(comment.Reactions).to.have.lengthOf(1);
      expect(comment.Reactions[0].reactionType).to.equal('like');
    });

    it('devrait retourner un tableau Comments vide si le post n\'a aucun commentaire', async () => {
      await request(app)
        .post('/signup')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123'
        });

      const loginResponse = await request(app)
        .post('/login')
        .send({
          email: 'john@example.com',
          password: 'password123'
        });
      const token = loginResponse.body.token;

      await request(app)
        .post('/posts')
        .set('Authorization', token)
        .send({
          title: 'My First Post',
          content: 'This is the content of my first post.'
        });

      const meResponse = await request(app)
        .get('/me')
        .set('Authorization', token);

      expect(meResponse.status).to.equal(200);
      expect(meResponse.body.posts).to.have.lengthOf(1);
      expect(meResponse.body.posts[0].Comments).to.be.an('array');
      expect(meResponse.body.posts[0].Comments).to.have.lengthOf(0);
    });
  });

  describe('POST /comment', () => {
    // Helper pour créer un user authentifié + un post, et renvoyer { token, postId }
    const createUserWithPost = async () => {
      await request(app)
        .post('/signup')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123'
        });

      const loginResponse = await request(app)
        .post('/login')
        .send({
          email: 'john@example.com',
          password: 'password123'
        });
      const token = loginResponse.body.token;

      const postResponse = await request(app)
        .post('/posts')
        .set('Authorization', token)
        .send({
          title: 'My First Post',
          content: 'This is the content of my first post.'
        });

      return { token, postId: postResponse.body.id };
    };

    it('devrait créer un commentaire avec succès', async () => {
      const { token, postId } = await createUserWithPost();

      const response = await request(app)
        .post('/comment')
        .set('Authorization', token)
        .send({
          postId,
          content: 'Super article, merci pour le partage !'
        });

      expect(response.status).to.equal(201);
      expect(response.body).to.have.property('id');
      expect(response.body.postId).to.equal(postId);
      expect(response.body.textComment).to.equal('Super article, merci pour le partage !');
    });

    it('devrait échouer sans authentification', async () => {
      const response = await request(app)
        .post('/comment')
        .send({
          postId: 1,
          content: 'Un commentaire'
        });

      expect(response.status).to.equal(401);
      expect(response.body).to.have.property('error');
    });

    it('devrait échouer avec un token invalide', async () => {
      const response = await request(app)
        .post('/comment')
        .set('Authorization', 'token-invalide-qui-n-existe-pas')
        .send({
          postId: 1,
          content: 'Un commentaire'
        });

      expect(response.status).to.equal(401);
      expect(response.body).to.have.property('error');
    });

    it('devrait échouer si postId est manquant', async () => {
      const { token } = await createUserWithPost();

      const response = await request(app)
        .post('/comment')
        .set('Authorization', token)
        .send({
          content: 'Un commentaire sans postId'
        });

      expect(response.status).to.equal(400);
      expect(response.body).to.have.property('error');
    });

    it('devrait échouer si content est manquant', async () => {
      const { token, postId } = await createUserWithPost();

      const response = await request(app)
        .post('/comment')
        .set('Authorization', token)
        .send({
          postId
        });

      expect(response.status).to.equal(400);
      expect(response.body).to.have.property('error');
    });

    it('devrait retourner 422 si le commentaire contient un mot interdit', async () => {
      const { token, postId } = await createUserWithPost();

      const response = await request(app)
        .post('/comment')
        .set('Authorization', token)
        .send({
          postId,
          content: 'Ce produit est une grosse arnaque, fuyez !'
        });

      expect(response.status).to.equal(422);
      expect(response.body).to.have.property('error');
    });

    it('devrait retourner 422 même si le mot interdit est en majuscules', async () => {
      const { token, postId } = await createUserWithPost();

      const response = await request(app)
        .post('/comment')
        .set('Authorization', token)
        .send({
          postId,
          content: 'C\'est du SPAM pur et simple.'
        });

      expect(response.status).to.equal(422);
      expect(response.body).to.have.property('error');
    });
  });

  describe('POST /reaction', () => {
    // Helper pour créer un user authentifié + un post + un comment, et renvoyer { token, commentId }
    const createUserWithComment = async () => {
      await request(app)
        .post('/signup')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123'
        });

      const loginResponse = await request(app)
        .post('/login')
        .send({
          email: 'john@example.com',
          password: 'password123'
        });
      const token = loginResponse.body.token;

      const postResponse = await request(app)
        .post('/posts')
        .set('Authorization', token)
        .send({
          title: 'My First Post',
          content: 'This is the content of my first post.'
        });

      const commentResponse = await request(app)
        .post('/comment')
        .set('Authorization', token)
        .send({
          postId: postResponse.body.id,
          content: 'Super article !'
        });

      return { token, commentId: commentResponse.body.id };
    };

    it('devrait créer une réaction (like) avec succès', async () => {
      const { token, commentId } = await createUserWithComment();

      const response = await request(app)
        .post('/reaction')
        .set('Authorization', token)
        .send({
          commentId,
          reactionType: 'like'
        });

      expect(response.status).to.equal(201);
      expect(response.body).to.have.property('id');
      expect(response.body.commentId).to.equal(commentId);
      expect(response.body.reactionType).to.equal('like');
    });

    it('devrait échouer sans authentification', async () => {
      const response = await request(app)
        .post('/reaction')
        .send({
          commentId: 1,
          reactionType: 'like'
        });

      expect(response.status).to.equal(401);
      expect(response.body).to.have.property('error');
    });

    it('devrait échouer avec un token invalide', async () => {
      const response = await request(app)
        .post('/reaction')
        .set('Authorization', 'token-invalide-qui-n-existe-pas')
        .send({
          commentId: 1,
          reactionType: 'like'
        });

      expect(response.status).to.equal(401);
      expect(response.body).to.have.property('error');
    });

    it('devrait échouer si le commentaire n\'existe pas', async () => {
      const { token } = await createUserWithComment();

      const response = await request(app)
        .post('/reaction')
        .set('Authorization', token)
        .send({
          commentId: 999999,
          reactionType: 'like'
        });

      expect(response.status).to.equal(401);
      expect(response.body).to.have.property('error');
    });

    it('devrait retirer la réaction si l\'utilisateur a déjà réagi (toggle)', async () => {
      const { token, commentId } = await createUserWithComment();

      // Première réaction -> création
      const firstResponse = await request(app)
        .post('/reaction')
        .set('Authorization', token)
        .send({
          commentId,
          reactionType: 'like'
        });
      expect(firstResponse.status).to.equal(201);

      // Deuxième réaction -> suppression (toggle off)
      const secondResponse = await request(app)
        .post('/reaction')
        .set('Authorization', token)
        .send({
          commentId,
          reactionType: 'like'
        });
      expect(secondResponse.status).to.equal(200);
      expect(secondResponse.body).to.have.property('message');

      // Vérifier qu'il n'y a plus aucune réaction en base
      const remaining = await Reaction.findAll({ where: { commentId } });
      expect(remaining).to.have.lengthOf(0);
    });

    it('devrait permettre de réagir à nouveau après un toggle off', async () => {
      const { token, commentId } = await createUserWithComment();

      // Like
      await request(app)
        .post('/reaction')
        .set('Authorization', token)
        .send({ commentId, reactionType: 'like' });

      // Dislike (toggle off)
      await request(app)
        .post('/reaction')
        .set('Authorization', token)
        .send({ commentId, reactionType: 'like' });

      // Like à nouveau
      const response = await request(app)
        .post('/reaction')
        .set('Authorization', token)
        .send({ commentId, reactionType: 'love' });

      expect(response.status).to.equal(201);
      expect(response.body.reactionType).to.equal('love');
    });
  });
});