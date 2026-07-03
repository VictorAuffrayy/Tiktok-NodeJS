const { DataTypes } = require('sequelize');
const sequelize = require('./sequelize');

const User = sequelize.define('User', {
  // Définition des colonnes de la table User
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  username: {
    // Pseudo public affiché sur le profil (@username), généré automatiquement
    // à partir de l'email si non fourni à l'inscription.
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  bio: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  avatar: {
    // URL de la photo de profil
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  // Options du modèle
  timestamps: true, // Si vous voulez des timestamps (createdAt, updatedAt)
  tableName: 'users' // Nom de la table dans la base de données
});

module.exports = User;