const { SYLLABUS_COURSES, getCourseByKey } = require('./syllabusData');

function cleanString(str) {
  if (!str) return '';
  return String(str)
    .replace(/\.[^/.]+$/, '') // remove extension
    .replace(/([a-z])([A-Z])/g, '$1 $2') // CamelCase to words
    .replace(/[_\-.]+/g, ' ') // separators to spaces
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .trim();
}

function extractNumber(filename) {
  if (!filename) return null;
  const base = filename.replace(/\.[^/.]+$/, '');
  // Matches: exp10, exp_10, lab10, lab_07, p1, program1, 10_hashmap, 10-binary
  const patterns = [
    /(?:exp|lab|experiment|prog|program|ex|p)[_\-\s]*0*(\d+)\b/i,
    /^0*(\d+)[_\-\s]/,
    /[_\-\s]0*(\d+)$/,
    /^0*(\d+)$/
  ];

  for (const pat of patterns) {
    const m = base.match(pat);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (n > 0 && n <= 100) return n;
    }
  }
  return null;
}

function detectCourseKey(ext, filename = '', relPath = '', categoryHint = null) {
  const e = (ext || '').toLowerCase().replace('.', '');
  const pathLower = (relPath + ' ' + filename + ' ' + (categoryHint || '')).toLowerCase();

  if (categoryHint && ['java', 'python', 'py', 'adsa', 'dsa'].includes(categoryHint.toLowerCase())) {
    const k = categoryHint.toLowerCase();
    if (k === 'py') return 'python';
    if (k === 'dsa') return 'adsa';
    return k;
  }

  if (pathLower.includes('adsa') || pathLower.includes('dsa') || pathLower.includes('tree') || pathLower.includes('graph') || pathLower.includes('avl') || pathLower.includes('heap')) {
    return 'adsa';
  }
  if (pathLower.includes('java') || e === 'java') {
    return 'java';
  }
  if (pathLower.includes('python') || e === 'py') {
    return 'python';
  }
  if (e === 'c' || e === 'cpp') {
    return 'adsa';
  }
  return null;
}

function matchFileToSyllabus(fileObj) {
  const filename = fileObj.originalName || fileObj.name || '';
  const ext = (fileObj.extension || '').toLowerCase().replace('.', '') || (filename.split('.').pop() || '').toLowerCase();
  const content = fileObj.content || '';
  const relPath = fileObj.relativePath || '';
  const categoryHint = fileObj.category || null;

  const courseKey = detectCourseKey(ext, filename, relPath, categoryHint);
  const course = getCourseByKey(courseKey);

  if (!course) {
    return {
      courseKey: null,
      course: null,
      courseCode: null,
      category: categoryHint || ext || 'other',
      experimentNumber: null,
      experimentName: null,
      matchConfidence: 'low',
      status: 'unmapped'
    };
  }

  const cleanedFilename = cleanString(filename);
  const fileWords = new Set(cleanedFilename.split(/\s+/).filter(w => w.length > 1));
  const explicitNumber = extractNumber(filename);

  // Special ambiguous cases check:
  // "Operators_demonstrate.py" demonstrates multiple Python operators and cannot be uniquely mapped without explicit choice.
  if (cleanedFilename.includes('operators demonstrate') || cleanedFilename.includes('demonstrate operators') || cleanedFilename === 'operators') {
    return {
      courseKey: course.key,
      course: course.course,
      courseCode: course.courseCode,
      category: course.category,
      experimentNumber: null,
      experimentName: null,
      matchConfidence: 'medium',
      status: 'needs_review',
      reviewReason: 'File contains multiple operator demonstrations. Please select specific operator experiment.'
    };
  }

  // If explicit number matches within bounds
  if (explicitNumber && explicitNumber <= course.totalExperiments) {
    const exp = course.experiments.find(e => e.number === explicitNumber);
    if (exp) {
      // Check if filename contradicts
      const expClean = cleanString(exp.name);
      return {
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

  // Score all experiments in course
  const candidates = [];

  for (const exp of course.experiments) {
    let score = 0;
    const expClean = cleanString(exp.name);
    const expWords = expClean.split(/\s+/).filter(w => w.length > 2);

    // Exact or direct substring match
    if (cleanedFilename.includes(expClean) || expClean.includes(cleanedFilename)) {
      score += 50;
    }

    // Keyword matches
    for (const kw of exp.keywords) {
      const cleanKw = cleanString(kw);
      if (cleanedFilename.includes(cleanKw)) {
        score += 25;
      }
      if (cleanKw.split(/\s+/).every(w => fileWords.has(w))) {
        score += 20;
      }
    }

    // Word intersection
    let wordMatches = 0;
    for (const w of expWords) {
      if (fileWords.has(w)) wordMatches++;
    }
    if (expWords.length > 0) {
      score += (wordMatches / expWords.length) * 30;
    }

    // Content signals if available
    if (content && typeof content === 'string') {
      const contentLower = content.toLowerCase();
      for (const kw of exp.keywords) {
        if (contentLower.includes(kw.toLowerCase())) {
          score += 15;
        }
      }
    }

    if (score > 10) {
      candidates.push({ exp, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return {
      courseKey: course.key,
      course: course.course,
      courseCode: course.courseCode,
      category: course.category,
      experimentNumber: null,
      experimentName: null,
      matchConfidence: 'low',
      status: 'unmapped'
    };
  }

  const top = candidates[0];
  const second = candidates[1];

  // High confidence: top score is high and significantly beats second candidate
  if (top.score >= 35 && (!second || (top.score - second.score >= 15))) {
    return {
      courseKey: course.key,
      course: course.course,
      courseCode: course.courseCode,
      category: course.category,
      experimentNumber: top.exp.number,
      experimentName: top.exp.name,
      matchConfidence: 'high',
      status: 'available'
    };
  }

  // Medium confidence: reasonable match but second candidate is close
  return {
    courseKey: course.key,
    course: course.course,
    courseCode: course.courseCode,
    category: course.category,
    experimentNumber: top.exp.number,
    experimentName: top.exp.name,
    matchConfidence: 'medium',
    status: 'needs_review',
    reviewReason: `Ambiguous match between "${top.exp.name}" and "${second ? second.exp.name : 'other'}"`
  };
}

module.exports = {
  cleanString,
  extractNumber,
  detectCourseKey,
  matchFileToSyllabus
};
