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
  assignmentType: { type: String, default: 'global' }, // 'global' or 'individual'
  assignedUsers: { type: [String], default: [] },
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
  assignedUsers: [{ type: String }],
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

async function connectDB() {
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    isMongo = true;
    return mongoose.connection;
  }

  if (cachedMongo) {
    try {
      await cachedMongo;
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        isMongo = true;
        return mongoose.connection;
      }
    } catch (e) {
      cachedMongo = null;
      global.__zipshareMongoConn = null;
    }
  }

  if (process.env.MONGODB_URI) {
    try {
      cachedMongo = mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        bufferCommands: false
      });
      global.__zipshareMongoConn = cachedMongo;
      await cachedMongo;
      isMongo = true;
      console.log('Connected to MongoDB successfully.');
      return mongoose.connection;
    } catch (err) {
      cachedMongo = null;
      global.__zipshareMongoConn = null;
      console.warn('MongoDB connection failed. Falling back to local JSON database store:', err.message);
    }
  } else {
    console.log('No MONGODB_URI set. Operating on local JSON file database store.');
  }
  loadJsonDB();
}

// Unified API Wrapper for Files
const filesDB = {
  async find(filter = {}, sort = { pinned: -1, uploadDate: -1 }, limit = 500) {
    if (isMongo) {
      return await MongoFile.find(filter).sort(sort).limit(limit);
    }
    const db = loadJsonDB();
    let list = [...db.files];

    function matchCond(item, cond) {
      if (!cond || typeof cond !== 'object') return true;

      if (cond.$or && Array.isArray(cond.$or)) {
        return cond.$or.some(c => matchCond(item, c));
      }
      if (cond.$and && Array.isArray(cond.$and)) {
        return cond.$and.every(c => matchCond(item, c));
      }

      for (let key in cond) {
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
          if (val === matcher.$ne || val == null || val === '') return false;
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

    // Filter logic
    if (filter.$and && Array.isArray(filter.$and)) {
      list = list.filter(item => matchCond(item, filter));
    } else if (filter.$or && Array.isArray(filter.$or)) {
      list = list.filter(item => matchCond(item, filter));
    } else if (Object.keys(filter).length > 0) {
      list = list.filter(item => matchCond(item, filter));
    }

    if (filter.pinned !== undefined && filter.pinned !== null) {
      list = list.filter(f => Boolean(f.pinned) === Boolean(filter.pinned));
    }
    if (filter.folderName !== undefined) {
      if (filter.folderName && filter.folderName.$ne === null) {
        list = list.filter(f => f.folderName !== null && f.folderName !== undefined && f.folderName !== '');
      } else if (typeof filter.folderName === 'string') {
        list = list.filter(f => f.folderName === filter.folderName);
      }
    }
    if (filter.batchId) {
      list = list.filter(f => f.batchId === filter.batchId);
    }

    // Sort logic
    list.sort((a, b) => {
      if (sort.pinned) {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      }
      if (sort.experimentNumber) {
        const ea = a.experimentNumber != null ? a.experimentNumber : 99999;
        const eb = b.experimentNumber != null ? b.experimentNumber : 99999;
        if (ea !== eb) return sort.experimentNumber < 0 ? eb - ea : ea - eb;
      }
      if (sort.uploadDate) {
        const da = new Date(a.uploadDate || 0);
        const dbTime = new Date(b.uploadDate || 0);
        return sort.uploadDate < 0 ? dbTime - da : da - dbTime;
      }
      if (sort.downloads) {
        return (b.downloads || 0) - (a.downloads || 0);
      }
      if (sort.originalName) {
        return a.originalName.localeCompare(b.originalName);
      }
      return 0;
    });

    return list.slice(0, limit);
  },

  async findById(id) {
    if (isMongo) return await MongoFile.findById(id);
    const db = loadJsonDB();
    const doc = db.files.find(f => f._id === id || f.id === id);
    if (!doc) return null;
    doc.save = async function() {
      saveJsonDB(db);
    };
    doc.deleteOne = async function() {
      db.files = db.files.filter(f => f._id !== id);
      saveJsonDB(db);
    };
    return doc;
  },

  async insertMany(docs) {
    if (isMongo) return await MongoFile.insertMany(docs);
    const db = loadJsonDB();
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
      assignmentType: d.assignmentType || 'global',
      assignedUsers: Array.isArray(d.assignedUsers) ? d.assignedUsers : [],
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
      pinned: Boolean(d.pinned),
      downloads: d.downloads || 0,
      uploadDate: d.uploadDate || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    db.files.push(...created);
    saveJsonDB(db);
    return created;
  },

  async create(doc) {
    if (isMongo) return await MongoFile.create(doc);
    const created = (await this.insertMany([doc]))[0];
    return created;
  },

  async findByIdAndUpdate(id, update, options = {}) {
    if (isMongo) return await MongoFile.findByIdAndUpdate(id, update, options);
    const db = loadJsonDB();
    const idx = db.files.findIndex(f => f._id === id);
    if (idx === -1) return null;
    db.files[idx] = { ...db.files[idx], ...update };
    saveJsonDB(db);
    return db.files[idx];
  },

  async findByIdAndDelete(id) {
    if (isMongo) return await MongoFile.findByIdAndDelete(id);
    const db = loadJsonDB();
    const doc = db.files.find(f => f._id === id);
    if (!doc) return null;
    db.files = db.files.filter(f => f._id !== id);
    saveJsonDB(db);
    return doc;
  },

  async countDocuments(filter = {}) {
    if (isMongo) return await MongoFile.countDocuments(filter);
    const list = await this.find(filter, {}, 100000);
    return list.length;
  },

  async aggregate(pipeline) {
    if (isMongo) return await MongoFile.aggregate(pipeline);
    const db = loadJsonDB();
    let totalSize = 0;
    let totalDownloads = 0;
    db.files.forEach(f => {
      totalSize += f.size || 0;
      totalDownloads += f.downloads || 0;
    });
    return [{ _id: null, totalSize, totalDownloads }];
  }
};

// Unified API Wrapper for Suggestions
const suggestionsDB = {
  async find(filter = {}, sort = { pinned: -1, order: 1 }) {
    if (isMongo) return await MongoSuggestion.find(filter).sort(sort);
    const db = loadJsonDB();
    let list = [...(db.suggestions || [])];
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (a.order || 0) - (b.order || 0);
    });
    return list;
  },

  async create(data) {
    if (isMongo) return await MongoSuggestion.create(data);
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
    return created;
  },

  async findByIdAndUpdate(id, update) {
    if (isMongo) return await MongoSuggestion.findByIdAndUpdate(id, update, { new: true });
    const db = loadJsonDB();
    if (!db.suggestions) db.suggestions = [];
    const idx = db.suggestions.findIndex(s => s._id === id);
    if (idx === -1) return null;
    db.suggestions[idx] = { ...db.suggestions[idx], ...update };
    saveJsonDB(db);
    return db.suggestions[idx];
  },

  async findByIdAndDelete(id) {
    if (isMongo) return await MongoSuggestion.findByIdAndDelete(id);
    const db = loadJsonDB();
    if (!db.suggestions) db.suggestions = [];
    const doc = db.suggestions.find(s => s._id === id);
    db.suggestions = db.suggestions.filter(s => s._id !== id);
    saveJsonDB(db);
    return doc;
  }
};

// Unified API Wrapper for User Requests
const requestsDB = {
  async find(filter = {}) {
    if (isMongo) return await MongoUserRequest.find(filter).sort({ createdAt: -1 });
    const db = loadJsonDB();
    let list = [...(db.requests || [])];
    if (filter.status) {
      list = list.filter(r => r.status === filter.status);
    }
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list;
  },

  async create(data) {
    if (isMongo) return await MongoUserRequest.create(data);
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
    return created;
  },

  async findByIdAndUpdate(id, update) {
    if (isMongo) return await MongoUserRequest.findByIdAndUpdate(id, update, { new: true });
    const db = loadJsonDB();
    if (!db.requests) db.requests = [];
    const idx = db.requests.findIndex(r => r._id === id);
    if (idx === -1) return null;
    db.requests[idx] = { ...db.requests[idx], ...update };
    saveJsonDB(db);
    return db.requests[idx];
  },

  async findByIdAndDelete(id) {
    if (isMongo) return await MongoUserRequest.findByIdAndDelete(id);
    const db = loadJsonDB();
    if (!db.requests) db.requests = [];
    const doc = db.requests.find(r => r._id === id);
    db.requests = db.requests.filter(r => r._id !== id);
    saveJsonDB(db);
    return doc;
  }
};

module.exports = {
  connectDB,
  filesDB,
  suggestionsDB,
  requestsDB
};
