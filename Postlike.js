const { DataTypes } = require('sequelize');
const sequelize = require('./sequelize');

// Like sur un post/vidéo (différent de Reaction, qui concerne les commentaires)
const PostLike = sequelize.define('PostLike', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  postId: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  timestamps: true,
  tableName: 'post_likes',
  indexes: [
    {
      unique: true,
      fields: ['userId', 'postId'] // Un seul like par utilisateur et par post
    }
  ]
});

module.exports = PostLike;