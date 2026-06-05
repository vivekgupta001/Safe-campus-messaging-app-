const mongoose = require('mongoose');
const localDb = require('../services/localDb');

const reportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, required: true },
  description: { type: String },
  status: { type: String, enum: ['pending', 'resolved'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const MongoReport = mongoose.model('Report', reportSchema);

const Report = {
  find: async (query = {}) => {
    if (global.useLocalDB) {
      return localDb.find('reports', query);
    }
    return MongoReport.find(query).populate('reporter').populate('reportedUser');
  },

  findOne: async (query = {}) => {
    if (global.useLocalDB) {
      return localDb.findOne('reports', query);
    }
    return MongoReport.findOne(query).populate('reporter').populate('reportedUser');
  },

  create: async (data) => {
    if (global.useLocalDB) {
      return localDb.create('reports', data);
    }
    return MongoReport.create(data);
  },

  findByIdAndUpdate: async (id, updateData, options = { new: true }) => {
    if (global.useLocalDB) {
      return localDb.findByIdAndUpdate('reports', id, updateData);
    }
    return MongoReport.findByIdAndUpdate(id, updateData, options);
  },

  deleteOne: async (query) => {
    if (global.useLocalDB) {
      return localDb.deleteOne('reports', query);
    }
    return MongoReport.deleteOne(query);
  }
};

module.exports = Report;
