const mongoose = require('mongoose');
const localDb = require('../services/localDb');

const friendshipSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  callDuration: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const MongoFriendship = mongoose.model('Friendship', friendshipSchema);

const Friendship = {
  find: async (query = {}) => {
    if (global.useLocalDB) {
      return localDb.find('friendships', query);
    }
    return MongoFriendship.find(query).populate('requester').populate('recipient');
  },

  findOne: async (query = {}) => {
    if (global.useLocalDB) {
      return localDb.findOne('friendships', query);
    }
    return MongoFriendship.findOne(query).populate('requester').populate('recipient');
  },

  findById: async (id) => {
    if (global.useLocalDB) {
      return localDb.findById('friendships', id);
    }
    return MongoFriendship.findById(id).populate('requester').populate('recipient');
  },

  create: async (data) => {
    if (global.useLocalDB) {
      return localDb.create('friendships', data);
    }
    return MongoFriendship.create(data);
  },

  findByIdAndUpdate: async (id, updateData, options = { new: true }) => {
    if (global.useLocalDB) {
      return localDb.findByIdAndUpdate('friendships', id, updateData);
    }
    return MongoFriendship.findByIdAndUpdate(id, updateData, options);
  },

  updateOne: async (query, updateData) => {
    if (global.useLocalDB) {
      return localDb.updateOne('friendships', query, updateData);
    }
    return MongoFriendship.updateOne(query, updateData);
  },

  deleteOne: async (query) => {
    if (global.useLocalDB) {
      return localDb.deleteOne('friendships', query);
    }
    return MongoFriendship.deleteOne(query);
  }
};

module.exports = Friendship;
