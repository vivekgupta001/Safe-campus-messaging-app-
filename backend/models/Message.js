const mongoose = require('mongoose');
const localDb = require('../services/localDb');

const messageSchema = new mongoose.Schema({
  chatRoomId: { type: String, required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  isFlagged: { type: Boolean, default: false },
  flagReason: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const MongoMessage = mongoose.model('Message', messageSchema);

const Message = {
  find: async (query = {}) => {
    if (global.useLocalDB) {
      return localDb.find('messages', query);
    }
    return MongoMessage.find(query).sort({ createdAt: 1 });
  },

  findOne: async (query = {}) => {
    if (global.useLocalDB) {
      return localDb.findOne('messages', query);
    }
    return MongoMessage.findOne(query);
  },

  create: async (data) => {
    if (global.useLocalDB) {
      return localDb.create('messages', data);
    }
    return MongoMessage.create(data);
  },

  findByIdAndUpdate: async (id, updateData, options = { new: true }) => {
    if (global.useLocalDB) {
      return localDb.findByIdAndUpdate('messages', id, updateData);
    }
    return MongoMessage.findByIdAndUpdate(id, updateData, options);
  },

  deleteOne: async (query) => {
    if (global.useLocalDB) {
      return localDb.deleteOne('messages', query);
    }
    return MongoMessage.deleteOne(query);
  }
};

module.exports = Message;
