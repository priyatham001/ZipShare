const express = require('express');
const router = express.Router();
const { filesDB, getDataVersion } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { SYLLABUS_COURSES, getCourseByKey, getAllOfficialExperiments } = require('../services/syllabusData');
const { matchFileToSyllabus, isCourseLanguageCompatible } = require('../services/syllabusMatcher');

let statsCache = { version: -1, data: null };
let indexCache = { version: -1, availableMap: null, needsReviewFiles: null, otherFiles: null };
const viewCache = { version: -1, entries: new Map() };

function toSummaryFile(f) {
  if (!f || typeof f !== 'object') return f;
  const { content, ...rest } = f;
  return rest;
}

async function getIndexedSyllabusState() {
  const version = getDataVersion();
  if (indexCache.version === version && indexCache.availableMap) {
    return indexCache;
  }

  const files = await filesDB.find({}, {}, 10000);
  const availableMap = new Map();
  const needsReviewFiles = [];
  const otherFiles = [];

  for (const f of files) {
    const cat = (f.category || '').toLowerCase();
    const courseKey = cat === 'py' ? 'python' : (cat === 'dsa' ? 'adsa' : (cat === 'sql' ? 'dbms' : cat));

    if (['java', 'python', 'dbms', 'adsa'].includes(courseKey)) {
      const compatible = isCourseLanguageCompatible(courseKey, f.extension, f.content);
      if (compatible && f.status === 'available' && f.experimentNumber) {
        const key = `${courseKey}_${f.experimentNumber}`;
        if (!availableMap.has(key)) {
          availableMap.set(key, [f]);
        } else {
          const list = availableMap.get(key);
          if (!list.some(item => (item._id && item._id === f._id) || (item.relativePath && item.relativePath === f.relativePath))) {
            list.push(f);
          }
        }
      } else {
        needsReviewFiles.push(f);
      }
    } else if (f.status === 'needs_review' || f.status === 'unmapped') {
      needsReviewFiles.push(f);
    } else {
      otherFiles.push(f);
    }
  }

  indexCache = { version, availableMap, needsReviewFiles, otherFiles };
  return indexCache;
}

// GET /api/syllabus - Course definitions and official experiments
router.get('/', (req, res) => {
  res.json({
    courses: SYLLABUS_COURSES,
    totalOfficialExperiments: 145
  });
});

// GET /api/syllabus/stats - Available vs Coming Soon breakdown per course
router.get('/stats', async (req, res) => {
  try {
    const version = getDataVersion();
    if (statsCache.version === version && statsCache.data) {
      return res.json(statsCache.data);
    }

    const files = await filesDB.find({}, {}, 10000);

    const stats = {
      totalOfficial: 145,
      totalAvailable: 0,
      totalComingSoon: 0,
      totalNeedsReview: 0,
      courses: {
        java: { total: 35, available: 0, comingSoon: 35, needsReview: 0, title: 'Java Programming', code: 'B23CS2105' },
        python: { total: 40, available: 0, comingSoon: 40, needsReview: 0, title: 'Python Programming', code: 'B23CS2106' },
        dbms: { total: 54, available: 0, comingSoon: 54, needsReview: 0, title: 'Database Management Systems', code: 'B23CS2104' },
        adsa: { total: 16, available: 0, comingSoon: 16, needsReview: 0, title: 'DSA / ADSA', code: 'B23CI2102' }
      }
    };

    const filledExp = {
      java: new Set(),
      python: new Set(),
      dbms: new Set(),
      adsa: new Set()
    };

    files.forEach(f => {
      const cat = (f.category || '').toLowerCase();
      const courseKey = cat === 'py' ? 'python' : (cat === 'dsa' ? 'adsa' : (cat === 'sql' ? 'dbms' : cat));

      if (stats.courses[courseKey]) {
        const compatible = isCourseLanguageCompatible(courseKey, f.extension, f.content);
        if (compatible && f.status === 'available' && f.experimentNumber) {
          filledExp[courseKey].add(f.experimentNumber);
        } else if (!compatible || f.status === 'needs_review' || f.status === 'unmapped') {
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

    statsCache = { version, data: stats };
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
    const catClean = (category || 'all').toLowerCase().trim();
    const searchQuery = (q || '').toLowerCase().trim();
    const sortClean = (sort || 'default').toLowerCase().trim();

    const version = getDataVersion();
    if (viewCache.version !== version) {
      viewCache.version = version;
      viewCache.entries.clear();
    }

    const cacheKey = `${catClean}|${searchQuery}|${sortClean}`;
    if (viewCache.entries.has(cacheKey)) {
      return res.json(viewCache.entries.get(cacheKey));
    }

    const { availableMap, needsReviewFiles, otherFiles } = await getIndexedSyllabusState();

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
    if (sort === 'recent') {
      items.sort((a, b) => {
        const da = a.file?.uploadDate ? new Date(a.file.uploadDate) : new Date(0);
        const db = b.file?.uploadDate ? new Date(b.file.uploadDate) : new Date(0);
        return db - da;
      });
    } else if (sort === 'popular') {
      items.sort((a, b) => (b.file?.downloads || 0) - (a.file?.downloads || 0));
    } else if (sort === 'name') {
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

    const filteredReview = (catClean === 'all' || catClean === 'needs_review')
      ? needsReviewFiles.filter(f => matchesSearchFile(f, searchQuery)).map(toSummaryFile)
      : [];
    const filteredOther = (catClean === 'all')
      ? otherFiles.filter(f => matchesSearchFile(f, searchQuery)).map(toSummaryFile)
      : [];

    const payload = {
      items,
      needsReviewCount: filteredReview.length,
      needsReviewFiles: filteredReview,
      otherFiles: filteredOther
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
    const { fileId, category, experimentNumber } = req.body;

    if (!fileId || !category || !experimentNumber) {
      return res.status(400).json({ error: 'fileId, category, and experimentNumber are required.' });
    }

    const course = getCourseByKey(category);
    if (!course) {
      return res.status(400).json({ error: `Invalid category: ${category}. Expected java, python, dbms, or adsa.` });
    }

    const expNum = parseInt(experimentNumber, 10);
    const exp = course.experiments.find(e => e.number === expNum);
    if (!exp) {
      return res.status(400).json({ error: `Experiment #${expNum} not found in ${course.title} (1..${course.totalExperiments}).` });
    }

    const file = await filesDB.findById(fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found.' });
    }

    // Duplicate protection: check if another file is already mapped to this experiment
    const existing = await filesDB.find({
      category: course.category,
      experimentNumber: expNum,
      status: 'available'
    });

    const otherExisting = existing.find(f => (f._id || f.id) !== fileId);
    if (otherExisting && !req.body.overrideDuplicate) {
      return res.status(409).json({
        conflict: true,
        message: `Experiment #${expNum} (${exp.name}) is already assigned to file "${otherExisting.originalName}". Confirm to replace or keep both?`,
        existingFile: otherExisting
      });
    }

    const updated = await filesDB.findByIdAndUpdate(fileId, {
      category: course.category,
      course: course.course,
      courseCode: course.courseCode,
      experimentNumber: exp.number,
      experimentName: exp.name,
      matchConfidence: 'high',
      status: 'available',
      reviewReason: null,
      updatedAt: new Date()
    });

    res.json({
      message: `File "${file.originalName}" successfully assigned to #${exp.number}: ${exp.name}`,
      file: updated
    });
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
