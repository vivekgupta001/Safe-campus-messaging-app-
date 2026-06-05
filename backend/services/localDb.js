const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'local_db.json');

// Initialize database file if it doesn't exist
const initDb = () => {
  if (!fs.existsSync(DB_PATH)) {
    const initialData = {
      users: [],
      friendships: [],
      messages: [],
      reports: []
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2), 'utf-8');
  }
};

const readDb = () => {
  try {
    initDb();
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading local JSON DB:', err);
    return { users: [], friendships: [], messages: [], reports: [] };
  }
};

const writeDb = (data) => {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing to local JSON DB:', err);
    return false;
  }
};

// Generate a random 24-character hex string to mimic MongoDB ObjectIDs
const generateId = () => {
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
};

const matchesQuery = (item, query) => {
  if (!query || Object.keys(query).length === 0) return true;
  
  for (const key in query) {
    const queryVal = query[key];
    const itemVal = item[key];
    
    // Support MongoDB syntax like $or or nested queries if needed
    if (key === '$or' && Array.isArray(queryVal)) {
      return queryVal.some(subQuery => matchesQuery(item, subQuery));
    }
    if (key === '$ne') {
      // Direct negative comparison handled downstream or here
      continue; 
    }

    if (queryVal && typeof queryVal === 'object' && !Array.isArray(queryVal)) {
      // Handle operators like $ne, $in, $all
      if ('$ne' in queryVal) {
        if (itemVal === queryVal['$ne']) return false;
      }
      if ('$in' in queryVal && Array.isArray(queryVal['$in'])) {
        if (!queryVal['$in'].includes(itemVal)) return false;
      }
      if ('$nin' in queryVal && Array.isArray(queryVal['$nin'])) {
        if (queryVal['$nin'].includes(itemVal)) return false;
      }
    } else {
      // Direct comparison
      if (itemVal !== queryVal) return false;
    }
  }
  return true;
};

const localDb = {
  find: (collection, query = {}) => {
    const db = readDb();
    const list = db[collection] || [];
    return list.filter(item => {
      // Handle specific conditions like inequality outside generic matcher if needed
      // e.g. for matching opposite gender and excluding self
      if (query.gender && item.gender !== query.gender) return false;
      if (query._id && typeof query._id === 'object' && query._id.$ne) {
        if (item._id === query._id.$ne) return false;
      }
      
      const basicQuery = { ...query };
      delete basicQuery.gender;
      if (basicQuery._id && typeof basicQuery._id === 'object') {
        delete basicQuery._id;
      }
      
      return matchesQuery(item, basicQuery);
    });
  },

  findOne: (collection, query = {}) => {
    const results = localDb.find(collection, query);
    return results.length > 0 ? results[0] : null;
  },

  findById: (collection, id) => {
    return localDb.findOne(collection, { _id: id });
  },

  create: (collection, data) => {
    const db = readDb();
    if (!db[collection]) {
      db[collection] = [];
    }
    const newDoc = {
      _id: generateId(),
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db[collection].push(newDoc);
    writeDb(db);
    return newDoc;
  },

  findByIdAndUpdate: (collection, id, updateData) => {
    const db = readDb();
    const list = db[collection] || [];
    const index = list.findIndex(item => item._id === id);
    if (index === -1) return null;
    
    // Process Mongoose-like $inc or standard setters
    const current = list[index];
    let updated = { ...current };

    if (updateData.$inc) {
      for (const field in updateData.$inc) {
        updated[field] = (updated[field] || 0) + updateData.$inc[field];
      }
      delete updateData.$inc;
    }
    
    if (updateData.$push) {
      for (const field in updateData.$push) {
        if (!Array.isArray(updated[field])) updated[field] = [];
        updated[field].push(updateData.$push[field]);
      }
      delete updateData.$push;
    }

    updated = {
      ...updated,
      ...updateData,
      updatedAt: new Date().toISOString()
    };

    db[collection][index] = updated;
    writeDb(db);
    return updated;
  },

  updateOne: (collection, query, updateData) => {
    const doc = localDb.findOne(collection, query);
    if (!doc) return null;
    return localDb.findByIdAndUpdate(collection, doc._id, updateData);
  },

  deleteOne: (collection, query) => {
    const db = readDb();
    const list = db[collection] || [];
    const index = list.findIndex(item => matchesQuery(item, query));
    if (index === -1) return false;
    db[collection].splice(index, 1);
    writeDb(db);
    return true;
  }
};

initDb();

module.exports = localDb;
