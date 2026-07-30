const express = require('express');
const router = express.Router();
const File = require('../models/File');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

const EXTENSION_MAP = {
  c: 103,
  cpp: 105, cc: 105, cxx: 105,
  java: 91,
  py: 100,
  sql: 82,
  js: 102,
  ts: 101,
  go: 107,
  rs: 108,
  cs: 51,
  kt: 111, kts: 111,
  php: 98,
  rb: 72,
  swift: 83,
  scala: 112
};

const FALLBACK_MAP = {
  c: 50,
  cpp: 54, cc: 54, cxx: 54,
  java: 62,
  py: 71,
  sql: 82,
  js: 63,
  ts: 74,
  go: 60,
  rs: 73,
  kt: 78,
  php: 68,
  scala: 81
};

function prepareJavaSource(code) {
  if (!code) return code;
  let source = code;

  // 1. Look for 'public class ClassName'
  const publicMatch = source.match(/public\s+class\s+([A-Za-z0-9_]+)/);
  if (publicMatch) {
    const className = publicMatch[1];
    if (className !== 'Main') {
      const regex = new RegExp(`\\b${className}\\b`, 'g');
      source = source.replace(regex, 'Main');
    }
    return source;
  }

  // 2. Look for 'class ClassName' that contains main method or is top class
  const classMatches = [...source.matchAll(/class\s+([A-Za-z0-9_]+)/g)];
  if (classMatches.length > 0) {
    let targetClass = classMatches[0][1];
    for (const match of classMatches) {
      const name = match[1];
      const sub = source.slice(match.index);
      if (sub.includes('public static void main') || sub.includes('static void main')) {
        targetClass = name;
        break;
      }
    }

    if (targetClass !== 'Main') {
      const regex = new RegExp(`\\b${targetClass}\\b`, 'g');
      source = source.replace(regex, 'Main');
    }
    // Ensure class Main is public
    source = source.replace(/class\s+Main\b/, 'public class Main');
  }

  return source;
}

router.post('/run', async (req, res) => {
  try {
    let { fileId, sourceCode, filename, extension, stdin } = req.body;

    if (fileId && !sourceCode) {
      const file = await File.findById(fileId);
      if (!file) return res.status(404).json({ error: 'Source file not found.' });
      filename = filename || file.originalName;
      extension = extension || file.extension;
      const fullPath = path.join(UPLOAD_DIR, file.storedName);
      if (fs.existsSync(fullPath)) {
        sourceCode = fs.readFileSync(fullPath, 'utf-8');
      }
    }

    if (!sourceCode || !sourceCode.trim()) {
      return res.status(400).json({ error: 'Source code cannot be empty.' });
    }

    let ext = (extension || '').toLowerCase().replace(/^\./, '');
    if (!ext && filename) {
      ext = path.extname(filename).toLowerCase().replace('.', '');
    }

    let languageId = EXTENSION_MAP[ext];
    if (!languageId) {
      return res.status(400).json({
        error: `Unsupported file extension .${ext}. Executable extensions: .c, .cpp, .java, .py, .js, .ts, .go, .rs, .cs, .kt, .php, .rb, .swift, .scala`
      });
    }

    let preparedCode = sourceCode;
    if (ext === 'java') {
      preparedCode = prepareJavaSource(sourceCode);
    }

    const judge0Url = process.env.JUDGE0_URL || 'https://ce.judge0.com';
    const payload = {
      source_code: preparedCode,
      language_id: languageId,
      stdin: stdin || '',
      cpu_time_limit: 10,
      memory_limit: 128000
    };

    const headers = { 'Content-Type': 'application/json' };
    if (process.env.JUDGE0_API_KEY) {
      headers['X-RapidAPI-Key'] = process.env.JUDGE0_API_KEY;
    }

    let response = await fetch(`${judge0Url}/submissions?wait=true&base64_encoded=false`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    let judge0Data = null;
    if (response.ok) {
      judge0Data = await response.json();
    } else {
      // Fallback language ID attempt if primary fails
      const fallbackId = FALLBACK_MAP[ext];
      if (fallbackId && fallbackId !== languageId) {
        payload.language_id = fallbackId;
        const fbResponse = await fetch(`${judge0Url}/submissions?wait=true&base64_encoded=false`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        if (fbResponse.ok) {
          judge0Data = await fbResponse.json();
        } else {
          const errText = await fbResponse.text();
          return res.status(fbResponse.status).json({
            error: errText || 'Judge0 execution failed.'
          });
        }
      } else {
        const errText = await response.text();
        return res.status(response.status).json({
          error: errText || 'Judge0 execution failed.'
        });
      }
    }

    const timeMs = judge0Data.time ? Math.round(parseFloat(judge0Data.time) * 1000) + ' ms' : '0 ms';
    let memStr = '0 KB';
    if (judge0Data.memory) {
      memStr = judge0Data.memory > 1024
        ? (judge0Data.memory / 1024).toFixed(1) + ' MB'
        : judge0Data.memory + ' KB';
    }

    return res.json({
      stdout: judge0Data.stdout || '',
      stderr: judge0Data.stderr || '',
      compile_output: judge0Data.compile_output || '',
      message: judge0Data.message || '',
      time: timeMs,
      memory: memStr,
      status: judge0Data.status || { id: 3, description: 'Accepted' },
      exit_code: judge0Data.exit_code
    });

  } catch (err) {
    console.error('Compiler run error:', err.message);
    return res.status(500).json({ error: err.message || 'Execution failed.' });
  }
});

module.exports = router;
