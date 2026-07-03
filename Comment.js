const { DataTypes } = require('sequelize');
const sequelize = require('./sequelize');

const Comment = sequelize.define('Comment', {
  // Définition des colonnes de la table Comment
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
  },
  textComment: {
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  // Options du modèle
  timestamps: true, // Si vous voulez des timestamps (createdAt, updatedAt)
  tableName: 'comments' // Nom de la table dans la base de données
});

module.exports = Comment;