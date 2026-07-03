const { DataTypes } = require('sequelize');
const sequelize = require('./sequelize');

const Reaction = sequelize.define('Reaction', {
  // Définition des colonnes de la table Reaction
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  commentId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  reactionType: {
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  // Options du modèle
  timestamps: true, // Si vous voulez des timestamps (createdAt, updatedAt)
  tableName: 'reactions', // Nom de la table dans la base de données
  indexes: [
    {
      unique: true,
      fields: ['userId', 'commentId'] // Un seul type de réaction par user et par comment
    }
  ]
});

module.exports = Reaction;