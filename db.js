const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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
  subject: { type: String, default: null },
  exercise: { type: String, default: null },
  question: { type: String, default: null },
  expectedOutput: { type: String, default: null },
  size: { type: Number, default: 0 },
  tags: [String],
  description: { type: String, default: '' },
  pinned: { type: Boolean, default: false },
  downloads: { type: Number, default: 0 },
  uploadDate: { type: Date, default: Date.now }
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

const MongoFile = mongoose.model('File', fileSchema);
const MongoSuggestion = mongoose.model('Suggestion', suggestionSchema);
const MongoUserRequest = mongoose.model('UserRequest', userRequestSchema);

// JSON Fallback Store
function loadJsonDB() {
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

    // Ensure sample upload files exist in UPLOAD_DIR
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    fs.writeFileSync(path.join(uploadsDir, 'demo_py1.py'), `def greatest_of_three(a, b, c):\n    if a >= b and a >= c:\n        return a\n    elif b >= a and b >= c:\n        return b\n    else:\n        return c\n\nif __name__ == "__main__":\n    num1 = float(input("Enter first number: "))\n    num2 = float(input("Enter second number: "))\n    num3 = float(input("Enter third number: "))\n    print("Greatest number is:", greatest_of_three(num1, num2, num3))\n`);
    
    fs.writeFileSync(path.join(uploadsDir, 'demo_java1.java'), `class Node {\n    int key;\n    Node left, right;\n\n    public Node(int item) {\n        key = item;\n        left = right = null;\n    }\n}\n\npublic class BinarySearchTree {\n    Node root;\n\n    BinarySearchTree() {\n        root = null;\n    }\n\n    void insert(int key) {\n        root = insertRec(root, key);\n    }\n\n    Node insertRec(Node root, int key) {\n        if (root == null) {\n            root = new Node(key);\n            return root;\n        }\n        if (key < root.key)\n            root.left = insertRec(root.left, key);\n        else if (key > root.key)\n            root.right = insertRec(root.right, key);\n        return root;\n    }\n\n    public static void main(String[] args) {\n        BinarySearchTree tree = new BinarySearchTree();\n        tree.insert(50);\n        tree.insert(30);\n        tree.insert(20);\n        tree.insert(40);\n        System.out.println("BST Created successfully!");\n    }\n}\n`);

    fs.writeFileSync(path.join(uploadsDir, 'demo_c1.c'), `#include <stdio.h>\n\nint main() {\n    int a[2][2] = {{1, 2}, {3, 4}};\n    int b[2][2] = {{5, 6}, {7, 8}};\n    int c[2][2] = {0};\n\n    for (int i = 0; i < 2; i++) {\n        for (int j = 0; j < 2; j++) {\n            for (int k = 0; k < 2; k++) {\n                c[i][j] += a[i][k] * b[k][j];\n            }\n        }\n    }\n\n    printf("Result matrix:\\n");\n    for (int i = 0; i < 2; i++) {\n        for (int j = 0; j < 2; j++) {\n            printf("%d ", c[i][j]);\n        }\n        printf("\\n");\n    }\n    return 0;\n}\n`);

    fs.writeFileSync(path.join(uploadsDir, 'demo_cpp1.cpp'), `#include <iostream>\nusing namespace std;\n\nstruct Node {\n    int key;\n    Node *left, *right;\n    int height;\n};\n\nint height(Node *N) {\n    if (N == NULL) return 0;\n    return N->height;\n}\n\nint max(int a, int b) {\n    return (a > b) ? a : b;\n}\n\nint main() {\n    cout << "AVL Tree Module Ready" << endl;\n    return 0;\n}\n`);

    fs.writeFileSync(path.join(uploadsDir, 'demo_sql1.sql'), `-- Student DBMS Schema\nCREATE TABLE Students (\n    student_id INT PRIMARY KEY,\n    name VARCHAR(100),\n    course VARCHAR(50),\n    gpa DECIMAL(3,2)\n);\n\nINSERT INTO Students VALUES (101, 'Alex Smith', 'Computer Science', 3.85);\nINSERT INTO Students VALUES (102, 'Priya Sharma', 'Data Science', 3.92);\n\nSELECT * FROM Students WHERE gpa > 3.5;\n`);

    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch (err) {
    return { files: [], suggestions: [], requests: [] };
  }
}

function saveJsonDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

async function connectDB() {
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 2500
      });
      isMongo = true;
      console.log('Connected to MongoDB successfully.');
      return;
    } catch (err) {
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
      size: d.size || 0,
      tags: d.tags || [],
      description: d.description || '',
      pinned: false,
      downloads: 0,
      uploadDate: new Date().toISOString()
    }));
    db.files.push(...created);
    saveJsonDB(db);
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
