const { DataTypes } = require('sequelize');
const sequelize = require('./sequelize');

const Session = sequelize.define('Session', {
  // Définition des colonnes de la table User
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  token: {
    type: DataTypes.STRING,
    allowNull: false
  },
  expirationDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
}, {
  // Options du modèle
  timestamps: true, // Si vous voulez des timestamps (createdAt, updatedAt)
  tableName: 'sessions' // Nom de la table dans la base de données
});

module.exports = Session;
