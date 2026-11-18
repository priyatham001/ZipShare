const express = require('express');
const router = express.Router();
const { filesDB, getDataVersion } = require('../db');
const { requireAdmin, verifyAdminToken } = require('../middleware/auth');
const { SYLLABUS_COURSES, getCourseByKey, getAllOfficialExperiments } = require('../services/syllabusData');
const { matchFileToSyllabus, isCourseLanguageCompatible } = require('../services/syllabusMatcher');

let indexCache = { version: -1, entries: new Map() };
const viewCache = { version: -1, entries: new Map() };
const assignmentLocks = new Map();

async function withAssignmentLock(lockKey, taskFn) {
  const prev = assignmentLocks.get(lockKey) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  assignmentLocks.set(lockKey, prev.then(() => current, () => current));
  await prev;
  try {
    return await taskFn();
  } finally {
    release();
    if (assignmentLocks.get(lockKey) === current) {
      assignmentLocks.delete(lockKey);
    }
  }
}

function toSummaryFile(f) {
  if (!f || typeof f !== 'object') return f;
  const plain = typeof f.toObject === 'function' ? f.toObject() : f;
  const { content, ...rest } = plain;
  if (rest._id != null) {
    rest._id = String(rest._id);
  } else if (rest.id != null) {
    rest._id = String(rest.id);
  }
  return rest;
}

function resolveCourseKey(f) {
  const cat = String(f?.category || '').toLowerCase().trim();
  if (cat === 'java') return 'java';
  if (cat === 'python' || cat === 'py') return 'python';
  if (cat === 'dbms' || cat === 'sql') return 'dbms';
  if (cat === 'adsa' || cat === 'dsa') return 'adsa';
  if (cat === 'c' || cat === 'c language' || cat === 'clanguage') return 'c';
  if (cat === 'cpp' || cat === 'c++') return 'cpp';

  const ext = String(f?.extension || '').toLowerCase().replace('.', '').trim();
  if (ext === 'java') return 'java';
  if (ext === 'py') return 'python';
  if (ext === 'sql') return 'dbms';
  return cat;
}

function isFileVisibleToUser(f, isAdmin, userEmail) {
  if (isAdmin) return true;
  if (f.status === 'draft') return false;
  if (f.assignmentType === 'individual') {
    if (!userEmail) return false;
    const assigned = Array.isArray(f.assignedUsers) ? f.assignedUsers : [];
    return assigned.some(u => String(u).toLowerCase().trim() === userEmail);
  }
  return true;
}

async function getIndexedSyllabusState(isAdmin = false, userEmail = '') {
  const version = getDataVersion();
  const cleanEmail = String(userEmail || '').toLowerCase().trim();
  const cacheKey = `${isAdmin ? 1 : 0}|${cleanEmail}`;

  if (indexCache.version !== version) {
    indexCache = { version, entries: new Map() };
  }
  if (indexCache.entries.has(cacheKey)) {
    return indexCache.entries.get(cacheKey);
  }

  const files = await filesDB.find({}, {}, 10000);
  const availableMap = new Map();
  const additionalFiles = [];
  const needsReviewFiles = [];
  const otherFiles = [];

  for (const f of files) {
    if (!isFileVisibleToUser(f, isAdmin, cleanEmail)) {
      continue;
    }

    const courseKey = resolveCourseKey(f);

    if (['java', 'python', 'dbms', 'adsa'].includes(courseKey)) {
      const compatible = isCourseLanguageCompatible(courseKey, f.extension, f.content);
      const isPublishedOrAvailable = f.status === 'available' || f.status === 'published' || !f.status;

      if (compatible && isPublishedOrAvailable && f.experimentNumber) {
        const key = `${courseKey}_${f.experimentNumber}`;
        if (!availableMap.has(key)) {
          availableMap.set(key, [f]);
        } else {
          const list = availableMap.get(key);
          const fId = String(f._id || f.id || '');
          if (!list.some(item => (fId && String(item._id || item.id || '') === fId) || (item.relativePath && item.relativePath === f.relativePath))) {
            list.push(f);
          }
        }
      } else if (compatible && isPublishedOrAvailable && !f.experimentNumber) {
        // Admin-created published programs or standalone lab programs without an official experiment slot
        additionalFiles.push(f);
      } else {
        needsReviewFiles.push(f);
      }
    } else if (f.status === 'needs_review' || f.status === 'unmapped') {
      needsReviewFiles.push(f);
    } else {
      otherFiles.push(f);
    }
  }

  const entry = { availableMap, additionalFiles, needsReviewFiles, otherFiles };
  if (indexCache.entries.size >= 40) indexCache.entries.clear();
  indexCache.entries.set(cacheKey, entry);
  return entry;
}

// GET /api/syllabus - Course definitions and official experiments
router.get('/', (req, res) => {
  res.json({
    courses: SYLLABUS_COURSES,
    totalOfficialExperiments: 145
  });
});

let statsCache = { version: -1, entries: new Map() };
// GET /api/syllabus/stats - Available vs Coming Soon breakdown per course
router.get('/stats', async (req, res) => {
  try {
    const isAdmin = verifyAdminToken(req);
    const userEmail = String(req.query.userEmail || req.headers['x-user-email'] || '').toLowerCase().trim();
    const version = getDataVersion();
    const statsKey = `${isAdmin ? 1 : 0}|${userEmail}`;
    if (statsCache.version !== version) {
      statsCache = { version, entries: new Map() };
    }
    if (statsCache.entries.has(statsKey)) {
      return res.json(statsCache.entries.get(statsKey));
    }

    const files = await filesDB.find({}, {}, 10000);

    const stats = {
      totalOfficial: 145,
      totalAvailable: 0,
      totalComingSoon: 0,
      totalNeedsReview: 0,
      totalUploadedPrograms: 0,
      courses: {
        java: { total: 35, available: 0, additional: 0, uploadedCount: 0, comingSoon: 35, needsReview: 0, title: 'Java Programming', code: 'B23CS2105' },
        python: { total: 40, available: 0, additional: 0, uploadedCount: 0, comingSoon: 40, needsReview: 0, title: 'Python Programming', code: 'B23CS2106' },
        dbms: { total: 54, available: 0, additional: 0, uploadedCount: 0, comingSoon: 54, needsReview: 0, title: 'Database Management Systems', code: 'B23CS2104' },
        adsa: { total: 16, available: 0, additional: 0, uploadedCount: 0, comingSoon: 16, needsReview: 0, title: 'DSA / ADSA', code: 'B23CI2102' }
      }
    };

    const filledExp = {
      java: new Set(),
      python: new Set(),
      dbms: new Set(),
      adsa: new Set()
    };

    files.forEach(f => {
      if (!isFileVisibleToUser(f, isAdmin, userEmail)) {
        return;
      }
      stats.totalUploadedPrograms++;
      const courseKey = resolveCourseKey(f);

      if (stats.courses[courseKey]) {
        stats.courses[courseKey].uploadedCount++;
        const compatible = isCourseLanguageCompatible(courseKey, f.extension, f.content);
        const isPublishedOrAvailable = f.status === 'available' || f.status === 'published' || !f.status;
        if (compatible && isPublishedOrAvailable && f.experimentNumber) {
          filledExp[courseKey].add(f.experimentNumber);
        } else if (compatible && isPublishedOrAvailable && !f.experimentNumber) {
          stats.courses[courseKey].additional++;
        } else {
          stats.courses[courseKey].needsReview++;
          stats.totalNeedsReview++;
        }
      } else if (f.status === 'needs_review' || f.status === 'unmapped') {
        stats.totalNeedsReview++;
      }
    });

    for (const [key, courseStats] of Object.entries(stats.courses)) {
      courseStats.available = filledExp[key].size;
      courseStats.comingSoon = courseStats.total - courseStats.available;
      stats.totalAvailable += courseStats.available;
      stats.totalComingSoon += courseStats.comingSoon;
    }

    if (statsCache.entries.size >= 40) statsCache.entries.clear();
    statsCache.entries.set(statsKey, stats);

    res.json(stats);
  } catch (err) {
    console.error('Syllabus stats error:', err.message);
    res.status(500).json({ error: 'Could not load syllabus stats.' });
  }
});

function matchesSearchFile(f, q) {
  if (!q) return true;
  return (
    (f.originalName && f.originalName.toLowerCase().includes(q)) ||
    (f.relativePath && f.relativePath.toLowerCase().includes(q)) ||
    (f.folderName && f.folderName.toLowerCase().includes(q)) ||
    (f.zipFolder && f.zipFolder.toLowerCase().includes(q)) ||
    (f.zipSource && f.zipSource.toLowerCase().includes(q)) ||
    (f.description && f.description.toLowerCase().includes(q)) ||
    (f.category && f.category.toLowerCase().includes(q)) ||
    (f.extension && f.extension.toLowerCase().includes(q))
  );
}

// GET /api/syllabus/view - Complete syllabus view with Available + Coming Soon status
router.get('/view', async (req, res) => {
  try {
    const { category, q, sort } = req.query;
    const isAdmin = verifyAdminToken(req);
    const userEmail = String(req.query.userEmail || req.headers['x-user-email'] || '').toLowerCase().trim();
    const catClean = (category || 'all').toLowerCase().trim();
    const searchQuery = (q || '').toLowerCase().trim();
    const sortClean = (sort || 'default').toLowerCase().trim();

    const version = getDataVersion();
    if (viewCache.version !== version) {
      viewCache.version = version;
      viewCache.entries.clear();
    }

    const cacheKey = `${isAdmin ? 1 : 0}|${userEmail}|${catClean}|${searchQuery}|${sortClean}`;
    if (viewCache.entries.has(cacheKey)) {
      return res.json(viewCache.entries.get(cacheKey));
    }

    const { availableMap, additionalFiles, needsReviewFiles, otherFiles } = await getIndexedSyllabusState(isAdmin, userEmail);

    // Courses to include
    let coursesToRender = [];
    if (catClean === 'all') {
      coursesToRender = ['java', 'python', 'dbms', 'adsa'];
    } else if (catClean === 'java') {
      coursesToRender = ['java'];
    } else if (catClean === 'python' || catClean === 'py') {
      coursesToRender = ['python'];
    } else if (catClean === 'dbms' || catClean === 'sql') {
      coursesToRender = ['dbms'];
    } else if (catClean === 'adsa' || catClean === 'dsa') {
      coursesToRender = ['adsa'];
    }

    const items = [];

    for (const cKey of coursesToRender) {
      const course = SYLLABUS_COURSES[cKey];
      if (!course) continue;

      for (const exp of course.experiments) {
        const key = `${cKey}_${exp.number}`;
        const uploadedFiles = availableMap.get(key) || [];
        const uploadedFile = uploadedFiles[0] || null;
        const isAvailable = uploadedFiles.length > 0;

        if (searchQuery) {
          const numMatch = String(exp.number) === searchQuery || searchQuery === `#${exp.number}`;
          const nameMatch = exp.name.toLowerCase().includes(searchQuery);
          const kwMatch = exp.keywords.some(kw => kw.toLowerCase().includes(searchQuery));
          const fileMatch = uploadedFiles.some(f => matchesSearchFile(f, searchQuery));
          const courseMatch = course.title.toLowerCase().includes(searchQuery) || cKey.includes(searchQuery);

          if (!numMatch && !nameMatch && !kwMatch && !fileMatch && !courseMatch) {
            continue;
          }
        }

        items.push({
          type: 'experiment',
          category: cKey,
          course: course.course,
          courseCode: course.courseCode,
          courseTitle: course.title,
          courseIcon: course.icon,
          experimentNumber: exp.number,
          experimentName: exp.name,
          status: isAvailable ? 'available' : 'coming_soon',
          file: toSummaryFile(uploadedFile),
          files: uploadedFiles.map(toSummaryFile),
          keywords: exp.keywords
        });
      }
    }

    // Apply sorting
    if (sortClean === 'recent') {
      items.sort((a, b) => {
        const da = a.file?.uploadDate ? new Date(a.file.uploadDate).getTime() : 0;
        const db = b.file?.uploadDate ? new Date(b.file.uploadDate).getTime() : 0;
        if (db !== da) return db - da;
        return a.experimentNumber - b.experimentNumber;
      });
    } else if (sortClean === 'popular') {
      items.sort((a, b) => {
        const diff = (b.file?.downloads || 0) - (a.file?.downloads || 0);
        return diff !== 0 ? diff : a.experimentNumber - b.experimentNumber;
      });
    } else if (sortClean === 'name') {
      items.sort((a, b) => a.experimentName.localeCompare(b.experimentName));
    } else {
      const courseOrder = { java: 1, python: 2, dbms: 3, adsa: 4 };
      items.sort((a, b) => {
        if (a.category !== b.category) {
          return (courseOrder[a.category] || 9) - (courseOrder[b.category] || 9);
        }
        return a.experimentNumber - b.experimentNumber;
      });
    }

    const activeCourseKey = coursesToRender.length === 1 ? coursesToRender[0] : null;

    const filterByCategoryAndSearch = (list) => {
      return list
        .filter(f => {
          if (catClean === 'all' || catClean === 'needs_review') return matchesSearchFile(f, searchQuery);
          if (activeCourseKey) return resolveCourseKey(f) === activeCourseKey && matchesSearchFile(f, searchQuery);
          return false;
        })
        .map(toSummaryFile);
    };

    const sortFileList = (list) => {
      if (sortClean === 'recent') {
        return [...list].sort((a, b) => new Date(b.uploadDate || 0) - new Date(a.uploadDate || 0));
      }
      if (sortClean === 'popular') {
        return [...list].sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
      }
      if (sortClean === 'name') {
        return [...list].sort((a, b) => String(a.originalName || '').localeCompare(String(b.originalName || '')));
      }
      return list;
    };

    const filteredAdditional = (catClean === 'needs_review')
      ? []
      : sortFileList(filterByCategoryAndSearch(additionalFiles));

    const filteredReview = (catClean === 'all' || catClean === 'needs_review' || Boolean(activeCourseKey))
      ? sortFileList(filterByCategoryAndSearch(needsReviewFiles))
      : [];

    const filteredOther = (catClean === 'all')
      ? sortFileList(otherFiles.filter(f => matchesSearchFile(f, searchQuery)).map(toSummaryFile))
      : [];

    const syllabusUploadedCount = items.reduce((acc, it) => acc + (Array.isArray(it.files) ? it.files.length : (it.file ? 1 : 0)), 0);
    const availableProgramCount = syllabusUploadedCount + filteredAdditional.length + filteredReview.length + filteredOther.length;

    const payload = {
      items,
      additionalFiles: filteredAdditional,
      needsReviewCount: filteredReview.length,
      needsReviewFiles: filteredReview,
      otherFiles: filteredOther,
      availableProgramCount
    };

    if (viewCache.entries.size >= 80) {
      viewCache.entries.clear();
    }
    viewCache.entries.set(cacheKey, payload);

    res.json(payload);
  } catch (err) {
    console.error('Syllabus view error:', err.message);
    res.status(500).json({ error: 'Could not load syllabus view.' });
  }
});

// POST /api/syllabus/assign - Admin manually maps a file to an official experiment
router.post('/assign', requireAdmin, async (req, res) => {
  try {
    const { fileId, category, experimentNumber, overrideDuplicate = false, keepBoth = false } = req.body;

    if (!fileId || !category || experimentNumber === undefined || experimentNumber === null || experimentNumber === '') {
      return res.status(400).json({ error: 'fileId, category, and experimentNumber are required.' });
    }

    const course = getCourseByKey(category);
    if (!course) {
      return res.status(400).json({ error: `Invalid category: ${category}. Expected java, python, dbms, or adsa.` });
    }

    const expNum = Number(experimentNumber);
    if (!Number.isInteger(expNum) || expNum < 1) {
      return res.status(400).json({ error: 'experimentNumber must be a positive integer.' });
    }

    const exp = course.experiments.find(e => e.number === expNum);
    if (!exp) {
      return res.status(400).json({ error: `Experiment #${expNum} not found in ${course.title} (1..${course.totalExperiments}).` });
    }

    const lockKey = `${course.category}:${expNum}`;
    const result = await withAssignmentLock(lockKey, async () => {
      const file = await filesDB.findById(fileId);
      if (!file) {
        return { status: 404, body: { error: 'File not found.' } };
      }

      const existing = await filesDB.find({
        category: course.category,
        experimentNumber: expNum,
        status: { $in: ['available', 'published'] }
      });

      const otherExisting = existing.filter(f => String(f._id || f.id) !== String(fileId));
      if (otherExisting.length > 0 && !overrideDuplicate && !keepBoth) {
        return {
          status: 409,
          body: {
            conflict: true,
            message: `Experiment #${expNum} (${exp.name}) is already assigned to file "${otherExisting[0].originalName}". Confirm replacement to reassign this slot cleanly.`,
            existingFile: toSummaryFile(otherExisting[0])
          }
        };
      }

      const now = new Date();
      if (overrideDuplicate && !keepBoth && otherExisting.length > 0) {
        for (const prev of otherExisting) {
          const prevId = prev._id || prev.id;
          const prevHistory = Array.isArray(prev.assignmentHistory) ? [...prev.assignmentHistory] : [];
          prevHistory.push({
            action: 'unassigned_by_override',
            previousCategory: prev.category,
            previousExperimentNumber: prev.experimentNumber,
            replacedByFileId: fileId,
            replacedByName: file.originalName,
            assignedBy: 'admin',
            timestamp: now.toISOString()
          });
          await filesDB.findByIdAndUpdate(prevId, {
            experimentNumber: null,
            experimentName: null,
            status: 'needs_review',
            reviewReason: `Replaced on Experiment #${exp.number} by "${file.originalName}"`,
            assignmentHistory: prevHistory.slice(-20),
            updatedAt: now
          });
        }
      }

      const history = Array.isArray(file.assignmentHistory) ? [...file.assignmentHistory] : [];
      history.push({
        action: overrideDuplicate ? 'reassigned' : 'assigned',
        category: course.category,
        experimentNumber: exp.number,
        experimentName: exp.name,
        assignedBy: 'admin',
        timestamp: now.toISOString()
      });

      const updated = await filesDB.findByIdAndUpdate(fileId, {
        category: course.category,
        course: course.course,
        courseCode: course.courseCode,
        experimentNumber: exp.number,
        experimentName: exp.name,
        matchConfidence: 'high',
        status: 'available',
        reviewReason: null,
        assignedBy: 'admin',
        assignedAt: now.toISOString(),
        assignmentHistory: history.slice(-20),
        updatedAt: now
      });

      return {
        status: 200,
        body: {
          message: `File "${file.originalName}" successfully assigned to #${exp.number}: ${exp.name}`,
          file: toSummaryFile(updated)
        }
      };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('Assign experiment error:', err.message);
    res.status(500).json({ error: 'Failed to assign experiment.' });
  }
});

// POST /api/syllabus/scan - Pre-upload detection scan
router.post('/scan', async (req, res) => {
  try {
    const { files } = req.body;
    if (!Array.isArray(files)) {
      return res.status(400).json({ error: 'files array required' });
    }

    const scanned = files.map(f => {
      const match = matchFileToSyllabus(f);
      return {
        filename: f.originalName || f.name,
        detectedCategory: match.category,
        detectedCourse: match.course,
        experimentNumber: match.experimentNumber,
        experimentName: match.experimentName,
        matchConfidence: match.matchConfidence,
        status: match.status,
        reviewReason: match.reviewReason
      };
    });

    res.json({ results: scanned });
  } catch (err) {
    res.status(500).json({ error: 'Scan failed.' });
  }
});

module.exports = router;
