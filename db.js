const mongoose = require('mongoose');
mongoose.set('bufferCommands', false); // Fail fast, don't hang if MongoDB is offline
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  // Read-only filesystem
}

let isMongo = false;
let lastMongoError = null;
let dataVersion = 1;

function bumpDataVersion() {
  dataVersion += 1;
  return dataVersion;
}

function getDataVersion() {
  return dataVersion;
}

function isMongoExpectedButDisconnected() {
  return Boolean(process.env.MONGODB_URI) && !isMongo;
}

function getLastMongoError() {
  return lastMongoError;
}

function toPlainDoc(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  if (plain._id != null) {
    plain._id = String(plain._id);
  } else if (plain.id != null) {
    plain._id = String(plain.id);
  }
  return plain;
}

function isValidObjectId(id) {
  if (!id || typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

// Mongo Models
const fileSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  storedName: { type: String, required: true },
  relativePath: { type: String, default: '' },
  folderName: { type: String, default: null },
  batchId: { type: String, default: null },
  extension: { type: String, default: 'txt' },
  category: { type: String, default: 'all' },
  course: { type: String, default: null },
  courseCode: { type: String, default: null },
  experimentNumber: { type: Number, default: null },
  experimentName: { type: String, default: null },
  matchConfidence: { type: String, default: 'high' },
  status: { type: String, default: 'available' },
  reviewReason: { type: String, default: null },
  subject: { type: String, default: null },
  exercise: { type: String, default: null },
  question: { type: String, default: null },
  expectedOutput: { type: String, default: null },
  size: { type: Number, default: 0 },
  tags: [String],
  description: { type: String, default: '' },
  content: { type: String, default: null },
  cloudinaryUrl: { type: String, default: null },
  cloudinaryPublicId: { type: String, default: null },
  assetId: { type: String, default: null },
  mimeType: { type: String, default: null },
  uploadedBy: { type: String, default: 'admin' },
  publicationStatus: { type: String, default: 'published' }, // 'draft' or 'published'
  assignmentType: { type: String, default: 'global' }, // 'global' or 'individual'
  isGloballyAssigned: { type: Boolean, default: true },
  assignedUsers: { type: [String], default: [] },
  assignedBy: { type: String, default: null },
  assignedAt: { type: String, default: null },
  assignmentHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
  zipFolder: { type: String, default: null },
  zipSource: { type: String, default: null },
  pinned: { type: Boolean, default: false },
  downloads: { type: Number, default: 0 },
  uploadDate: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const suggestionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  type: { type: String, default: 'manual' },
  pinned: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const userRequestSchema = new mongoose.Schema({
  programName: { type: String, required: true },
  subject: { type: String, required: true },
  description: { type: String, default: '' },
  status: { type: String, default: 'pending' }, // pending, approved, rejected, completed
  createdAt: { type: Date, default: Date.now }
});

const MongoFile = mongoose.models.File || mongoose.model('File', fileSchema);
const MongoSuggestion = mongoose.models.Suggestion || mongoose.model('Suggestion', suggestionSchema);
const MongoUserRequest = mongoose.models.UserRequest || mongoose.models.Request || mongoose.model('UserRequest', userRequestSchema);

// JSON Fallback Store
function loadJsonDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      files: [],
      suggestions: [],
      requests: []
    };

    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    } catch (e) {
      // Ignore write errors in read-only environments
    }
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch (err) {
    return { files: [], suggestions: [], requests: [] };
  }
}

function saveJsonDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    // Read-only filesystem safe
  }
}

let cachedMongo = global.__zipshareMongoConn || null;
let lastMongoFailureAt = 0;

async function connectDB() {
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    isMongo = true;
    lastMongoError = null;
    lastMongoFailureAt = 0;
    return mongoose.connection;
  }

  isMongo = false;

  if (cachedMongo) {
    try {
      await cachedMongo;
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        isMongo = true;
        lastMongoError = null;
        lastMongoFailureAt = 0;
        return mongoose.connection;
      }
    } catch (e) {
      cachedMongo = null;
      global.__zipshareMongoConn = null;
    }
  }

  if (process.env.MONGODB_URI) {
    // Avoid stalling concurrent requests in the same 1.5s window right after a failure
    if (lastMongoError && Date.now() - lastMongoFailureAt < 1500) {
      if (process.env.VERCEL) {
        throw new Error(lastMongoError);
      }
      loadJsonDB();
      return;
    }

    try {
      cachedMongo = mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
        bufferCommands: false
      });
      global.__zipshareMongoConn = cachedMongo;
      await cachedMongo;
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        isMongo = true;
        lastMongoError = null;
        lastMongoFailureAt = 0;
        console.log('Connected to MongoDB successfully.');
        return mongoose.connection;
      }
    } catch (err) {
      cachedMongo = null;
      global.__zipshareMongoConn = null;
      isMongo = false;
      lastMongoError = err.message || 'MongoDB connection error';
      lastMongoFailureAt = Date.now();
      console.warn('MongoDB connection failed:', err.message);
      if (process.env.VERCEL) {
        throw err;
      }
    }
  } else {
    lastMongoError = null;
    lastMongoFailureAt = 0;
    console.log('No MONGODB_URI set. Operating on local JSON file database store.');
  }
  loadJsonDB();
}

function matchJsonCondition(item, cond) {
  if (!cond || typeof cond !== 'object') return true;

  if (cond.$or && Array.isArray(cond.$or)) {
    return cond.$or.some(c => matchJsonCondition(item, c));
  }
  if (cond.$and && Array.isArray(cond.$and)) {
    return cond.$and.every(c => matchJsonCondition(item, c));
  }

  for (const key in cond) {
    if (key === '$or' || key === '$and') continue;
    const val = item[key];
    const matcher = cond[key];

    if (matcher && typeof matcher.test === 'function') {
      if (Array.isArray(val)) {
        if (!val.some(v => matcher.test(String(v)))) return false;
      } else if (val == null || !matcher.test(String(val))) {
        return false;
      }
    } else if (matcher && typeof matcher === 'object' && matcher.$in !== undefined) {
      const allowed = Array.isArray(matcher.$in) ? matcher.$in.map(x => String(x).toLowerCase()) : [];
      if (Array.isArray(val)) {
        if (!val.some(v => allowed.includes(String(v).toLowerCase()))) return false;
      } else if (!allowed.includes(String(val || '').toLowerCase())) {
        return false;
      }
    } else if (matcher && typeof matcher === 'object' && matcher.$nin !== undefined) {
      const disallowed = Array.isArray(matcher.$nin) ? matcher.$nin.map(x => String(x).toLowerCase()) : [];
      if (Array.isArray(val)) {
        if (val.some(v => disallowed.includes(String(v).toLowerCase()))) return false;
      } else if (disallowed.includes(String(val || '').toLowerCase())) {
        return false;
      }
    } else if (matcher && typeof matcher === 'object' && matcher.$ne !== undefined) {
      if (matcher.$ne === null) {
        if (val === null || val === undefined || val === '') return false;
      } else if (val === matcher.$ne) {
        return false;
      }
    } else if (matcher != null) {
      if (Array.isArray(val)) {
        if (!val.some(v => String(v).toLowerCase() === String(matcher).toLowerCase())) return false;
      } else if (String(val || '').toLowerCase() !== String(matcher).toLowerCase()) {
        return false;
      }
    }
  }
  return true;
}

// Unified API Wrapper for Files
const filesDB = {
  async find(filter = {}, sort = { pinned: -1, uploadDate: -1 }, limit = 500) {
    if (isMongo) {
      let query = MongoFile.find(filter);
      if (sort && Object.keys(sort).length > 0) {
        query = query.sort(sort);
      }
      const rows = await query.limit(limit).lean();
      return rows.map(toPlainDoc);
    }

    const db = loadJsonDB();
    let list = [...(db.files || [])];

    if (filter && Object.keys(filter).length > 0) {
      list = list.filter(item => matchJsonCondition(item, filter));
    }

    if (sort && Object.keys(sort).length > 0) {
      list.sort((a, b) => {
        if (sort.pinned) {
          if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
        }
        if (sort.experimentNumber) {
          const ea = a.experimentNumber != null ? a.experimentNumber : 99999;
          const eb = b.experimentNumber != null ? b.experimentNumber : 99999;
          if (ea !== eb) return sort.experimentNumber < 0 ? eb - ea : ea - eb;
        }
        if (sort.uploadDate) {
          const da = new Date(a.uploadDate || 0).getTime();
          const dbTime = new Date(b.uploadDate || 0).getTime();
          if (da !== dbTime) return sort.uploadDate < 0 ? dbTime - da : da - dbTime;
        }
        if (sort.updatedAt) {
          const ua = new Date(a.updatedAt || 0).getTime();
          const ub = new Date(b.updatedAt || 0).getTime();
          if (ua !== ub) return sort.updatedAt < 0 ? ub - ua : ua - ub;
        }
        if (sort.downloads) {
          if ((b.downloads || 0) !== (a.downloads || 0)) return (b.downloads || 0) - (a.downloads || 0);
        }
        if (sort.originalName) {
          return String(a.originalName || '').localeCompare(String(b.originalName || ''));
        }
        return 0;
      });
    }

    return list.slice(0, limit).map(toPlainDoc);
  },

  async findById(id) {
    if (!id) return null;
    if (isMongo) {
      if (!isValidObjectId(String(id))) return null;
      const doc = await MongoFile.findById(id).lean();
      return toPlainDoc(doc);
    }
    const db = loadJsonDB();
    const doc = (db.files || []).find(f => String(f._id || f.id) === String(id));
    return toPlainDoc(doc);
  },

  async insertMany(docs) {
    if (!Array.isArray(docs) || docs.length === 0) return [];
    if (isMongo) {
      const inserted = await MongoFile.insertMany(docs);
      bumpDataVersion();
      return inserted.map(toPlainDoc);
    }
    const db = loadJsonDB();
    if (!Array.isArray(db.files)) db.files = [];
    const created = docs.map(d => ({
      _id: crypto.randomUUID(),
      originalName: d.originalName,
      storedName: d.storedName,
      relativePath: d.relativePath || d.originalName,
      folderName: d.folderName || null,
      batchId: d.batchId || null,
      extension: d.extension || 'txt',
      category: d.category || 'all',
      course: d.course || null,
      courseCode: d.courseCode || null,
      experimentNumber: d.experimentNumber != null ? d.experimentNumber : null,
      experimentName: d.experimentName || null,
      matchConfidence: d.matchConfidence || 'high',
      status: d.status || 'available',
      reviewReason: d.reviewReason || null,
      subject: d.subject || null,
      exercise: d.exercise || null,
      question: d.question || null,
      expectedOutput: d.expectedOutput || null,
      content: d.content || null,
      cloudinaryUrl: d.cloudinaryUrl || null,
      cloudinaryPublicId: d.cloudinaryPublicId || null,
      assetId: d.assetId || null,
      mimeType: d.mimeType || null,
      uploadedBy: d.uploadedBy || 'admin',
      size: d.size || 0,
      tags: d.tags || [],
      description: d.description || '',
      publicationStatus: d.publicationStatus || 'published',
      assignmentType: d.assignmentType || 'global',
      isGloballyAssigned: d.isGloballyAssigned !== false,
      assignedUsers: Array.isArray(d.assignedUsers) ? d.assignedUsers : [],
      assignedBy: d.assignedBy || null,
      assignedAt: d.assignedAt || null,
      assignmentHistory: Array.isArray(d.assignmentHistory) ? d.assignmentHistory : [],
      zipFolder: d.zipFolder || null,
      zipSource: d.zipSource || null,
      pinned: Boolean(d.pinned),
      downloads: d.downloads || 0,
      uploadDate: d.uploadDate || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    db.files.push(...created);
    saveJsonDB(db);
    bumpDataVersion();
    return created.map(toPlainDoc);
  },

  async create(doc) {
    if (isMongo) {
      const created = await MongoFile.create(doc);
      bumpDataVersion();
      return toPlainDoc(created);
    }
    const created = (await this.insertMany([doc]))[0];
    return created;
  },

  async findByIdAndUpdate(id, update, options = { new: true }) {
    if (!id) return null;
    if (isMongo) {
      if (!isValidObjectId(String(id))) return null;
      const updated = await MongoFile.findByIdAndUpdate(id, update, { new: true, ...options }).lean();
      if (updated) bumpDataVersion();
      return toPlainDoc(updated);
    }
    const db = loadJsonDB();
    const idx = (db.files || []).findIndex(f => String(f._id || f.id) === String(id));
    if (idx === -1) return null;
    db.files[idx] = { ...db.files[idx], ...update };
    saveJsonDB(db);
    bumpDataVersion();
    return toPlainDoc(db.files[idx]);
  },

  async bulkUpdate(updates = []) {
    if (!Array.isArray(updates) || updates.length === 0) return 0;
    if (isMongo) {
      const ops = updates
        .filter(u => u && isValidObjectId(String(u.id)))
        .map(u => ({
          updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(String(u.id)) },
            update: { $set: u.update }
          }
        }));
      if (ops.length === 0) return 0;
      const result = await MongoFile.bulkWrite(ops);
      bumpDataVersion();
      return result.modifiedCount || ops.length;
    }
    const db = loadJsonDB();
    let count = 0;
    const byId = new Map((db.files || []).map((f, idx) => [String(f._id || f.id), idx]));
    for (const item of updates) {
      if (!item || !item.id) continue;
      const idx = byId.get(String(item.id));
      if (idx !== undefined) {
        db.files[idx] = { ...db.files[idx], ...item.update };
        count++;
      }
    }
    if (count > 0) {
      saveJsonDB(db);
      bumpDataVersion();
    }
    return count;
  },

  async findByIdAndDelete(id) {
    if (!id) return null;
    if (isMongo) {
      if (!isValidObjectId(String(id))) return null;
      const doc = await MongoFile.findByIdAndDelete(id).lean();
      if (doc) bumpDataVersion();
      return toPlainDoc(doc);
    }
    const db = loadJsonDB();
    const doc = (db.files || []).find(f => String(f._id || f.id) === String(id));
    if (!doc) return null;
    db.files = db.files.filter(f => String(f._id || f.id) !== String(id));
    saveJsonDB(db);
    bumpDataVersion();
    return toPlainDoc(doc);
  },

  async deleteManyByIds(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    if (isMongo) {
      const validIds = ids.map(String).filter(isValidObjectId);
      if (validIds.length === 0) return 0;
      const res = await MongoFile.deleteMany({ _id: { $in: validIds } });
      bumpDataVersion();
      return res.deletedCount || 0;
    }
    const idSet = new Set(ids.map(String));
    const db = loadJsonDB();
    const before = (db.files || []).length;
    db.files = (db.files || []).filter(f => !idSet.has(String(f._id || f.id)));
    const deletedCount = before - db.files.length;
    if (deletedCount > 0) {
      saveJsonDB(db);
      bumpDataVersion();
    }
    return deletedCount;
  },

  async countDocuments(filter = {}) {
    if (isMongo) return await MongoFile.countDocuments(filter);
    const list = await this.find(filter, {}, 100000);
    return list.length;
  },

  async aggregate(pipeline) {
    if (isMongo) {
      const res = await MongoFile.aggregate(
        Array.isArray(pipeline) && pipeline.length > 0
          ? pipeline
          : [{ $group: { _id: null, totalSize: { $sum: '$size' }, totalDownloads: { $sum: '$downloads' } } }]
      );
      return res;
    }
    const db = loadJsonDB();
    let totalSize = 0;
    let totalDownloads = 0;
    (db.files || []).forEach(f => {
      totalSize += f.size || 0;
      totalDownloads += f.downloads || 0;
    });
    return [{ _id: null, totalSize, totalDownloads }];
  }
};

// Unified API Wrapper for Suggestions
const suggestionsDB = {
  async find(filter = {}, sort = { pinned: -1, order: 1 }) {
    if (isMongo) {
      const rows = await MongoSuggestion.find(filter).sort(sort).lean();
      return rows.map(toPlainDoc);
    }
    const db = loadJsonDB();
    const list = [...(db.suggestions || [])];
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (a.order || 0) - (b.order || 0);
    });
    return list.map(toPlainDoc);
  },

  async create(data) {
    if (isMongo) {
      const created = await MongoSuggestion.create(data);
      bumpDataVersion();
      return toPlainDoc(created);
    }
    const db = loadJsonDB();
    if (!db.suggestions) db.suggestions = [];
    const created = {
      _id: crypto.randomUUID(),
      text: data.text,
      type: data.type || 'manual',
      pinned: Boolean(data.pinned),
      order: Number(data.order) || 0,
      createdAt: new Date().toISOString()
    };
    db.suggestions.push(created);
    saveJsonDB(db);
    bumpDataVersion();
    return toPlainDoc(created);
  },

  async findByIdAndUpdate(id, update) {
    if (!id) return null;
    if (isMongo) {
      if (!isValidObjectId(String(id))) return null;
      const updated = await MongoSuggestion.findByIdAndUpdate(id, update, { new: true }).lean();
      if (updated) bumpDataVersion();
      return toPlainDoc(updated);
    }
    const db = loadJsonDB();
    if (!db.suggestions) db.suggestions = [];
    const idx = db.suggestions.findIndex(s => String(s._id || s.id) === String(id));
    if (idx === -1) return null;
    db.suggestions[idx] = { ...db.suggestions[idx], ...update };
    saveJsonDB(db);
    bumpDataVersion();
    return toPlainDoc(db.suggestions[idx]);
  },

  async findByIdAndDelete(id) {
    if (!id) return null;
    if (isMongo) {
      if (!isValidObjectId(String(id))) return null;
      const deleted = await MongoSuggestion.findByIdAndDelete(id).lean();
      if (deleted) bumpDataVersion();
      return toPlainDoc(deleted);
    }
    const db = loadJsonDB();
    if (!db.suggestions) db.suggestions = [];
    const doc = db.suggestions.find(s => String(s._id || s.id) === String(id));
    if (!doc) return null;
    db.suggestions = db.suggestions.filter(s => String(s._id || s.id) !== String(id));
    saveJsonDB(db);
    bumpDataVersion();
    return toPlainDoc(doc);
  }
};

// Unified API Wrapper for User Requests
const requestsDB = {
  async find(filter = {}) {
    if (isMongo) {
      const rows = await MongoUserRequest.find(filter).sort({ createdAt: -1 }).lean();
      return rows.map(toPlainDoc);
    }
    const db = loadJsonDB();
    let list = [...(db.requests || [])];
    if (filter.status) {
      list = list.filter(r => r.status === filter.status);
    }
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list.map(toPlainDoc);
  },

  async create(data) {
    if (isMongo) {
      const created = await MongoUserRequest.create(data);
      return toPlainDoc(created);
    }
    const db = loadJsonDB();
    if (!db.requests) db.requests = [];
    const created = {
      _id: crypto.randomUUID(),
      programName: data.programName,
      subject: data.subject,
      description: data.description || '',
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    db.requests.push(created);
    saveJsonDB(db);
    return toPlainDoc(created);
  },

  async findByIdAndUpdate(id, update) {
    if (!id) return null;
    if (isMongo) {
      if (!isValidObjectId(String(id))) return null;
      const updated = await MongoUserRequest.findByIdAndUpdate(id, update, { new: true }).lean();
      return toPlainDoc(updated);
    }
    const db = loadJsonDB();
    if (!db.requests) db.requests = [];
    const idx = db.requests.findIndex(r => String(r._id || r.id) === String(id));
    if (idx === -1) return null;
    db.requests[idx] = { ...db.requests[idx], ...update };
    saveJsonDB(db);
    return toPlainDoc(db.requests[idx]);
  },

  async findByIdAndDelete(id) {
    if (!id) return null;
    if (isMongo) {
      if (!isValidObjectId(String(id))) return null;
      const deleted = await MongoUserRequest.findByIdAndDelete(id).lean();
      return toPlainDoc(deleted);
    }
    const db = loadJsonDB();
    if (!db.requests) db.requests = [];
    const doc = db.requests.find(r => String(r._id || r.id) === String(id));
    if (!doc) return null;
    db.requests = db.requests.filter(r => String(r._id || r.id) !== String(id));
    saveJsonDB(db);
    return toPlainDoc(doc);
  }
};

module.exports = {
  connectDB,
  getDataVersion,
  bumpDataVersion,
  isMongoExpectedButDisconnected,
  getLastMongoError,
  filesDB,
  suggestionsDB,
  requestsDB
};
