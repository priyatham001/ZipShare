const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const router = express.Router();
const { filesDB, suggestionsDB, getDataVersion } = require('../db');
const { requireAdmin, verifyAdminToken } = require('../middleware/auth');
const { isCloudinaryConfigured, uploadToCloudinary, deleteFromCloudinary, fetchRemoteContent } = require('../services/cloudinary');
const { matchFileToSyllabus, detectContentLanguage } = require('../services/syllabusMatcher');
const { getCourseByKey } = require('../services/syllabusData');

let fileStatsCache = { version: -1, data: null };
let fileSuggestionsCache = { version: -1, data: null };
const fileListCache = { version: -1, entries: new Map() };

function toSummaryFile(f) {
  if (!f || typeof f !== 'object') return f;
  const { content, ...rest } = f;
  return rest;
}

const isVercel = Boolean(process.env.VERCEL);
// Safe upload directory: on Vercel use /tmp to prevent read-only filesystem crash, on Render/local use ./uploads
const UPLOAD_DIR = isVercel
  ? path.join(os.tmpdir(), 'zipshare_uploads')
  : path.join(__dirname, '..', 'uploads');

try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('Could not initialize local upload directory (read-only filesystem):', err.message);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      }
    } catch (e) {}
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).slice(0, 10);
    cb(null, crypto.randomUUID() + safeExt);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024, files: 500 }
});

const CODE_EXTENSIONS = ['java', 'py', 'c', 'cpp', 'js', 'ts', 'html', 'css', 'sql', 'txt', 'md', 'json'];

// Load syllabus for auto-matching
let SYLLABUS_DATA = {};
try {
  const syllabusPath = path.join(__dirname, '..', 'public', 'syllabus.json');
  if (fs.existsSync(syllabusPath)) {
    SYLLABUS_DATA = JSON.parse(fs.readFileSync(syllabusPath, 'utf8'));
  }
} catch (e) {
  console.error('Failed to load syllabus.json:', e.message);
}

function autoMatchSyllabus(filename, categoryHint = null) {
  const lowerName = (filename || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [subKey, subObj] of Object.entries(SYLLABUS_DATA)) {
    if (categoryHint && categoryHint !== 'all' && categoryHint !== subKey) continue;
    for (const ex of subObj.exercises || []) {
      for (const q of ex.questions || []) {
        const matchFound = (q.keywords || []).some(kw => {
          const cleanKw = kw.toLowerCase().replace(/[^a-z0-9]/g, '');
          return cleanKw && lowerName.includes(cleanKw);
        });
        if (matchFound) {
          return {
            subject: subKey,
            exercise: ex.title,
            question: q.title,
            expectedOutput: q.expectedOutput || null,
            description: q.description || ''
          };
        }
      }
    }
  }
  return null;
}

const CATEGORY_ALIASES = {
  python: ['python', 'py'],
  py: ['python', 'py'],
  java: ['java'],
  c: ['c', 'c language', 'clanguage'],
  'c language': ['c', 'c language', 'clanguage'],
  clanguage: ['c', 'c language', 'clanguage'],
  cpp: ['cpp', 'c++', 'cc', 'cxx'],
  'c++': ['cpp', 'c++', 'cc', 'cxx'],
  adsa: ['adsa', 'dsa', 'advanced data structures', 'tree', 'graph', 'avl', 'binarysearchtree'],
  dbms: ['dbms', 'sql', 'database', 'database management systems'],
  sql: ['dbms', 'sql', 'database'],
  os: ['os', 'operating systems', 'operating system', 'scheduling', 'bankers', 'deadlock', 'process'],
  cn: ['cn', 'computer networks', 'networks', 'networking', 'socket', 'tcp', 'udp'],
  linux: ['linux', 'linux administration', 'shell', 'bash', 'ubuntu'],
  cyber: ['cyber', 'cyber security', 'cybersecurity', 'cryptography', 'cipher', 'encryption']
};

function sanitizeRelativePath(p) {
  if (!p) return '';
  let clean = String(p).replace(/\\/g, '/');
  clean = clean.replace(/^[a-zA-Z]:\//, '');
  clean = clean.replace(/^\/+/, '');
  return clean.split('/').filter(seg => seg && seg !== '.' && seg !== '..').join('/');
}

function detectCategory(ext, relPath = '', originalName = '') {
  const e = (ext || '').toLowerCase().replace('.', '');
  const pathLower = (relPath + ' ' + originalName).toLowerCase();

  // Definitive language extensions must never be overridden by keywords (e.g. StudentDatabase.java -> java, not dbms)
  if (e === 'java') return 'java';
  if (e === 'py') return 'python';
  if (e === 'sql') return 'dbms';
  if (e === 'c' || e === 'cpp' || e === 'cc' || e === 'cxx') {
    if (
      pathLower.includes('adsa') || pathLower.includes('dsa') || pathLower.includes('tree') ||
      pathLower.includes('graph') || pathLower.includes('avl') || pathLower.includes('heap') ||
      pathLower.includes('queens') || pathLower.includes('knapsack') || pathLower.includes('sort') ||
      pathLower.includes('shortest') || pathLower.includes('job sequencing')
    ) {
      return 'adsa';
    }
    return e === 'c' ? 'c' : 'cpp';
  }

  if (pathLower.includes('adsa') || pathLower.includes('tree') || pathLower.includes('graph') || pathLower.includes('avl') || pathLower.includes('bst')) return 'adsa';
  if (pathLower.includes('dbms') || pathLower.includes('sql') || pathLower.includes('database') || pathLower.includes('query')) return 'dbms';
  if (pathLower.includes('os') || pathLower.includes('operating') || pathLower.includes('schedul') || pathLower.includes('banker') || pathLower.includes('deadlock')) return 'os';
  if (pathLower.includes('cn') || pathLower.includes('network') || pathLower.includes('socket') || pathLower.includes('tcp') || pathLower.includes('udp')) return 'cn';
  if (pathLower.includes('linux') || pathLower.includes('bash') || pathLower.includes('shell')) return 'linux';
  if (pathLower.includes('cyber') || pathLower.includes('crypto') || pathLower.includes('cipher') || pathLower.includes('aes')) return 'cyber';

  if (e === 'pdf') return 'pdf';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e)) return 'zip';
  return 'all';
}

function matchesStrictCategory(file, catClean) {
  const fCat = (file.category || '').toLowerCase().trim();
  const fExt = (file.extension || '').toLowerCase().replace('.', '').trim();
  const contentLang = detectContentLanguage(file.content);

  if (catClean === 'java') {
    if (['py', 'c', 'cpp', 'cc', 'cxx', 'sql'].includes(fExt)) return false;
    if (contentLang && contentLang !== 'java') return false;
    return fCat === 'java' || fExt === 'java';
  }
  if (catClean === 'python' || catClean === 'py') {
    if (['java', 'c', 'cpp', 'cc', 'cxx', 'sql'].includes(fExt)) return false;
    if (contentLang && contentLang !== 'python') return false;
    return fCat === 'python' || fCat === 'py' || fExt === 'py';
  }
  if (catClean === 'c' || catClean === 'c language' || catClean === 'clanguage') {
    if (['java', 'py', 'sql'].includes(fExt)) return false;
    if (contentLang && contentLang !== 'c') return false;
    return ['c', 'cpp'].includes(fCat) || ['c', 'cpp', 'cc', 'cxx'].includes(fExt);
  }
  if (catClean === 'cpp' || catClean === 'c++') {
    if (['java', 'py', 'sql', 'c'].includes(fExt)) return false;
    if (contentLang && contentLang !== 'c') return false;
    return fCat === 'cpp' || ['cpp', 'cc', 'cxx'].includes(fExt);
  }
  if (catClean === 'dbms' || catClean === 'sql') {
    if (['java', 'py', 'c', 'cpp', 'cc', 'cxx'].includes(fExt)) return false;
    if (contentLang && contentLang !== 'dbms') return false;
    return fCat === 'dbms' || fCat === 'sql' || fExt === 'sql';
  }
  if (catClean === 'adsa' || catClean === 'dsa') {
    if (['sql', 'py', 'java'].includes(fExt)) return false;
    if (contentLang && contentLang !== 'c') return false;
    return fCat === 'adsa' || fCat === 'dsa';
  }

  const terms = CATEGORY_ALIASES[catClean] || [catClean];
  return terms.includes(fCat) || terms.includes(fExt);
}

// POST /api/files/upload - Upload files or folder (Admin only)
router.post('/upload', requireAdmin, upload.array('files', 500), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files received.' });
    }

    let rawPaths = req.body.paths || [];
    if (!Array.isArray(rawPaths)) rawPaths = [rawPaths];

    const { subject: bodySubject, exercise: bodyExercise, question: bodyQuestion, expectedOutput: bodyExpectedOutput, description: bodyDesc } = req.body;

    const isFolderUpload = rawPaths.some(p => p && p.includes('/'));
    const batchId = isFolderUpload ? crypto.randomUUID() : null;

    const docs = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const relPath = sanitizeRelativePath(rawPaths[i]) || file.originalname;
      const topFolder = relPath.includes('/') ? relPath.split('/')[0] : null;
      const ext = path.extname(file.originalname).replace('.', '').toLowerCase();
      let cat = detectCategory(ext, relPath, file.originalname);

      // Auto-match if not passed
      const match = autoMatchSyllabus(file.originalname, bodySubject || cat);
      const fileSubject = bodySubject || (match ? match.subject : cat);
      const fileExercise = bodyExercise || (match ? match.exercise : null);
      const fileQuestion = bodyQuestion || (match ? match.question : null);
      const fileExpectedOutput = bodyExpectedOutput || (match ? match.expectedOutput : null);
      const fileDesc = bodyDesc || (match ? match.description : (topFolder ? `Part of ${topFolder} folder` : ''));

      if (fileSubject && ['java', 'python', 'c', 'cpp', 'adsa', 'dbms', 'os', 'cn', 'linux', 'cyber'].includes(fileSubject.toLowerCase())) {
        cat = fileSubject.toLowerCase();
      }

      let cloudUrl = null;
      let cloudPublicId = null;
      let assetId = null;
      let fileContent = null;

      // Read small code or text file into content cache
      if (CODE_EXTENSIONS.includes(ext) && file.size < 300 * 1024) {
        try {
          fileContent = fs.readFileSync(file.path, 'utf-8');
        } catch (e) { /* ignore */ }
      }

      // Multi-signal Official Syllabus Matcher
      let syllabusMatch = matchFileToSyllabus({
        originalName: file.originalname,
        extension: ext,
        relativePath: relPath,
        content: fileContent,
        category: bodySubject || cat
      });

      // Admin manual assignment override from upload form if specified
      if (req.body.experimentNumber && req.body.category) {
        const course = getCourseByKey(req.body.category);
        if (course) {
          const exp = course.experiments.find(e => e.number === parseInt(req.body.experimentNumber, 10));
          if (exp) {
            syllabusMatch = {
              courseKey: course.key,
              course: course.course,
              courseCode: course.courseCode,
              category: course.category,
              experimentNumber: exp.number,
              experimentName: exp.name,
              matchConfidence: 'high',
              status: 'available'
            };
          }
        }
      }

      const assignedCategory = syllabusMatch.category || cat;
      const fileCourse = syllabusMatch.course || null;
      const fileCourseCode = syllabusMatch.courseCode || null;
      const fileExpNumber = syllabusMatch.experimentNumber || null;
      const fileExpName = syllabusMatch.experimentName || null;
      const fileMatchConfidence = syllabusMatch.matchConfidence || 'low';
      const fileStatus = syllabusMatch.status || 'available';
      const fileReviewReason = syllabusMatch.reviewReason || null;

      if (isCloudinaryConfigured()) {
        try {
          const resType = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'].includes(ext) ? 'auto' : 'raw';
          const cloudRes = await uploadToCloudinary(file.path, {
            folder: topFolder ? `zipshare_uploads/${topFolder}` : 'zipshare_uploads',
            resource_type: resType
          });
          cloudUrl = cloudRes.secure_url;
          cloudPublicId = cloudRes.public_id;
          assetId = cloudRes.asset_id || null;

          // Clean up temp file
          try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
        } catch (cErr) {
          console.error(`Cloudinary upload failed for ${file.originalname}:`, cErr.message);
        }
      }

      // Automatically extract and index code programs inside uploaded .zip archives
      const zipExtractedDocs = [];
      if (ext === 'zip' && fs.existsSync(file.path)) {
        const zipBase = path.basename(file.originalname, '.zip');
        const zipBatchId = `zip-${crypto.randomUUID()}`;
        const tmpExtractDir = path.join(os.tmpdir(), `zipshare_extract_${crypto.randomUUID()}`);
        try {
          fs.mkdirSync(tmpExtractDir, { recursive: true });
          execFileSync('unzip', ['-q', '-o', file.path, '-d', tmpExtractDir], { timeout: 15000 });
          const walkExtract = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                if (!entry.name.startsWith('__MACOSX') && !entry.name.startsWith('.')) walkExtract(full);
              } else if (entry.isFile() && !entry.name.startsWith('.')) {
                const entryExt = path.extname(entry.name).replace('.', '').toLowerCase();
                if (!CODE_EXTENSIONS.includes(entryExt)) continue;
                const relInside = sanitizeRelativePath(path.relative(tmpExtractDir, full));
                let entryContent = null;
                const stat = fs.statSync(full);
                if (stat.size < 300 * 1024) {
                  try { entryContent = fs.readFileSync(full, 'utf8'); } catch (e) {}
                }
                const storedEntry = crypto.randomUUID() + '.' + entryExt;
                try { fs.copyFileSync(full, path.join(UPLOAD_DIR, storedEntry)); } catch (e) {}
                const innerCat = detectCategory(entryExt, relInside, entry.name);
                const innerMatch = matchFileToSyllabus({
                  originalName: entry.name,
                  extension: entryExt,
                  relativePath: relInside,
                  content: entryContent,
                  category: bodySubject || innerCat
                });
                const innerAssignedCat = innerMatch.category || innerCat;
                zipExtractedDocs.push({
                  originalName: entry.name,
                  storedName: storedEntry,
                  relativePath: relInside,
                  folderName: zipBase,
                  zipFolder: zipBase,
                  zipSource: file.originalname,
                  batchId: zipBatchId,
                  extension: entryExt,
                  category: innerAssignedCat,
                  course: innerMatch.course || null,
                  courseCode: innerMatch.courseCode || null,
                  experimentNumber: innerMatch.experimentNumber || null,
                  experimentName: innerMatch.experimentName || null,
                  matchConfidence: innerMatch.matchConfidence || 'low',
                  status: innerMatch.status || 'available',
                  reviewReason: innerMatch.reviewReason || null,
                  subject: innerMatch.course || innerAssignedCat,
                  size: stat.size,
                  mimeType: 'text/plain',
                  content: entryContent,
                  uploadedBy: 'admin',
                  tags: Array.from(new Set([entryExt, innerAssignedCat, zipBase, 'zip'])),
                  description: innerMatch.experimentName ? `#${innerMatch.experimentNumber} ${innerMatch.experimentName}` : `From ${file.originalname}`,
                  pinned: false,
                  downloads: 0,
                  uploadDate: new Date(),
                  updatedAt: new Date()
                });
              }
            }
          };
          walkExtract(tmpExtractDir);
        } catch (zipErr) {
          console.warn('Zip extraction skipped:', zipErr.message);
        } finally {
          try { fs.rmSync(tmpExtractDir, { recursive: true, force: true }); } catch (e) {}
        }
      }

      if (ext === 'zip' && zipExtractedDocs.length > 0) {
        // Drop redundant outer .zip wrapper when individual code files were extracted
        try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch (e) {}
        docs.push(...zipExtractedDocs);
      } else {
        docs.push({
          originalName: file.originalname,
          storedName: file.filename,
          relativePath: relPath,
          folderName: topFolder || (ext === 'zip' ? path.basename(file.originalname, '.zip') : null),
          zipFolder: ext === 'zip' ? path.basename(file.originalname, '.zip') : null,
          zipSource: ext === 'zip' ? file.originalname : null,
          batchId: topFolder ? batchId : (ext === 'zip' ? crypto.randomUUID() : null),
          extension: ext,
          category: ext === 'zip' ? 'zip' : assignedCategory,
          course: ext === 'zip' ? null : fileCourse,
          courseCode: ext === 'zip' ? null : fileCourseCode,
          experimentNumber: ext === 'zip' ? null : fileExpNumber,
          experimentName: ext === 'zip' ? null : fileExpName,
          matchConfidence: ext === 'zip' ? 'high' : fileMatchConfidence,
          status: ext === 'zip' ? 'available' : fileStatus,
          reviewReason: ext === 'zip' ? null : fileReviewReason,
          subject: fileCourse || fileSubject,
          exercise: fileExercise,
          question: fileQuestion,
          expectedOutput: fileExpectedOutput,
          size: file.size,
          mimeType: file.mimetype,
          content: fileContent,
          cloudinaryUrl: cloudUrl,
          cloudinaryPublicId: cloudPublicId,
          assetId: assetId,
          uploadedBy: 'admin',
          tags: Array.from(new Set([ext, ext === 'zip' ? 'zip' : assignedCategory, fileSubject, topFolder].filter(Boolean))),
          description: fileExpName ? `${fileExpNumber ? `#${fileExpNumber} ` : ''}${fileExpName}` : fileDesc,
          pinned: false,
          downloads: 0,
          uploadDate: new Date(),
          updatedAt: new Date()
        });
      }
    }

    // Deduplicate within current batch and update existing matching DB records instead of duplicating
    const existingFiles = await filesDB.find({}, {}, 10000);
    const byRelPath = new Map();
    const byCatName = new Map();
    for (const ef of existingFiles) {
      if (ef.relativePath) byRelPath.set(String(ef.relativePath).toLowerCase().trim(), ef);
      if (ef.originalName) {
        const key = `${String(ef.category || '').toLowerCase().trim()}::${String(ef.originalName).toLowerCase().trim()}`;
        byCatName.set(key, ef);
      }
    }

    const dedupedBatchMap = new Map();
    for (const d of docs) {
      const k = d.relativePath
        ? `rel:${String(d.relativePath).toLowerCase().trim()}`
        : `cn:${String(d.category || '').toLowerCase().trim()}::${String(d.originalName || '').toLowerCase().trim()}`;
      const prev = dedupedBatchMap.get(k);
      if (prev && prev.storedName && prev.storedName !== d.storedName) {
        try {
          const oldPath = path.join(UPLOAD_DIR, prev.storedName);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        } catch (e) {}
      }
      dedupedBatchMap.set(k, d);
    }

    const toInsert = [];
    const toUpdate = [];
    const updatedResults = [];

    for (const d of dedupedBatchMap.values()) {
      const relKey = d.relativePath ? String(d.relativePath).toLowerCase().trim() : '';
      const cnKey = `${String(d.category || '').toLowerCase().trim()}::${String(d.originalName || '').toLowerCase().trim()}`;
      const matchExisting = (relKey && byRelPath.get(relKey)) || byCatName.get(cnKey);

      if (matchExisting) {
        if (matchExisting.storedName && matchExisting.storedName !== d.storedName) {
          try {
            const oldPath = path.join(UPLOAD_DIR, matchExisting.storedName);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          } catch (e) {}
        }
        const existingId = matchExisting._id || matchExisting.id;
        toUpdate.push({ id: existingId, update: d });
        updatedResults.push({ ...matchExisting, ...d, _id: existingId });
      } else {
        toInsert.push(d);
      }
    }

    if (toUpdate.length > 0) {
      await filesDB.bulkUpdate(toUpdate);
    }
    const saved = toInsert.length > 0 ? await filesDB.insertMany(toInsert) : [];
    const combined = [...updatedResults, ...saved];
    res.status(201).json({
      message: 'Upload Successful',
      files: combined.map(toSummaryFile),
      insertedCount: saved.length,
      updatedCount: updatedResults.length
    });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// GET /api/files - list + advanced multi-term search + category filter + exercise filter
router.get('/', async (req, res) => {
  try {
    const { q, filter, category, exercise, question, subject, sort } = req.query;
    const activeCategory = category || filter;

    const andConditions = [];

    if (q && q.trim()) {
      const qClean = q.trim();
      const regex = new RegExp(qClean, 'i');
      const orList = [
        { experimentName: regex },
        { course: regex },
        { courseCode: regex },
        { originalName: regex },
        { relativePath: regex },
        { folderName: regex },
        { zipFolder: regex },
        { zipSource: regex },
        { tags: regex },
        { description: regex },
        { extension: regex },
        { category: regex },
        { subject: regex },
        { exercise: regex },
        { question: regex }
      ];

      const numVal = parseInt(qClean.replace(/^#/, ''), 10);
      if (!isNaN(numVal) && numVal > 0) {
        orList.push({ experimentNumber: numVal });
      }

      andConditions.push({ $or: orList });
    }

    if (activeCategory && activeCategory !== 'all') {
      const catClean = activeCategory.toLowerCase().trim();
      if (catClean === 'pinned') {
        andConditions.push({ pinned: true });
      } else if (catClean === 'folders' || catClean === 'zip') {
        andConditions.push({
          $or: [
            { folderName: { $ne: null } },
            { zipFolder: { $ne: null } },
            { extension: 'zip' },
            { category: 'zip' }
          ]
        });
      } else if (catClean === 'java') {
        andConditions.push({ $or: [{ category: /^java$/i }, { extension: /^java$/i }] });
      } else if (catClean === 'python' || catClean === 'py') {
        andConditions.push({ $or: [{ category: /^(python|py)$/i }, { extension: /^py$/i }] });
      } else if (catClean === 'c' || catClean === 'c language' || catClean === 'clanguage') {
        andConditions.push({ $or: [{ category: /^(c|cpp)$/i }, { extension: /^(c|cpp|cc|cxx)$/i }] });
      } else if (catClean === 'cpp' || catClean === 'c++') {
        andConditions.push({ $or: [{ category: /^cpp$/i }, { extension: /^(cpp|cc|cxx)$/i }] });
      } else if (catClean === 'dbms' || catClean === 'sql') {
        andConditions.push({ $or: [{ category: /^(dbms|sql)$/i }, { extension: /^sql$/i }] });
      } else if (catClean === 'adsa' || catClean === 'dsa') {
        andConditions.push({ category: /^(adsa|dsa)$/i });
      } else {
        const terms = CATEGORY_ALIASES[catClean] || [catClean];
        const regexGroup = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const exactRegex = new RegExp(`^(${regexGroup})$`, 'i');
        andConditions.push({
          $or: [
            { category: exactRegex },
            { extension: exactRegex },
            { subject: exactRegex }
          ]
        });
      }
    }

    if (subject && subject !== 'all') {
      const subClean = subject.toLowerCase().trim();
      andConditions.push({
        $or: [
          { subject: new RegExp(subClean, 'i') },
          { category: new RegExp(subClean, 'i') },
          { course: new RegExp(subClean, 'i') }
        ]
      });
    }

    if (exercise) {
      andConditions.push({ exercise: new RegExp(exercise.trim(), 'i') });
    }

    if (question) {
      andConditions.push({ question: new RegExp(question.trim(), 'i') });
    }

    const isAdmin = verifyAdminToken(req);
    const userEmail = (req.query.userEmail || req.headers['x-user-email'] || '').toLowerCase().trim();

    const version = getDataVersion();
    if (fileListCache.version !== version) {
      fileListCache.version = version;
      fileListCache.entries.clear();
    }
    const listCacheKey = `${isAdmin ? 1 : 0}|${userEmail}|${q || ''}|${activeCategory || ''}|${subject || ''}|${exercise || ''}|${question || ''}|${sort || ''}`;
    if (fileListCache.entries.has(listCacheKey)) {
      return res.json(fileListCache.entries.get(listCacheKey));
    }

    if (!isAdmin) {
      andConditions.push({ status: { $ne: 'draft' } });
    }

    const query = andConditions.length > 0 ? { $and: andConditions } : {};

    let sortSpec = { pinned: -1, experimentNumber: 1, uploadDate: -1 };
    if (sort === 'recent') sortSpec = { pinned: -1, uploadDate: -1 };
    else if (sort === 'popular') sortSpec = { pinned: -1, downloads: -1 };
    else if (sort === 'name') sortSpec = { pinned: -1, experimentName: 1, originalName: 1 };

    const files = await filesDB.find(query, sortSpec, 500);

    let filteredFiles = files;
    if (activeCategory && !['all', 'pinned', 'folders', 'zip'].includes(activeCategory.toLowerCase().trim())) {
      const catClean = activeCategory.toLowerCase().trim();
      filteredFiles = filteredFiles.filter(f => matchesStrictCategory(f, catClean));
    }
    if (!isAdmin) {
      filteredFiles = filteredFiles.filter(f => {
        if (f.status === 'draft') return false;
        if (f.assignmentType === 'individual') {
          if (!userEmail) return false;
          const assigned = Array.isArray(f.assignedUsers) ? f.assignedUsers : [];
          return assigned.some(u => String(u).toLowerCase().trim() === userEmail);
        }
        return true;
      });
    }

    const resultPayload = filteredFiles.map(toSummaryFile);
    if (fileListCache.entries.size >= 80) fileListCache.entries.clear();
    fileListCache.entries.set(listCacheKey, resultPayload);
    res.json(resultPayload);
  } catch (err) {
    console.error('List files error:', err.message);
    res.status(500).json({ error: 'Could not load file list.' });
  }
});

// GET /api/files/stats
router.get('/stats', async (req, res) => {
  try {
    const version = getDataVersion();
    if (fileStatsCache.version === version && fileStatsCache.data) {
      return res.json(fileStatsCache.data);
    }

    const [totalFiles, pinned, agg] = await Promise.all([
      filesDB.countDocuments(),
      filesDB.countDocuments({ pinned: true }),
      filesDB.aggregate([])
    ]);
    const data = {
      totalFiles,
      pinned,
      todayUploads: totalFiles,
      totalDownloads: agg[0]?.totalDownloads || 0,
      storageUsed: agg[0]?.totalSize || 0
    };
    fileStatsCache = { version, data };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Could not load stats.' });
  }
});

// GET /api/files/suggestions
router.get('/suggestions', async (req, res) => {
  try {
    const version = getDataVersion();
    if (fileSuggestionsCache.version === version && fileSuggestionsCache.data) {
      return res.json(fileSuggestionsCache.data);
    }

    const manual = await suggestionsDB.find();
    const recentCode = await filesDB.find({ extension: { $in: CODE_EXTENSIONS } }, { uploadDate: -1 }, 6);

    const data = {
      trending: manual.map(s => s.text),
      recent: recentCode.map(f => f.originalName)
    };
    fileSuggestionsCache = { version, data };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Could not load suggestions.' });
  }
});

// GET /api/files/previews/batch - Fast bulk preview prefetch for instant code viewing
router.get('/previews/batch', async (req, res) => {
  try {
    const rawIds = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 40);
    const category = (req.query.category || '').toLowerCase().trim();
    let targets = [];

    if (rawIds.length > 0) {
      const idSet = new Set(rawIds);
      const all = await filesDB.find({}, {}, 10000);
      targets = all.filter(f => idSet.has(f._id || f.id));
    } else if (category) {
      const all = await filesDB.find({}, { experimentNumber: 1 }, 10000);
      targets = all
        .filter(f => f.status === 'available' && (category === 'all' || (f.category || '').toLowerCase() === category))
        .slice(0, 40);
    }

    const isAdmin = verifyAdminToken(req);
    const previews = {};
    for (const file of targets) {
      if (!isAdmin && (file.status === 'draft' || file.assignmentType === 'individual')) continue;
      const ext = (file.extension || '').toLowerCase();
      if (!CODE_EXTENSIONS.includes(ext)) continue;
      let content = file.content;
      if ((content === null || content === undefined) && file.storedName) {
        const fullPath = path.join(UPLOAD_DIR, file.storedName);
        if (fs.existsSync(fullPath)) {
          try { content = fs.readFileSync(fullPath, 'utf-8').slice(0, 200000); } catch (e) {}
        }
      }
      if (content !== null && content !== undefined) {
        const id = file._id || file.id;
        previews[id] = { type: 'text', extension: file.extension, content, file };
      }
    }

    res.json({ previews });
  } catch (err) {
    res.status(500).json({ error: 'Batch preview failed.' });
  }
});

// DELETE /api/files/all - Admin only: remove all files from DB & disk
router.delete('/all', requireAdmin, async (req, res) => {
  try {
    const allFiles = await filesDB.find({}, {}, 50000);
    const ids = allFiles.map(f => f._id || f.id).filter(Boolean);
    for (const f of allFiles) {
      if (f.cloudinaryPublicId) {
        try {
          const ext = (f.extension || '').toLowerCase();
          const resType = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'].includes(ext) ? 'image' : 'raw';
          await deleteFromCloudinary(f.cloudinaryPublicId, resType);
        } catch (cErr) {}
      }
      if (f.storedName) {
        const fullPath = path.join(UPLOAD_DIR, f.storedName);
        if (fs.existsSync(fullPath)) {
          try { fs.unlinkSync(fullPath); } catch (e) {}
        }
      }
    }
    const deletedCount = ids.length > 0 ? await filesDB.deleteManyByIds(ids) : 0;
    res.json({ message: 'All files removed successfully.', deletedCount });
  } catch (err) {
    console.error('Delete all files error:', err.message);
    res.status(500).json({ error: 'Failed to remove all files.' });
  }
});

// GET /api/files/folder/:identifier/download - Disabled (Individual file downloads only)
router.get('/folder/:identifier/download', (req, res) => {
  return res.status(403).json({
    error: 'Group, folder, and bulk downloads are disabled. Please download individual files instead.'
  });
});

// DELETE /api/files/folder/:identifier - Admin only
router.delete('/folder/:identifier', requireAdmin, async (req, res) => {
  try {
    const rawIdentifier = req.params.identifier;
    const identifier = decodeURIComponent(rawIdentifier);

    let files = await filesDB.find({ batchId: identifier });
    if (!files || !files.length) {
      files = await filesDB.find({ folderName: identifier });
    }
    if (!files || !files.length) {
      const safeReg = new RegExp('^' + identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
      files = await filesDB.find({ folderName: safeReg });
    }
    if (!files || !files.length) {
      files = await filesDB.find({ batchId: rawIdentifier });
      if (!files || !files.length) {
        files = await filesDB.find({ folderName: rawIdentifier });
      }
    }
    if (!files || !files.length) return res.status(404).json({ error: 'Folder not found.' });

    let deletedCount = 0;
    for (const f of files) {
      if (f.cloudinaryPublicId) {
        try {
          const ext = (f.extension || '').toLowerCase();
          const resType = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'].includes(ext) ? 'image' : 'raw';
          await deleteFromCloudinary(f.cloudinaryPublicId, resType);
        } catch (cErr) {
          console.error(`Cloudinary folder file destroy warning (${f.originalName}):`, cErr.message);
        }
      }

      const fullPath = path.join(UPLOAD_DIR, f.storedName);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (e) { /* ignore */ }
      }

      await filesDB.findByIdAndDelete(f._id || f.id);
      deletedCount++;
    }

    res.json({ message: 'Folder deleted successfully.', deletedCount });
  } catch (err) {
    console.error('Delete folder error:', err.message);
    res.status(500).json({ error: 'Delete folder failed.' });
  }
});

// POST /api/files/folders/delete-batch - Admin only batch delete
router.post('/folders/delete-batch', requireAdmin, async (req, res) => {
  try {
    const { batchIds } = req.body;
    if (!Array.isArray(batchIds) || !batchIds.length) {
      return res.status(400).json({ error: 'batchIds array required.' });
    }

    let totalDeletedFiles = 0;
    let deletedFolderCount = 0;

    for (const rawIdentifier of batchIds) {
      if (!rawIdentifier) continue;
      const identifier = decodeURIComponent(rawIdentifier);

      let files = await filesDB.find({ batchId: identifier });
      if (!files || !files.length) {
        files = await filesDB.find({ folderName: identifier });
      }
      if (!files || !files.length) {
        const safeReg = new RegExp('^' + identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
        files = await filesDB.find({ folderName: safeReg });
      }
      if (!files || !files.length) {
        files = await filesDB.find({ batchId: rawIdentifier });
      }

      if (files && files.length) {
        for (const f of files) {
          if (f.cloudinaryPublicId) {
            try {
              const ext = (f.extension || '').toLowerCase();
              const resType = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'].includes(ext) ? 'image' : 'raw';
              await deleteFromCloudinary(f.cloudinaryPublicId, resType);
            } catch (cErr) {
              console.error(`Cloudinary folder file destroy warning (${f.originalName}):`, cErr.message);
            }
          }

          const fullPath = path.join(UPLOAD_DIR, f.storedName);
          if (fs.existsSync(fullPath)) {
            try { fs.unlinkSync(fullPath); } catch (e) { /* ignore */ }
          }

          await filesDB.findByIdAndDelete(f._id || f.id);
          totalDeletedFiles++;
        }
        deletedFolderCount++;
      }
    }

    res.json({ message: 'Selected folders deleted successfully.', deletedFolderCount, totalDeletedFiles });
  } catch (err) {
    console.error('Batch delete folders error:', err.message);
    res.status(500).json({ error: 'Failed to delete selected folders.' });
  }
});

// GET /api/files/:id/download - Individual file downloads only
router.get('/:id/download', async (req, res) => {
  try {
    const file = await filesDB.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found.' });

    const isAdmin = verifyAdminToken(req);
    if (!isAdmin && file.status === 'draft') {
      return res.status(403).json({ error: 'This program is currently in draft status.' });
    }

    const ext = (file.extension || '').toLowerCase();
    const isCollectionArchive =
      ext === 'zip' ||
      file.category === 'zip' ||
      file.batchId === 'zip-root-lab-programs' ||
      /zipshare\.zip$/i.test(file.originalName || '');

    if (isCollectionArchive) {
      return res.status(403).json({
        error: 'Collection and bulk archive downloads are disabled. Please download individual program files instead.'
      });
    }

    file.downloads = (file.downloads || 0) + 1;
    await filesDB.findByIdAndUpdate(file._id || file.id, { downloads: file.downloads });

    if (file.cloudinaryUrl) {
      try {
        const buf = await fetchRemoteContent(file.cloudinaryUrl);
        res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
        return res.send(buf);
      } catch (err) {
        console.warn('Remote fetch failed, redirecting directly to Cloudinary:', err.message);
        return res.redirect(file.cloudinaryUrl);
      }
    }

    const fullPath = path.join(UPLOAD_DIR, file.storedName);
    if (fs.existsSync(fullPath)) {
      return res.download(fullPath, file.originalName);
    }

    if (file.content) {
      res.setHeader('Content-Type', file.mimeType || 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
      return res.send(Buffer.from(file.content, 'utf-8'));
    }

    return res.status(404).json({ error: 'File missing on cloud storage or server.' });
  } catch (err) {
    res.status(500).json({ error: 'Download failed.' });
  }
});

// GET /api/files/:id/preview - In-browser code / document preview
router.get('/:id/preview', async (req, res) => {
  try {
    const file = await filesDB.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found.' });
    if (!verifyAdminToken(req) && file.status === 'draft') {
      return res.status(403).json({ error: 'This program is currently in draft status.' });
    }

    if (CODE_EXTENSIONS.includes((file.extension || '').toLowerCase())) {
      let content = file.content;
      if (!content && file.cloudinaryUrl) {
        try {
          const buf = await fetchRemoteContent(file.cloudinaryUrl);
          content = buf.toString('utf-8').slice(0, 200000);
        } catch (cErr) {
          console.error('Fetch preview content error:', cErr.message);
        }
      }

      if (!content) {
        const fullPath = path.join(UPLOAD_DIR, file.storedName);
        if (fs.existsSync(fullPath)) {
          content = fs.readFileSync(fullPath, 'utf-8').slice(0, 200000);
        }
      }

      if (content !== null && content !== undefined) {
        return res.json({ type: 'text', extension: file.extension, content, file });
      }
      return res.status(404).json({ error: 'Could not load file preview from Cloud storage.' });
    }

    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'].includes((file.extension || '').toLowerCase())) {
      const url = file.cloudinaryUrl || `/api/files/${file._id || file.id}/raw`;
      return res.json({ type: file.extension === 'pdf' ? 'pdf' : 'image', url, file });
    }

    return res.json({ type: 'unsupported', file });
  } catch (err) {
    console.error('Preview error:', err.message);
    res.status(500).json({ error: 'Preview failed.' });
  }
});

// GET /api/files/:id/raw
router.get('/:id/raw', async (req, res) => {
  try {
    const file = await filesDB.findById(req.params.id);
    if (!file) return res.status(404).end();
    if (!verifyAdminToken(req) && file.status === 'draft') {
      return res.status(403).json({ error: 'This program is currently in draft status.' });
    }

    if (file.cloudinaryUrl) {
      return res.redirect(file.cloudinaryUrl);
    }

    const fullPath = path.join(UPLOAD_DIR, file.storedName);
    if (fs.existsSync(fullPath)) {
      return res.sendFile(fullPath);
    }

    res.status(404).end();
  } catch (err) {
    res.status(500).end();
  }
});

// PUT /api/files/:id/content - Edit file content directly in browser (Admin only)
router.put('/:id/content', requireAdmin, async (req, res) => {
  try {
    const file = await filesDB.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found.' });

    const { content } = req.body;
    if (content === undefined) return res.status(400).json({ error: 'Content required.' });

    const buf = Buffer.from(content, 'utf-8');
    const newSize = buf.byteLength;

    let updatedCloudUrl = file.cloudinaryUrl;
    let updatedCloudPublicId = file.cloudinaryPublicId;

    if (isCloudinaryConfigured()) {
      try {
        const topFolder = file.folderName || null;
        const uploadRes = await uploadToCloudinary(buf, {
          folder: topFolder ? `zipshare_uploads/${topFolder}` : 'zipshare_uploads',
          public_id: file.cloudinaryPublicId || undefined,
          overwrite: true,
          resource_type: 'raw'
        });
        updatedCloudUrl = uploadRes.secure_url;
        updatedCloudPublicId = uploadRes.public_id;
      } catch (e) {
        console.error('Failed to upload content update to Cloudinary:', e.message);
      }
    }

    const fullPath = path.join(UPLOAD_DIR, file.storedName);
    if (fs.existsSync(fullPath)) {
      try { fs.writeFileSync(fullPath, content, 'utf-8'); } catch (e) {}
    }

    await filesDB.findByIdAndUpdate(file._id || file.id, {
      size: newSize,
      content: content,
      cloudinaryUrl: updatedCloudUrl,
      cloudinaryPublicId: updatedCloudPublicId,
      updatedAt: new Date()
    });

    res.json({ message: 'File content updated successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update file content.' });
  }
});

// DELETE /api/files/:id - Admin only
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const file = await filesDB.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found.' });

    if (file.cloudinaryPublicId) {
      try {
        const ext = (file.extension || '').toLowerCase();
        const resType = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'].includes(ext) ? 'image' : 'raw';
        await deleteFromCloudinary(file.cloudinaryPublicId, resType);
      } catch (cErr) {
        console.error('Cloudinary delete failed:', cErr.message);
        return res.status(500).json({ error: 'Cloudinary deletion failed. Document preserved for transactional safety.' });
      }
    }

    const fullPath = path.join(UPLOAD_DIR, file.storedName);
    if (fs.existsSync(fullPath)) {
      try { fs.unlinkSync(fullPath); } catch (e) {}
    }

    await filesDB.findByIdAndDelete(file._id || file.id);
    res.json({ message: 'Deleted Successfully' });
  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(500).json({ error: 'Delete failed.' });
  }
});

// PATCH /api/files/:id - Admin only edit metadata
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { originalName, description, tags, pinned, category, subject, exercise, question, expectedOutput } = req.body;
    const update = {};
    if (originalName !== undefined && originalName.trim()) update.originalName = originalName.trim();
    if (description !== undefined) update.description = description;
    if (category !== undefined) update.category = category;
    if (subject !== undefined) update.subject = subject;
    if (exercise !== undefined) update.exercise = exercise;
    if (question !== undefined) update.question = question;
    if (expectedOutput !== undefined) update.expectedOutput = expectedOutput;
    if (tags !== undefined) update.tags = Array.isArray(tags) ? tags : String(tags).split(',').map(t => t.trim()).filter(Boolean);
    if (pinned !== undefined) update.pinned = Boolean(pinned);

    const file = await filesDB.findByIdAndUpdate(req.params.id, update);
    if (!file) return res.status(404).json({ error: 'File not found.' });
    res.json(file);
  } catch (err) {
    res.status(500).json({ error: 'Update failed.' });
  }
});

module.exports = router;
