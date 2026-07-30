const mongoose = require('mongoose');
const { inMemoryFiles } = require('./dbStore');
const crypto = require('crypto');

const fileSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  storedName: { type: String, required: true },
  relativePath: { type: String, required: true },
  folderName: { type: String, default: null },
  batchId: { type: String, default: null },
  extension: { type: String, default: '' },
  size: { type: Number, default: 0 },
  description: { type: String, default: '' },
  subject: { type: String, default: '' },
  exercise: { type: String, default: '' },
  question: { type: String, default: '' },
  expectedOutput: { type: String, default: '' },
  algorithm: { type: String, default: '' },
  complexity: { type: String, default: '' },
  difficulty: { type: String, default: 'Easy' },
  tags: { type: [String], default: [] },
  pinned: { type: Boolean, default: false },
  downloads: { type: Number, default: 0 },
  uploadDate: { type: Date, default: Date.now }
});

const MongooseFile = mongoose.model('File', fileSchema);

function wrapDoc(doc) {
  if (!doc) return null;
  if (!doc._id) doc._id = crypto.randomBytes(12).toString('hex');
  if (doc.save) return doc;

  doc.save = async function() {
    return doc;
  };
  doc.deleteOne = async function() {
    const idx = inMemoryFiles.findIndex(f => String(f._id) === String(doc._id));
    if (idx !== -1) inMemoryFiles.splice(idx, 1);
    return { acknowledged: true, deletedCount: 1 };
  };
  return doc;
}

function matchFieldValue(docVal, clauseVal) {
  if (docVal === undefined || docVal === null) {
    if (clauseVal === null) return true;
    if (typeof clauseVal === 'object' && clauseVal !== null && clauseVal.$ne !== undefined) {
      return docVal !== clauseVal.$ne;
    }
    return false;
  }
  if (clauseVal instanceof RegExp) {
    if (Array.isArray(docVal)) return docVal.some(v => clauseVal.test(String(v)));
    return clauseVal.test(String(docVal));
  }
  if (typeof clauseVal === 'object' && clauseVal !== null) {
    if (clauseVal.$ne !== undefined) {
      return docVal !== clauseVal.$ne;
    }
    if (clauseVal.$regex) {
      const reg = clauseVal.$regex instanceof RegExp ? clauseVal.$regex : new RegExp(clauseVal.$regex, 'i');
      if (Array.isArray(docVal)) return docVal.some(v => reg.test(String(v)));
      return reg.test(String(docVal));
    }
    if (clauseVal.$in && Array.isArray(clauseVal.$in)) {
      const strList = clauseVal.$in.map(v => String(v));
      return strList.includes(String(docVal));
    }
  }
  if (Array.isArray(docVal)) {
    return docVal.some(v => String(v).toLowerCase() === String(clauseVal).toLowerCase());
  }
  return String(docVal).toLowerCase() === String(clauseVal).toLowerCase();
}

function matchesQuery(doc, query) {
  if (!query || Object.keys(query).length === 0) return true;

  if (query.$or) {
    const matched = query.$or.some(clause => {
      return Object.entries(clause).some(([key, clauseVal]) => {
        return matchFieldValue(doc[key], clauseVal);
      });
    });
    if (!matched) return false;
  }

  for (const [key, clauseVal] of Object.entries(query)) {
    if (key === '$or') continue;
    if (!matchFieldValue(doc[key], clauseVal)) return false;
  }

  return true;
}

class QueryChain {
  constructor(data) {
    this._data = data.map(wrapDoc);
  }

  sort(sortSpec) {
    if (sortSpec) {
      this._data.sort((a, b) => {
        for (const [key, dir] of Object.entries(sortSpec)) {
          let valA = a[key];
          let valB = b[key];
          if (valA instanceof Date) valA = valA.getTime();
          if (valB instanceof Date) valB = valB.getTime();
          if (valA < valB) return dir === -1 ? 1 : -1;
          if (valA > valB) return dir === -1 ? -1 : 1;
        }
        return 0;
      });
    }
    return this;
  }

  limit(n) {
    if (n && typeof n === 'number') {
      this._data = this._data.slice(0, n);
    }
    return this;
  }

  select(fields) {
    if (typeof fields === 'string') {
      const fieldList = fields.split(' ').filter(Boolean);
      this._data = this._data.map(doc => {
        const picked = { _id: doc._id, save: doc.save, deleteOne: doc.deleteOne };
        fieldList.forEach(f => { picked[f] = doc[f]; });
        return picked;
      });
    }
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this._data).then(resolve, reject);
  }

  catch(reject) {
    return Promise.resolve(this._data).catch(reject);
  }
}

const FileProxy = {
  insertMany: async function(docs) {
    if (mongoose.connection.readyState === 1) {
      return MongooseFile.insertMany(docs);
    }
    const inserted = docs.map(d => {
      const item = {
        _id: crypto.randomBytes(12).toString('hex'),
        description: '',
        tags: [],
        pinned: false,
        downloads: 0,
        uploadDate: new Date(),
        ...d
      };
      wrapDoc(item);
      inMemoryFiles.unshift(item);
      return item;
    });
    return inserted;
  },

  find: function(query = {}) {
    if (mongoose.connection.readyState === 1) {
      return MongooseFile.find(query);
    }
    const filtered = inMemoryFiles.filter(doc => matchesQuery(doc, query));
    return new QueryChain(filtered);
  },

  countDocuments: async function(query = {}) {
    if (mongoose.connection.readyState === 1) {
      return MongooseFile.countDocuments(query);
    }
    return inMemoryFiles.filter(doc => matchesQuery(doc, query)).length;
  },

  aggregate: async function(pipeline) {
    if (mongoose.connection.readyState === 1) {
      return MongooseFile.aggregate(pipeline);
    }
    let totalSize = 0;
    let totalDownloads = 0;
    inMemoryFiles.forEach(f => {
      totalSize += f.size || 0;
      totalDownloads += f.downloads || 0;
    });
    return [{ _id: null, totalSize, totalDownloads }];
  },

  findById: async function(id) {
    if (mongoose.connection.readyState === 1) {
      return MongooseFile.findById(id);
    }
    const found = inMemoryFiles.find(f => String(f._id) === String(id));
    return found ? wrapDoc(found) : null;
  },

  findByIdAndUpdate: async function(id, update, options) {
    if (mongoose.connection.readyState === 1) {
      return MongooseFile.findByIdAndUpdate(id, update, options);
    }
    const doc = inMemoryFiles.find(f => String(f._id) === String(id));
    if (!doc) return null;
    Object.assign(doc, update);
    return wrapDoc(doc);
  },

  findByIdAndDelete: async function(id) {
    if (mongoose.connection.readyState === 1) {
      return MongooseFile.findByIdAndDelete(id);
    }
    const idx = inMemoryFiles.findIndex(f => String(f._id) === String(id));
    if (idx !== -1) {
      const removed = inMemoryFiles.splice(idx, 1)[0];
      return wrapDoc(removed);
    }
    return null;
  },

  deleteMany: async function(query = {}) {
    if (mongoose.connection.readyState === 1) {
      return MongooseFile.deleteMany(query);
    }
    const matching = inMemoryFiles.filter(doc => matchesQuery(doc, query));
    let deletedCount = 0;
    matching.forEach(doc => {
      const idx = inMemoryFiles.findIndex(f => String(f._id) === String(doc._id));
      if (idx !== -1) {
        inMemoryFiles.splice(idx, 1);
        deletedCount++;
      }
    });
    return { acknowledged: true, deletedCount };
  }
};

module.exports = FileProxy;
