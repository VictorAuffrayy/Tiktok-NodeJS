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

describe('Advanced features (pagination, delete, views, hashtags, search)', () => {

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
    // Idem tiktok_test.js : pas de close() ici, la connexion est partagée
    // entre tous les fichiers de test du process Mocha.
  });

  const signupAndLogin = async (email, name = 'Test User') => {
    const signupResponse = await request(app)
      .post('/signup')
      .send({ name, email, password: 'password123' });

    const loginResponse = await request(app)
      .post('/login')
      .send({ email, password: 'password123' });

    return { token: loginResponse.body.token, userId: signupResponse.body.id };
  };

  const createPost = async (token, overrides = {}) => {
    const response = await request(app)
      .post('/posts')
      .set('Authorization', token)
      .send({
        title: 'Video',
        content: 'desc',
        videoUrl: 'https://cdn.example.com/v.mp4',
        ...overrides
      });
    return response.body;
  };

  // ---------------------------------------------------------------------
  describe('Pagination', () => {
    it('limite le nombre de résultats sur GET /users avec ?limit=', async () => {
      for (let i = 0; i < 5; i++) {
        await signupAndLogin(`user${i}@example.com`, `User ${i}`);
      }

      const response = await request(app).get('/users?limit=2&offset=0');

      expect(response.status).to.equal(200);
      expect(response.body).to.have.lengthOf(2);
      expect(response.headers['x-total-count']).to.equal('5');
    });

    it('applique offset correctement', async () => {
      for (let i = 0; i < 3; i++) {
        await signupAndLogin(`user${i}@example.com`, `User ${i}`);
      }

      const page1 = await request(app).get('/users?limit=2&offset=0');
      const page2 = await request(app).get('/users?limit=2&offset=2');

      expect(page1.body).to.have.lengthOf(2);
      expect(page2.body).to.have.lengthOf(1);
      // Pas de doublon entre les deux pages
      const ids1 = page1.body.map((u) => u.id);
      const ids2 = page2.body.map((u) => u.id);
      expect(ids1).to.not.include(ids2[0]);
    });

    it('ignore un limit invalide et retombe sur la valeur par défaut', async () => {
      await signupAndLogin('john@example.com');

      const response = await request(app).get('/users?limit=abc');

      expect(response.status).to.equal(200);
      expect(response.body).to.have.lengthOf(1);
    });

    it('pagine le feed avec X-Total-Count', async () => {
      const { token } = await signupAndLogin('john@example.com');
      for (let i = 0; i < 3; i++) {
        await createPost(token, { title: `Video ${i}` });
      }

      const response = await request(app).get('/feed?limit=2');

      expect(response.status).to.equal(200);
      expect(response.body).to.have.lengthOf(2);
      expect(response.headers['x-total-count']).to.equal('3');
    });
  });

  // ---------------------------------------------------------------------
  describe('DELETE /posts/:id', () => {
    it('permet à l\'auteur de supprimer son post', async () => {
      const { token } = await signupAndLogin('john@example.com');
      const post = await createPost(token);

      const response = await request(app)
        .delete(`/posts/${post.id}`)
        .set('Authorization', token);

      expect(response.status).to.equal(200);

      const check = await Post.findByPk(post.id);
      expect(check).to.be.null;
    });

    it('supprime aussi les comments et reactions liés au post', async () => {
      const { token } = await signupAndLogin('john@example.com');
      const post = await createPost(token);

      const commentResponse = await request(app)
        .post('/comment')
        .set('Authorization', token)
        .send({ postId: post.id, content: 'Nice video' });

      await request(app)
        .post('/reaction')
        .set('Authorization', token)
        .send({ commentId: commentResponse.body.id, reactionType: 'like' });

      await request(app).delete(`/posts/${post.id}`).set('Authorization', token);

      const remainingComments = await Comment.findAll({ where: { postId: post.id } });
      const remainingReactions = await Reaction.findAll({ where: { commentId: commentResponse.body.id } });
      expect(remainingComments).to.have.lengthOf(0);
      expect(remainingReactions).to.have.lengthOf(0);
    });

    it('interdit à un autre utilisateur de supprimer le post', async () => {
      const { token: aliceToken } = await signupAndLogin('alice@example.com');
      const { token: bobToken } = await signupAndLogin('bob@example.com');
      const post = await createPost(aliceToken);

      const response = await request(app)
        .delete(`/posts/${post.id}`)
        .set('Authorization', bobToken);

      expect(response.status).to.equal(403);
    });

    it('échoue sans authentification', async () => {
      const { token } = await signupAndLogin('john@example.com');
      const post = await createPost(token);

      const response = await request(app).delete(`/posts/${post.id}`);
      expect(response.status).to.equal(401);
    });

    it('404 si le post n\'existe pas', async () => {
      const { token } = await signupAndLogin('john@example.com');
      const response = await request(app)
        .delete('/posts/999999')
        .set('Authorization', token);
      expect(response.status).to.equal(404);
    });
  });

  // ---------------------------------------------------------------------
  describe('DELETE /comment/:id', () => {
    it('permet à l\'auteur de supprimer son commentaire', async () => {
      const { token } = await signupAndLogin('john@example.com');
      const post = await createPost(token);
      const commentResponse = await request(app)
        .post('/comment')
        .set('Authorization', token)
        .send({ postId: post.id, content: 'Nice' });

      const response = await request(app)
        .delete(`/comment/${commentResponse.body.id}`)
        .set('Authorization', token);

      expect(response.status).to.equal(200);
      const check = await Comment.findByPk(commentResponse.body.id);
      expect(check).to.be.null;
    });

    it('interdit à un autre utilisateur de supprimer le commentaire', async () => {
      const { token: aliceToken } = await signupAndLogin('alice@example.com');
      const { token: bobToken } = await signupAndLogin('bob@example.com');
      const post = await createPost(aliceToken);
      const commentResponse = await request(app)
        .post('/comment')
        .set('Authorization', aliceToken)
        .send({ postId: post.id, content: 'Nice' });

      const response = await request(app)
        .delete(`/comment/${commentResponse.body.id}`)
        .set('Authorization', bobToken);

      expect(response.status).to.equal(403);
    });

    it('échoue sans authentification', async () => {
      const response = await request(app).delete('/comment/1');
      expect(response.status).to.equal(401);
    });
  });

  // ---------------------------------------------------------------------
  describe('POST /posts/:id/view', () => {
    it('incrémente le compteur de vues à chaque appel', async () => {
      const { token } = await signupAndLogin('john@example.com');
      const post = await createPost(token);

      const first = await request(app).post(`/posts/${post.id}/view`);
      const second = await request(app).post(`/posts/${post.id}/view`);

      expect(first.status).to.equal(200);
      expect(first.body.views).to.equal(1);
      expect(second.body.views).to.equal(2);
    });

    it('ne nécessite pas d\'authentification', async () => {
      const { token } = await signupAndLogin('john@example.com');
      const post = await createPost(token);

      const response = await request(app).post(`/posts/${post.id}/view`);
      expect(response.status).to.equal(200);
    });

    it('404 si le post n\'existe pas', async () => {
      const response = await request(app).post('/posts/999999/view');
      expect(response.status).to.equal(404);
    });
  });

  // ---------------------------------------------------------------------
  describe('Hashtags', () => {
    it('extrait automatiquement les hashtags du titre/contenu à la création', async () => {
      const { token } = await signupAndLogin('john@example.com');

      const response = await request(app)
        .post('/posts')
        .set('Authorization', token)
        .send({ title: 'Ma session #judo du jour', content: 'Entraînement #Judo #paris intense' });

      expect(response.status).to.equal(201);
      expect(response.body.hashtags).to.include('judo');
      expect(response.body.hashtags).to.include('paris');
      // Pas de doublon même si #judo apparaît 2x avec des casses différentes
      expect(response.body.hashtags.filter((h) => h === 'judo')).to.have.lengthOf(1);
    });

    it('GET /hashtags/:tag retourne les posts correspondants', async () => {
      const { token } = await signupAndLogin('john@example.com');
      await request(app)
        .post('/posts')
        .set('Authorization', token)
        .send({ title: 'Session #judo', content: 'desc' });
      await request(app)
        .post('/posts')
        .set('Authorization', token)
        .send({ title: 'Autre chose', content: 'desc' });

      const response = await request(app).get('/hashtags/judo');

      expect(response.status).to.equal(200);
      expect(response.body).to.have.lengthOf(1);
      expect(response.body[0].title).to.equal('Session #judo');
    });

    it('GET /hashtags/:tag ne fait pas de faux positifs sur un tag partiel', async () => {
      const { token } = await signupAndLogin('john@example.com');
      await request(app)
        .post('/posts')
        .set('Authorization', token)
        .send({ title: 'Post', content: '#judoclub de Rueil' });

      const response = await request(app).get('/hashtags/judo');

      expect(response.status).to.equal(200);
      expect(response.body).to.have.lengthOf(0);
    });
  });

  // ---------------------------------------------------------------------
  describe('GET /search', () => {
    it('trouve des utilisateurs par nom/username', async () => {
      await signupAndLogin('victor@example.com', 'Victor Auffray');
      await signupAndLogin('jane@example.com', 'Jane Doe');

      const response = await request(app).get('/search?q=Victor');

      expect(response.status).to.equal(200);
      expect(response.body.users).to.have.lengthOf(1);
      expect(response.body.users[0].name).to.equal('Victor Auffray');
    });

    it('trouve des posts par titre/contenu', async () => {
      const { token } = await signupAndLogin('john@example.com');
      await createPost(token, { title: 'Compétition judo', content: 'desc' });
      await createPost(token, { title: 'Vol PPL', content: 'desc' });

      const response = await request(app).get('/search?q=judo');

      expect(response.status).to.equal(200);
      expect(response.body.posts).to.have.lengthOf(1);
      expect(response.body.posts[0].title).to.equal('Compétition judo');
    });

    it('échoue sans paramètre q', async () => {
      const response = await request(app).get('/search');
      expect(response.status).to.equal(400);
    });
  });
});