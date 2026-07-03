const { DataTypes } = require('sequelize');
const sequelize = require('./sequelize');

const Post = sequelize.define('Post', {
  // Définition des colonnes de la table Post
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: { type: DataTypes.STRING, allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  videoUrl: {
    // URL du fichier / stream vidéo (ex: sur un bucket S3, Cloudinary, etc.)
    type: DataTypes.STRING,
    allowNull: true
  },
  thumbnail: {
    // Image de couverture affichée dans le feed avant lecture
    type: DataTypes.STRING,
    allowNull: true
  },
  duration: {
    // Durée de la vidéo en secondes
    type: DataTypes.INTEGER,
    allowNull: true
  },
  views: {
    // Nombre de vues (compteur simple, incrémenté à chaque appel de /posts/:id/view)
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  hashtags: {
    // Stocké en JSON stringifié (tableau de tags en minuscules, sans le '#'),
    // extrait automatiquement du titre/contenu à la création du post.
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  // Options du modèle
  timestamps: true, // Si vous voulez des timestamps (createdAt, updatedAt)
  tableName: 'posts' // Nom de la table dans la base de données
});

module.exports = Post;