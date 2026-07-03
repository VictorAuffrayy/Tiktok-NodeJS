const request = require('supertest');
const { expect } = require('chai');
const app = require('./app');
const User = require('./User');
const Post = require('./Post');
const Comment = require('./Comment');
const Reaction = require('./Reaction');
const Follow = require('./Follow');
const PostLike = require('./PostLike');
const sequelize = require('./sequelize');

describe('TikTok features', () => {

  before(async () => {
    try {
      await sequelize.authenticate();
      await sequelize.sync({ alter: true });
    } catch (error) {
      console.error('Erreur lors de la synchronisation:', error);
      throw error;
    }
  });

  afterEach(async () => {
    try {
      await PostLike.destroy({ where: {} });
      await Follow.destroy({ where: {} });
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
    // les suites suivantes (advanced_test.js). Mocha coupe le process avec
    // --exit à la toute fin, donc pas besoin de fermer manuellement.
  });

  // Helper : inscrit + connecte un utilisateur, renvoie { token, userId }
  const signupAndLogin = async (email, name = 'Test User') => {
    const signupResponse = await request(app)
      .post('/signup')
      .send({ name, email, password: 'password123' });

    const loginResponse = await request(app)
      .post('/login')
      .send({ email, password: 'password123' });

    return { token: loginResponse.body.token, userId: signupResponse.body.id };
  };

  describe('POST /signup - génération du username', () => {
    it('génère un username automatiquement si non fourni', async () => {
      const response = await request(app)
        .post('/signup')
        .send({ name: 'John Doe', email: 'john@example.com', password: 'password123' });

      expect(response.status).to.equal(201);
      expect(response.body.username).to.equal('john');
    });

    it('gère les collisions de username en ajoutant un suffixe', async () => {
      await request(app)
        .post('/signup')
        .send({ name: 'John Doe', email: 'john@example.com', password: 'password123' });

      const response = await request(app)
        .post('/signup')
        .send({ name: 'John Doe 2', email: 'john@other.com', password: 'password123' });

      // même préfixe local ("john") -> même base de username avant le @
      expect(response.status).to.equal(201);
      // john@example.com a déjà pris "john", donc john@other.com doit obtenir "john1"
      expect(response.body.username).to.equal('john1');
    });

    it('accepte un username explicite', async () => {
      const response = await request(app)
        .post('/signup')
        .send({ name: 'John Doe', email: 'john@example.com', password: 'password123', username: 'johnny' });

      expect(response.status).to.equal(201);
      expect(response.body.username).to.equal('johnny');
    });

    it('refuse un username déjà pris', async () => {
      await request(app)
        .post('/signup')
        .send({ name: 'John Doe', email: 'john@example.com', password: 'password123', username: 'johnny' });

      const response = await request(app)
        .post('/signup')
        .send({ name: 'Jane Doe', email: 'jane@example.com', password: 'password123', username: 'johnny' });

      expect(response.status).to.equal(400);
      expect(response.body).to.have.property('error');
    });
  });

  describe('PATCH /profile', () => {
    it('met à jour bio et avatar', async () => {
      const { token } = await signupAndLogin('john@example.com');

      const response = await request(app)
        .patch('/profile')
        .set('Authorization', token)
        .send({ bio: 'Judo instructor & pilote en herbe', avatar: 'https://example.com/avatar.png' });

      expect(response.status).to.equal(200);
      expect(response.body.bio).to.equal('Judo instructor & pilote en herbe');
      expect(response.body.avatar).to.equal('https://example.com/avatar.png');
    });

    it('échoue sans authentification', async () => {
      const response = await request(app)
        .patch('/profile')
        .send({ bio: 'test' });

      expect(response.status).to.equal(401);
    });

    it('refuse un username déjà pris par un autre utilisateur', async () => {
      await signupAndLogin('jane@example.com'); // username auto: "jane"
      const { token } = await signupAndLogin('john@example.com');

      const response = await request(app)
        .patch('/profile')
        .set('Authorization', token)
        .send({ username: 'jane' });

      expect(response.status).to.equal(400);
      expect(response.body).to.have.property('error');
    });
  });

  describe('GET /users/:id/profile', () => {
    it('retourne les infos publiques et les compteurs à 0 pour un nouvel utilisateur', async () => {
      const { userId } = await signupAndLogin('john@example.com');

      const response = await request(app).get(`/users/${userId}/profile`);

      expect(response.status).to.equal(200);
      expect(response.body.username).to.equal('john');
      expect(response.body.followersCount).to.equal(0);
      expect(response.body.followingCount).to.equal(0);
      expect(response.body.postsCount).to.equal(0);
      expect(response.body.likesCount).to.equal(0);
      expect(response.body).to.not.have.property('password');
    });

    it('404 si l\'utilisateur n\'existe pas', async () => {
      const response = await request(app).get('/users/999999/profile');
      expect(response.status).to.equal(404);
    });
  });

  describe('POST /follow', () => {
    it('permet de suivre un autre utilisateur', async () => {
      const { token } = await signupAndLogin('john@example.com');
      const { userId: janeId } = await signupAndLogin('jane@example.com');

      const response = await request(app)
        .post('/follow')
        .set('Authorization', token)
        .send({ followingId: janeId });

      expect(response.status).to.equal(201);
      expect(response.body.followingId).to.equal(janeId);
    });

    it('bascule (unfollow) si déjà suivi', async () => {
      const { token } = await signupAndLogin('john@example.com');
      const { userId: janeId } = await signupAndLogin('jane@example.com');

      await request(app).post('/follow').set('Authorization', token).send({ followingId: janeId });
      const response = await request(app).post('/follow').set('Authorization', token).send({ followingId: janeId });

      expect(response.status).to.equal(200);
      expect(response.body.message).to.equal('Unfollowed');
    });

    it('interdit de se suivre soi-même', async () => {
      const { token, userId } = await signupAndLogin('john@example.com');

      const response = await request(app)
        .post('/follow')
        .set('Authorization', token)
        .send({ followingId: userId });

      expect(response.status).to.equal(400);
    });

    it('échoue sans authentification', async () => {
      const response = await request(app).post('/follow').send({ followingId: 1 });
      expect(response.status).to.equal(401);
    });

    it('met à jour les compteurs followers/following après un follow', async () => {
      const { token } = await signupAndLogin('john@example.com');
      const { userId: janeId } = await signupAndLogin('jane@example.com');

      await request(app).post('/follow').set('Authorization', token).send({ followingId: janeId });

      const janeProfile = await request(app).get(`/users/${janeId}/profile`);
      expect(janeProfile.body.followersCount).to.equal(1);
    });
  });

  describe('GET /users/:id/followers et /following', () => {
    it('liste correctement followers et following', async () => {
      const { token, userId: johnId } = await signupAndLogin('john@example.com');
      const { userId: janeId } = await signupAndLogin('jane@example.com');

      await request(app).post('/follow').set('Authorization', token).send({ followingId: janeId });

      const followers = await request(app).get(`/users/${janeId}/followers`);
      expect(followers.status).to.equal(200);
      expect(followers.body).to.have.lengthOf(1);
      expect(followers.body[0].id).to.equal(johnId);

      const following = await request(app).get(`/users/${johnId}/following`);
      expect(following.status).to.equal(200);
      expect(following.body).to.have.lengthOf(1);
      expect(following.body[0].id).to.equal(janeId);
    });
  });

  describe('POST /posts avec champs vidéo', () => {
    it('crée un post avec videoUrl, thumbnail et duration', async () => {
      const { token } = await signupAndLogin('john@example.com');

      const response = await request(app)
        .post('/posts')
        .set('Authorization', token)
        .send({
          title: 'Mon premier tiktok',
          content: 'Une vidéo de judo',
          videoUrl: 'https://cdn.example.com/video1.mp4',
          thumbnail: 'https://cdn.example.com/thumb1.jpg',
          duration: 32
        });

      expect(response.status).to.equal(201);
      expect(response.body.videoUrl).to.equal('https://cdn.example.com/video1.mp4');
      expect(response.body.thumbnail).to.equal('https://cdn.example.com/thumb1.jpg');
      expect(response.body.duration).to.equal(32);
    });
  });

  describe('POST /posts/:postId/like', () => {
    const createUserWithPost = async (email) => {
      const { token } = await signupAndLogin(email);
      const postResponse = await request(app)
        .post('/posts')
        .set('Authorization', token)
        .send({ title: 'Video', content: 'desc', videoUrl: 'https://cdn.example.com/v.mp4' });
      return { token, postId: postResponse.body.id };
    };

    it('like un post avec succès', async () => {
      const { token, postId } = await createUserWithPost('john@example.com');

      const response = await request(app)
        .post(`/posts/${postId}/like`)
        .set('Authorization', token);

      expect(response.status).to.equal(201);
      expect(response.body.postId).to.equal(postId);
    });

    it('retire le like au second appel (toggle)', async () => {
      const { token, postId } = await createUserWithPost('john@example.com');

      await request(app).post(`/posts/${postId}/like`).set('Authorization', token);
      const response = await request(app).post(`/posts/${postId}/like`).set('Authorization', token);

      expect(response.status).to.equal(200);
      expect(response.body.message).to.equal('Like removed');

      const remaining = await PostLike.findAll({ where: { postId } });
      expect(remaining).to.have.lengthOf(0);
    });

    it('échoue sans authentification', async () => {
      const { postId } = await createUserWithPost('john@example.com');
      const response = await request(app).post(`/posts/${postId}/like`);
      expect(response.status).to.equal(401);
    });

    it('404 si le post n\'existe pas', async () => {
      const { token } = await signupAndLogin('john@example.com');
      const response = await request(app)
        .post('/posts/999999/like')
        .set('Authorization', token);
      expect(response.status).to.equal(404);
    });
  });

  describe('GET /feed', () => {
    it('retourne les posts avec likesCount, commentsCount et isLiked', async () => {
      const { token: aliceToken } = await signupAndLogin('alice@example.com');
      const { token: bobToken } = await signupAndLogin('bob@example.com');

      const postResponse = await request(app)
        .post('/posts')
        .set('Authorization', aliceToken)
        .send({ title: 'Alice video', content: 'desc', videoUrl: 'https://cdn.example.com/a.mp4' });

      await request(app)
        .post(`/posts/${postResponse.body.id}/like`)
        .set('Authorization', bobToken);

      const feed = await request(app).get('/feed').set('Authorization', bobToken);

      expect(feed.status).to.equal(200);
      expect(feed.body).to.have.lengthOf(1);
      expect(feed.body[0].likesCount).to.equal(1);
      expect(feed.body[0].commentsCount).to.equal(0);
      expect(feed.body[0].isLiked).to.equal(true);
    });

    it('fonctionne sans authentification (feed public)', async () => {
      const { token } = await signupAndLogin('alice@example.com');
      await request(app)
        .post('/posts')
        .set('Authorization', token)
        .send({ title: 'Public video', content: 'desc', videoUrl: 'https://cdn.example.com/p.mp4' });

      const feed = await request(app).get('/feed');

      expect(feed.status).to.equal(200);
      expect(feed.body).to.have.lengthOf(1);
      expect(feed.body[0].isLiked).to.equal(false);
    });

    it('place les posts des comptes suivis en premier', async () => {
      const { token: aliceToken, userId: aliceId } = await signupAndLogin('alice@example.com');
      const { token: bobToken } = await signupAndLogin('bob@example.com');
      const { token: carolToken } = await signupAndLogin('carol@example.com');

      // Carol poste une vidéo très likée mais n'est pas suivie par bob
      const carolPost = await request(app)
        .post('/posts')
        .set('Authorization', carolToken)
        .send({ title: 'Carol trending', content: 'desc', videoUrl: 'https://cdn.example.com/c.mp4' });
      await request(app).post(`/posts/${carolPost.body.id}/like`).set('Authorization', aliceToken);

      // Alice poste une vidéo peu likée mais est suivie par bob
      const alicePost = await request(app)
        .post('/posts')
        .set('Authorization', aliceToken)
        .send({ title: 'Alice followed', content: 'desc', videoUrl: 'https://cdn.example.com/a2.mp4' });

      await request(app).post('/follow').set('Authorization', bobToken).send({ followingId: aliceId });

      const feed = await request(app).get('/feed').set('Authorization', bobToken);

      expect(feed.status).to.equal(200);
      expect(feed.body).to.have.lengthOf(2);
      // Le post d'Alice (suivie) doit arriver avant celui de Carol (non suivie), malgré moins de likes
      expect(feed.body[0].title).to.equal('Alice followed');
      expect(feed.body[1].title).to.equal('Carol trending');
    });
  });
});