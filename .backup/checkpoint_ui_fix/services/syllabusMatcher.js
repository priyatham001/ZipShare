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

function extractNumber(filename, relPath = '') {
  const candidates = [];
  if (filename) candidates.push(filename);
  if (relPath) {
    const parts = String(relPath).replace(/\\/g, '/').split('/').filter(Boolean);
    // Walk parent directory segments from innermost to outermost
    for (let i = parts.length - 2; i >= 0; i--) {
      const seg = parts[i];
      if (!/^(zipshare|java programs|python code|sql lab programs|ds code|mypack|src)$/i.test(seg)) {
        candidates.push(seg);
      }
    }
  }

  const patterns = [
    /(?:exp|lab|experiment|prog|program|ex|p)[_\-\s]*0*(\d+)\b/i,
    /^0*(\d+)[_\-\s]/,
    /[_\-\s]0*(\d+)$/,
    /^0*(\d+)$/
  ];

  for (const target of candidates) {
    const base = String(target).replace(/\.[^/.]+$/, '');
    for (const pat of patterns) {
      const m = base.match(pat);
      if (m && m[1]) {
        const n = parseInt(m[1], 10);
        if (n > 0 && n <= 100) return n;
      }
    }
  }
  return null;
}

function detectContentLanguage(content) {
  if (!content || typeof content !== 'string') return null;
  const c = content.trim();
  if (!c) return null;

  const isJava = /\bpublic\s+class\b|\bSystem\.out\.print|\bimport\s+java\.|\bpublic\s+static\s+void\s+main\b/.test(c);
  const isPython = /(?:^|\n)\s*def\s+\w+\s*\([^)]*\)\s*:|(?:^|\n)\s*elif\s+|(?:^|\n)\s*if\s+__name__\s*==|print\s*\([^)]*f["']/.test(c);
  const isC = /#include\s*<\s*(?:stdio|stdlib|string|math|limits|stdbool|iostream)[^>]*>|\bint\s+main\s*\(|\bprintf\s*\(|\bscanf\s*\(/.test(c);
  const isSQL = /\b(?:CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|SELECT\s+.+\s+FROM|INSERT\s+INTO|CREATE\s+OR\s+REPLACE\s+(?:PROCEDURE|FUNCTION|TRIGGER)|DBMS_OUTPUT\.PUT_LINE)\b/i.test(c);

  const hits = [];
  if (isJava) hits.push('java');
  if (isPython) hits.push('python');
  if (isC) hits.push('c');
  if (isSQL) hits.push('dbms');

  if (hits.length === 1) return hits[0];
  return null;
}

function isCourseLanguageCompatible(courseKey, ext, content) {
  const e = (ext || '').toLowerCase().replace('.', '');
  if (courseKey === 'java' && ['py', 'c', 'cpp', 'cc', 'cxx', 'sql'].includes(e)) return false;
  if (courseKey === 'python' && ['java', 'c', 'cpp', 'cc', 'cxx', 'sql'].includes(e)) return false;
  if (courseKey === 'dbms' && ['java', 'py', 'c', 'cpp', 'cc', 'cxx'].includes(e)) return false;
  if (courseKey === 'adsa' && ['sql', 'py', 'java'].includes(e)) return false;
  if (courseKey === 'c' && ['java', 'py', 'sql'].includes(e)) return false;

  const detected = detectContentLanguage(content);
  if (detected) {
    if (courseKey === 'java' && detected !== 'java') return false;
    if (courseKey === 'python' && detected !== 'python') return false;
    if (courseKey === 'dbms' && detected !== 'dbms') return false;
    if ((courseKey === 'adsa' || courseKey === 'c') && detected !== 'c') return false;
  }
  return true;
}

function detectCourseKey(ext, filename = '', relPath = '', categoryHint = null, content = '') {
  const e = (ext || '').toLowerCase().replace('.', '');

  // Strict rule: .java to Java, .py to Python, .sql to DBMS, .c/.cpp to ADSA. A .sql file must never go to ADSA.
  if (e === 'sql') return 'dbms';
  if (e === 'java') return 'java';
  if (e === 'py') return 'python';
  if (e === 'c' || e === 'cpp') return 'adsa';

  const detected = detectContentLanguage(content);
  if (detected) return detected === 'c' ? 'adsa' : detected;

  const pathLower = (relPath + ' ' + filename + ' ' + (categoryHint || '')).toLowerCase();

  if (pathLower.includes('dbms') || pathLower.includes('sql')) {
    return 'dbms';
  }
  if (pathLower.includes('adsa') || pathLower.includes('dsa') || pathLower.includes('ds code') || pathLower.includes('tree') || pathLower.includes('graph') || pathLower.includes('avl') || pathLower.includes('heap')) {
    return 'adsa';
  }
  if (pathLower.includes('java')) {
    return 'java';
  }
  if (pathLower.includes('python')) {
    return 'python';
  }

  if (categoryHint && ['java', 'python', 'py', 'adsa', 'dsa', 'dbms', 'sql'].includes(categoryHint.toLowerCase())) {
    const k = categoryHint.toLowerCase();
    if (k === 'py') return 'python';
    if (k === 'dsa') return 'adsa';
    if (k === 'sql') return 'dbms';
    return k;
  }

  return null;
}

function matchFileToSyllabus(fileObj) {
  const filename = fileObj.originalName || fileObj.name || '';
  const ext = (fileObj.extension || '').toLowerCase().replace('.', '') || (filename.split('.').pop() || '').toLowerCase();
  const content = fileObj.content || '';
  const relPath = fileObj.relativePath || '';
  const categoryHint = fileObj.category || null;

  const courseKey = detectCourseKey(ext, filename, relPath, categoryHint, content);
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

  // Guard: If file content clearly belongs to another programming language than extension/course, never map as available
  const detectedContentLang = detectContentLanguage(content);
  if (!isCourseLanguageCompatible(course.key, ext, content)) {
    return {
      courseKey: course.key,
      course: course.course,
      courseCode: course.courseCode,
      category: course.category,
      experimentNumber: null,
      experimentName: null,
      matchConfidence: 'low',
      status: 'needs_review',
      reviewReason: `Language mismatch: file (.${ext || 'unknown'}) appears to contain ${(detectedContentLang || 'other').toUpperCase()} code.`
    };
  }

  const cleanedFilename = cleanString(filename);
  const fileWords = new Set(cleanedFilename.split(/\s+/).filter(w => w.length > 1));
  const explicitNumber = extractNumber(filename, relPath);

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
  detectContentLanguage,
  isCourseLanguageCompatible,
  detectCourseKey,
  matchFileToSyllabus
};
