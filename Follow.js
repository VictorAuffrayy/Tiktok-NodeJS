const { DataTypes } = require('sequelize');
const sequelize = require('./sequelize');

// Table de liaison pour les abonnements (followerId "suit" followingId)
const Follow = sequelize.define('Follow', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  followerId: {
    // L'utilisateur qui suit
    type: DataTypes.INTEGER,
    allowNull: false
  },
  followingId: {
    // L'utilisateur qui est suivi
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  timestamps: true,
  tableName: 'follows',
  indexes: [
    {
      unique: true,
      fields: ['followerId', 'followingId'] // On ne peut suivre qu'une seule fois la même personne
    }
  ]
});

module.exports = Follow;