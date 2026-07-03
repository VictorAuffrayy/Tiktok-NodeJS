const { Sequelize } = require('sequelize');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './mydatabase.sqlite', // Nom du fichier de votre base de données SQLite
  logging: false // Désactiver les logs SQL pour les tests
});

module.exports = sequelize;
