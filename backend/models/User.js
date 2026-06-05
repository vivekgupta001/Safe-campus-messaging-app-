const mongoose = require('mongoose');
const localDb = require('../services/localDb');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  pseudonym: { type: String, required: true, unique: true },
  avatar: { type: String, required: true },
  gender: { type: String, enum: ['male', 'female'], required: true },
  interests: [{ type: String }],
  collegeIdUrl: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isApproved: { type: Boolean, default: false },
  isOnline: { type: Boolean, default: false },
  isMutedOrBanned: { type: Boolean, default: false },
  conversationCount: { type: Number, default: 0 },
  responseRate: { type: Number, default: 100 },
  createdAt: { type: Date, default: Date.now }
});

const MongoUser = mongoose.model('User', userSchema);

// Model Wrapper to support seamless fallback to local JSON DB
const User = {
  find: async (query = {}) => {
    if (global.useLocalDB) {
      return localDb.find('users', query);
    }
    return MongoUser.find(query);
  },

  findOne: async (query = {}) => {
    if (global.useLocalDB) {
      return localDb.findOne('users', query);
    }
    // Handle select manual adjustments if controllers specify select fields
    if (query.email) {
      return MongoUser.findOne({ email: query.email }).select('+password +email');
    }
    return MongoUser.findOne(query);
  },

  findById: async (id) => {
    if (global.useLocalDB) {
      return localDb.findById('users', id);
    }
    return MongoUser.findById(id);
  },

  create: async (data) => {
    if (global.useLocalDB) {
      return localDb.create('users', data);
    }
    return MongoUser.create(data);
  },

  findByIdAndUpdate: async (id, updateData, options = { new: true }) => {
    if (global.useLocalDB) {
      return localDb.findByIdAndUpdate('users', id, updateData);
    }
    return MongoUser.findByIdAndUpdate(id, updateData, options);
  },

  updateOne: async (query, updateData) => {
    if (global.useLocalDB) {
      return localDb.updateOne('users', query, updateData);
    }
    return MongoUser.updateOne(query, updateData);
  },

  deleteOne: async (query) => {
    if (global.useLocalDB) {
      return localDb.deleteOne('users', query);
    }
    return MongoUser.deleteOne(query);
  }
};

module.exports = User;
