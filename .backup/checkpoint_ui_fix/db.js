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
  isGloballyAssigned: { type: Boolean, default: true },
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

// In-memory cache & version counter for ultra-fast reads
let memoryDB = null;
let dataVersion = 1;

function getDataVersion() {
  return dataVersion;
}

function bumpDataVersion() {
  dataVersion++;
  return dataVersion;
}

// JSON Fallback Store (cached in memory after initial load)
function loadJsonDB(forceReload = false) {
  if (memoryDB && !forceReload) {
    return memoryDB;
  }

  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      files: [
        {
          _id: 'f1',
          originalName: 'greatest_of_three_numbers.py',
          storedName: 'demo_py1.py',
          relativePath: 'greatest_of_three_numbers.py',
          folderName: null,
          batchId: null,
          extension: 'py',
          category: 'python',
          size: 1024,
          tags: ['python', 'basics', 'lab'],
          description: 'Python script to find the greatest of three numbers using conditionals.',
          pinned: true,
          downloads: 14,
          uploadDate: new Date().toISOString()
        },
        {
          _id: 'f2',
          originalName: 'BinarySearchTree.java',
          storedName: 'demo_java1.java',
          relativePath: 'BinarySearchTree.java',
          folderName: null,
          batchId: null,
          extension: 'java',
          category: 'java',
          size: 2450,
          tags: ['java', 'dsa', 'bst', 'trees'],
          description: 'Complete Java implementation of BST insertion, deletion and traversals.',
          pinned: true,
          downloads: 28,
          uploadDate: new Date().toISOString()
        },
        {
          _id: 'f3',
          originalName: 'matrix_multiplication.c',
          storedName: 'demo_c1.c',
          relativePath: 'matrix_multiplication.c',
          folderName: null,
          batchId: null,
          extension: 'c',
          category: 'c',
          size: 1580,
          tags: ['c', 'matrix', 'lab', 'arrays'],
          description: 'C program for multiplying two 3x3 matrices with dynamic validation.',
          pinned: false,
          downloads: 9,
          uploadDate: new Date().toISOString()
        },
        {
          _id: 'f4',
          originalName: 'avl_tree_rotations.cpp',
          storedName: 'demo_cpp1.cpp',
          relativePath: 'avl_tree_rotations.cpp',
          folderName: null,
          batchId: null,
          extension: 'cpp',
          category: 'adsa',
          size: 3890,
          tags: ['cpp', 'adsa', 'avl', 'rotations'],
          description: 'C++ ADSA implementation of self-balancing AVL Trees with RR, LL, RL, LR rotations.',
          pinned: true,
          downloads: 42,
          uploadDate: new Date().toISOString()
        },
        {
          _id: 'f5',
          originalName: 'student_database_schema.sql',
          storedName: 'demo_sql1.sql',
          relativePath: 'student_database_schema.sql',
          folderName: null,
          batchId: null,
          extension: 'sql',
          category: 'dbms',
          size: 1980,
          tags: ['dbms', 'sql', 'queries', 'joins'],
          description: 'DBMS SQL DDL and DML queries for University Management System.',
          pinned: false,
          downloads: 19,
          uploadDate: new Date().toISOString()
        },
        {
          _id: 'f6',
          originalName: 'Sample_Lab_Project',
          storedName: 'demo_folder1',
          relativePath: 'Sample_Lab_Project/main.py',
          folderName: 'Sample_Lab_Project',
          batchId: 'batch_folder_1',
          extension: 'py',
          category: 'python',
          size: 4096,
          tags: ['python', 'folder', 'project'],
          description: 'Sample Lab Project Folder containing multi-file setup.',
          pinned: false,
          downloads: 7,
          uploadDate: new Date().toISOString()
        }
      ],
      suggestions: [
        { _id: 's1', text: 'AVL Tree Implementation', type: 'manual', pinned: true, order: 1, createdAt: new Date().toISOString() },
        { _id: 's2', text: 'Java Threading Lab', type: 'manual', pinned: true, order: 2, createdAt: new Date().toISOString() },
        { _id: 's3', text: 'DBMS Normalization SQL', type: 'manual', pinned: false, order: 3, createdAt: new Date().toISOString() },
        { _id: 's4', text: 'Python Greatest of Three', type: 'manual', pinned: false, order: 4, createdAt: new Date().toISOString() }
      ],
      requests: [
        {
          _id: 'r1',
          programName: 'Dijkstra Shortest Path in C++',
          subject: 'ADSA',
          description: 'Need graph algorithm for finding shortest path with adjacency matrix.',
          status: 'pending',
          createdAt: new Date().toISOString()
        }
      ]
    };

    try {
      const isVercel = Boolean(process.env.VERCEL);
      const os = require('os');
      const uploadsDir = isVercel ? path.join(os.tmpdir(), 'zipshare_uploads') : path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    } catch (e) {
      // Ignore write errors in read-only environments
    }
    memoryDB = initial;
    return memoryDB;
  }
  try {
    memoryDB = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    if (!memoryDB.files) memoryDB.files = [];
    if (!memoryDB.suggestions) memoryDB.suggestions = [];
    if (!memoryDB.requests) memoryDB.requests = [];
    return memoryDB;
  } catch (err) {
    memoryDB = { files: [], suggestions: [], requests: [] };
    return memoryDB;
  }
}

function saveJsonDB(data) {
  memoryDB = data;
  bumpDataVersion();
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data));
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
    if (!memoryDB) {
      console.log('No MONGODB_URI set. Operating on local JSON file database store.');
    }
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

    if (sort && Object.keys(sort).length > 0) {
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
    }

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
    if (isMongo) {
      const res = await MongoFile.insertMany(docs);
      bumpDataVersion();
      return res;
    }
    const db = loadJsonDB();
    const now = new Date().toISOString();
    const created = docs.map(d => ({
      _id: crypto.randomUUID(),
      originalName: d.originalName,
      storedName: d.storedName,
      relativePath: d.relativePath || d.originalName,
      folderName: d.folderName || null,
      zipFolder: d.zipFolder || null,
      zipSource: d.zipSource || null,
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
      isGloballyAssigned: d.isGloballyAssigned !== false,
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
      pinned: Boolean(d.pinned),
      downloads: d.downloads || 0,
      uploadDate: d.uploadDate || now,
      updatedAt: now
    }));
    db.files.push(...created);
    saveJsonDB(db);
    return created;
  },

  async create(doc) {
    if (isMongo) {
      const res = await MongoFile.create(doc);
      bumpDataVersion();
      return res;
    }
    const created = (await this.insertMany([doc]))[0];
    return created;
  },

  async findByIdAndUpdate(id, update, options = {}) {
    if (isMongo) {
      const res = await MongoFile.findByIdAndUpdate(id, update, options);
      bumpDataVersion();
      return res;
    }
    const db = loadJsonDB();
    const idx = db.files.findIndex(f => f._id === id || f.id === id);
    if (idx === -1) return null;
    db.files[idx] = { ...db.files[idx], ...update };
    saveJsonDB(db);
    return db.files[idx];
  },

  async bulkUpdate(updates = []) {
    if (!updates.length) return 0;
    if (isMongo) {
      const ops = updates.map(u => ({
        updateOne: { filter: { _id: u.id }, update: { $set: u.update } }
      }));
      await MongoFile.bulkWrite(ops);
      bumpDataVersion();
      return updates.length;
    }
    const db = loadJsonDB();
    const idxMap = new Map();
    db.files.forEach((f, i) => idxMap.set(f._id || f.id, i));
    let count = 0;
    for (const u of updates) {
      const idx = idxMap.get(u.id);
      if (idx !== undefined) {
        db.files[idx] = { ...db.files[idx], ...u.update };
        count++;
      }
    }
    if (count > 0) saveJsonDB(db);
    return count;
  },

  async deleteManyByIds(ids = []) {
    if (!ids.length) return 0;
    if (isMongo) {
      const res = await MongoFile.deleteMany({ _id: { $in: ids } });
      bumpDataVersion();
      return res.deletedCount || 0;
    }
    const db = loadJsonDB();
    const idSet = new Set(ids);
    const before = db.files.length;
    db.files = db.files.filter(f => !idSet.has(f._id || f.id));
    const removed = before - db.files.length;
    if (removed > 0) saveJsonDB(db);
    return removed;
  },

  async findByIdAndDelete(id) {
    if (isMongo) {
      const res = await MongoFile.findByIdAndDelete(id);
      bumpDataVersion();
      return res;
    }
    const db = loadJsonDB();
    const doc = db.files.find(f => f._id === id || f.id === id);
    if (!doc) return null;
    db.files = db.files.filter(f => (f._id || f.id) !== id);
    saveJsonDB(db);
    return doc;
  },

  async countDocuments(filter = {}) {
    if (isMongo) return await MongoFile.countDocuments(filter);
    if (!filter || Object.keys(filter).length === 0) {
      return loadJsonDB().files.length;
    }
    const list = await this.find(filter, {}, 100000);
    return list.length;
  },

  async aggregate(pipeline) {
    if (isMongo) return await MongoFile.aggregate(pipeline);
    const db = loadJsonDB();
    let totalSize = 0;
    let totalDownloads = 0;
    for (const f of db.files) {
      totalSize += f.size || 0;
      totalDownloads += f.downloads || 0;
    }
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
    if (isMongo) {
      const res = await MongoSuggestion.create(data);
      bumpDataVersion();
      return res;
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
    return created;
  },

  async findByIdAndUpdate(id, update) {
    if (isMongo) {
      const res = await MongoSuggestion.findByIdAndUpdate(id, update, { new: true });
      bumpDataVersion();
      return res;
    }
    const db = loadJsonDB();
    if (!db.suggestions) db.suggestions = [];
    const idx = db.suggestions.findIndex(s => s._id === id);
    if (idx === -1) return null;
    db.suggestions[idx] = { ...db.suggestions[idx], ...update };
    saveJsonDB(db);
    return db.suggestions[idx];
  },

  async findByIdAndDelete(id) {
    if (isMongo) {
      const res = await MongoSuggestion.findByIdAndDelete(id);
      bumpDataVersion();
      return res;
    }
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
  getDataVersion,
  bumpDataVersion,
  filesDB,
  suggestionsDB,
  requestsDB
};
