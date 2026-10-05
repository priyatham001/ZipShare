const express = require('express');
const router = express.Router();
const { filesDB } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { SYLLABUS_COURSES, getCourseByKey, getAllOfficialExperiments } = require('../services/syllabusData');
const { matchFileToSyllabus } = require('../services/syllabusMatcher');

// GET /api/syllabus - Course definitions and official experiments
router.get('/', (req, res) => {
  res.json({
    courses: SYLLABUS_COURSES,
    totalOfficialExperiments: 91
  });
});

// GET /api/syllabus/stats - Available vs Coming Soon breakdown per course
router.get('/stats', async (req, res) => {
  try {
    const files = await filesDB.find({}, {}, 10000);

    const stats = {
      totalOfficial: 91,
      totalAvailable: 0,
      totalComingSoon: 0,
      totalNeedsReview: 0,
      courses: {
        java: { total: 35, available: 0, comingSoon: 35, needsReview: 0, title: 'Java Programming', code: 'B23CS2105' },
        python: { total: 40, available: 0, comingSoon: 40, needsReview: 0, title: 'Python Programming', code: 'B23CS2106' },
        adsa: { total: 16, available: 0, comingSoon: 16, needsReview: 0, title: 'DSA / ADSA', code: 'B23CI2102' }
      }
    };

    // Track which experiment numbers are filled per course
    const filledExp = {
      java: new Set(),
      python: new Set(),
      adsa: new Set()
    };

    files.forEach(f => {
      const cat = (f.category || '').toLowerCase();
      const courseKey = cat === 'py' ? 'python' : (cat === 'dsa' ? 'adsa' : cat);

      if (stats.courses[courseKey]) {
        if (f.status === 'available' && f.experimentNumber) {
          filledExp[courseKey].add(f.experimentNumber);
        } else if (f.status === 'needs_review' || f.status === 'unmapped') {
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

    res.json(stats);
  } catch (err) {
    console.error('Syllabus stats error:', err.message);
    res.status(500).json({ error: 'Could not load syllabus stats.' });
  }
});

// GET /api/syllabus/view - Complete syllabus view with Available + Coming Soon status
router.get('/view', async (req, res) => {
  try {
    const { category, q, sort } = req.query;
    const catClean = (category || 'all').toLowerCase().trim();
    const searchQuery = (q || '').toLowerCase().trim();

    // Fetch all files from database
    const files = await filesDB.find({}, {}, 10000);

    // Map files by courseKey + experimentNumber for fast lookup
    const availableMap = new Map();
    const needsReviewFiles = [];
    const otherFiles = [];

    files.forEach(f => {
      const cat = (f.category || '').toLowerCase();
      const courseKey = cat === 'py' ? 'python' : (cat === 'dsa' ? 'adsa' : cat);

      if (f.status === 'available' && f.experimentNumber && ['java', 'python', 'adsa'].includes(courseKey)) {
        const key = `${courseKey}_${f.experimentNumber}`;
        if (!availableMap.has(key)) {
          availableMap.set(key, f);
        }
      } else if (f.status === 'needs_review' || f.status === 'unmapped') {
        needsReviewFiles.push(f);
      } else {
        otherFiles.push(f);
      }
    });

    // Courses to include
    let coursesToRender = [];
    if (catClean === 'all') {
      coursesToRender = ['java', 'python', 'adsa'];
    } else if (catClean === 'java') {
      coursesToRender = ['java'];
    } else if (catClean === 'python' || catClean === 'py') {
      coursesToRender = ['python'];
    } else if (catClean === 'adsa' || catClean === 'dsa') {
      coursesToRender = ['adsa'];
    }

    const items = [];

    for (const cKey of coursesToRender) {
      const course = SYLLABUS_COURSES[cKey];
      if (!course) continue;

      for (const exp of course.experiments) {
        const key = `${cKey}_${exp.number}`;
        const uploadedFile = availableMap.get(key) || null;
        const isAvailable = Boolean(uploadedFile);

        // Search matching: across official experiment name, filename, experiment number, keywords
        if (searchQuery) {
          const numMatch = String(exp.number) === searchQuery || searchQuery === `#${exp.number}`;
          const nameMatch = exp.name.toLowerCase().includes(searchQuery);
          const kwMatch = exp.keywords.some(kw => kw.toLowerCase().includes(searchQuery));
          const fileMatch = uploadedFile && (
            (uploadedFile.originalName && uploadedFile.originalName.toLowerCase().includes(searchQuery)) ||
            (uploadedFile.relativePath && uploadedFile.relativePath.toLowerCase().includes(searchQuery)) ||
            (uploadedFile.description && uploadedFile.description.toLowerCase().includes(searchQuery))
          );
          const courseMatch = course.title.toLowerCase().includes(searchQuery) || cKey.includes(searchQuery);

          if (!numMatch && !nameMatch && !kwMatch && !fileMatch && !courseMatch) {
            continue; // Doesn't match search
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
          file: uploadedFile,
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
      // Default: S.No ascending within each course!
      const courseOrder = { java: 1, python: 2, adsa: 3 };
      items.sort((a, b) => {
        if (a.category !== b.category) {
          return (courseOrder[a.category] || 9) - (courseOrder[b.category] || 9);
        }
        return a.experimentNumber - b.experimentNumber;
      });
    }

    res.json({
      items,
      needsReviewCount: needsReviewFiles.length,
      needsReviewFiles: catClean === 'all' || catClean === 'needs_review' ? needsReviewFiles : [],
      otherFiles: catClean === 'all' ? otherFiles : []
    });
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
      return res.status(400).json({ error: `Invalid category: ${category}. Expected java, python, or adsa.` });
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
