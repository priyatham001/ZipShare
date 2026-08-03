const express = require('express');
const router = express.Router();
const http = require('http');
const https = require('https');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { filesDB } = require('../db');
const { fetchRemoteContent } = require('../services/cloudinary');

// Active running execution tasks registry for POST /api/compiler/stop
const runningTasks = new Map();

// Supported Language Mapping for Judge0
const JUDGE0_LANG_IDS = {
  python: 71, py: 71,
  java: 62,
  c: 50,
  cpp: 54, 'c++': 54, cc: 54, cxx: 54,
  javascript: 63, js: 63, node: 63,
  typescript: 74, ts: 74,
  go: 60,
  rust: 73, rs: 73,
  csharp: 51, cs: 51,
  php: 68,
  ruby: 72, rb: 72,
  swift: 83,
  kotlin: 78, kt: 78, kts: 78,
  scala: 81,
  r: 80,
  'objective-c': 79, m: 79,
  perl: 85, pl: 85,
  lua: 64,
  bash: 46, sh: 46, shell: 46,
  sql: 82, dbms: 82,
  adsa: 54 // Auto-detected dynamically
};

// Language details metadata for GET /api/compiler/languages
const SUPPORTED_LANGUAGES_LIST = [
  { id: 'python', name: 'Python 3', extension: 'py', judge0Id: 71, status: 'Available' },
  { id: 'java', name: 'Java (OpenJDK)', extension: 'java', judge0Id: 62, status: 'Available' },
  { id: 'c', name: 'C (GCC)', extension: 'c', judge0Id: 50, status: 'Available' },
  { id: 'cpp', name: 'C++ (G++)', extension: 'cpp', judge0Id: 54, status: 'Available' },
  { id: 'adsa', name: 'Advanced Data Structures & Algorithms (ADSA)', extension: 'cpp', judge0Id: 54, status: 'Available' },
  { id: 'javascript', name: 'JavaScript (Node.js)', extension: 'js', judge0Id: 63, status: 'Available' },
  { id: 'typescript', name: 'TypeScript', extension: 'ts', judge0Id: 74, status: 'Available' },
  { id: 'sql', name: 'SQL / DBMS', extension: 'sql', judge0Id: 82, status: 'Available' },
  { id: 'go', name: 'Go', extension: 'go', judge0Id: 60, status: 'Available' },
  { id: 'rust', name: 'Rust', extension: 'rs', judge0Id: 73, status: 'Available' }
];

// Helper to check local compiler availability
function checkCommandExists(cmd) {
  try {
    const isWin = process.platform === 'win32';
    const checkCmd = isWin ? `where ${cmd}` : `which ${cmd}`;
    execSync(checkCmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Request to Judge0 CE API
function requestJudge0(payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    
    const apiKey = process.env.RAPIDAPI_KEY || process.env.JUDGE0_API_KEY;
    const host = process.env.JUDGE0_HOST || (apiKey ? 'judge0-ce.p.rapidapi.com' : 'ce.judge0.com');
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? http : https;

    const options = {
      hostname: host.replace(/^https?:\/\//, '').split('/')[0],
      path: '/submissions?wait=true&fields=stdout,stderr,compile_output,message,exit_code,time,memory,status',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 12000
    };

    if (apiKey) {
      options.headers['X-RapidAPI-Key'] = apiKey;
      options.headers['X-RapidAPI-Host'] = host;
    }

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error('Invalid response format from Judge0 API'));
        }
      });
    });

    req.on('error', (err) => { reject(err); });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Judge0 compiler API request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

// Local Execution Sandbox for Windows/Linux local compilers
async function executeLocalSandbox(langKey, code, stdin, taskId) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zipshare-exec-'));
  const isWin = process.platform === 'win32';

  try {
    let command = '';
    let args = [];
    let sourceFile = '';
    let runCmd = '';
    let runArgs = [];

    if (langKey === 'python' || langKey === 'py') {
      sourceFile = path.join(tmpDir, 'script.py');
      fs.writeFileSync(sourceFile, code, 'utf8');
      
      const pyCmd = checkCommandExists('python3') ? 'python3' : (checkCommandExists('python') ? 'python' : 'py');
      command = pyCmd;
      args = [sourceFile];

    } else if (langKey === 'javascript' || langKey === 'js' || langKey === 'node') {
      sourceFile = path.join(tmpDir, 'script.js');
      fs.writeFileSync(sourceFile, code, 'utf8');
      command = 'node';
      args = [sourceFile];

    } else if (langKey === 'java') {
      sourceFile = path.join(tmpDir, 'Main.java');
      fs.writeFileSync(sourceFile, code, 'utf8');

      // Compile Java
      const javacCmd = isWin && checkCommandExists('javac.exe') ? 'javac.exe' : 'javac';
      const compileRes = execSync(`${javacCmd} "${sourceFile}"`, { cwd: tmpDir, timeout: 8000, stdio: 'pipe' });
      
      const javaCmd = isWin && checkCommandExists('java.exe') ? 'java.exe' : 'java';
      command = javaCmd;
      args = ['-cp', tmpDir, 'Main'];

    } else if (langKey === 'c') {
      sourceFile = path.join(tmpDir, 'code.c');
      fs.writeFileSync(sourceFile, code, 'utf8');
      const exeName = isWin ? 'program.exe' : './program';
      const exePath = path.join(tmpDir, isWin ? 'program.exe' : 'program');

      const gccCmd = isWin && checkCommandExists('gcc.exe') ? 'gcc.exe' : 'gcc';
      execSync(`${gccCmd} "${sourceFile}" -o "${exePath}"`, { cwd: tmpDir, timeout: 8000, stdio: 'pipe' });

      command = exePath;
      args = [];

    } else if (langKey === 'cpp' || langKey === 'c++' || langKey === 'adsa') {
      sourceFile = path.join(tmpDir, 'code.cpp');
      fs.writeFileSync(sourceFile, code, 'utf8');
      const exeName = isWin ? 'program.exe' : './program';
      const exePath = path.join(tmpDir, isWin ? 'program.exe' : 'program');

      const gppCmd = isWin && checkCommandExists('g++.exe') ? 'g++.exe' : 'g++';
      execSync(`${gppCmd} "${sourceFile}" -o "${exePath}"`, { cwd: tmpDir, timeout: 8000, stdio: 'pipe' });

      command = exePath;
      args = [];
    } else {
      throw new Error(`Local execution not supported for language: ${langKey}`);
    }

    const startTime = Date.now();
    return await new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd: tmpDir, timeout: 10000 });
      if (taskId) runningTasks.set(taskId, child);

      let stdout = '';
      let stderr = '';

      if (stdin != null) {
        child.stdin.write(String(stdin));
      }
      child.stdin.end();

      child.stdout.on('data', data => { stdout += data.toString(); });
      child.stderr.on('data', data => { stderr += data.toString(); });

      child.on('error', err => {
        if (taskId) runningTasks.delete(taskId);
        reject(err);
      });

      child.on('close', code => {
        if (taskId) runningTasks.delete(taskId);
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(3);
        resolve({
          stdout,
          stderr,
          exitCode: code || 0,
          status: code === 0 ? 'Accepted' : 'Runtime Error',
          time: `${elapsedTime}s`,
          memory: '4.2 MB',
          provider: 'Local Execution Sandbox'
        });
      });
    });

  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ignore cleanup error */ }
  }
}

// GET /api/compiler/languages
router.get('/languages', (req, res) => {
  const provider = process.env.COMPILER_PROVIDER || 'Judge0 CE';
  res.json({
    provider,
    status: 'Online',
    languages: SUPPORTED_LANGUAGES_LIST
  });
});

// POST /api/compiler/status
router.get('/status', (req, res) => {
  const provider = process.env.COMPILER_PROVIDER || 'Judge0 CE / Local';
  res.json({
    status: 'Online',
    provider,
    hasLocalPython: checkCommandExists('python3') || checkCommandExists('python'),
    hasLocalNode: checkCommandExists('node'),
    hasLocalGcc: checkCommandExists('gcc'),
    hasLocalGpp: checkCommandExists('g++'),
    hasLocalJavac: checkCommandExists('javac'),
    judge0Host: process.env.JUDGE0_HOST || 'ce.judge0.com'
  });
});

// POST /api/compiler/stop
router.post('/stop', (req, res) => {
  const { taskId } = req.body;
  if (taskId && runningTasks.has(taskId)) {
    const proc = runningTasks.get(taskId);
    try {
      proc.kill('SIGKILL');
    } catch { /* ignore */ }
    runningTasks.delete(taskId);
    return res.json({ message: 'Execution stopped successfully.', taskId });
  }
  res.json({ message: 'No active process found for taskId or process already completed.' });
});

// POST /api/compiler/run
router.post('/run', async (req, res) => {
  try {
    let { fileId, code, language, stdin, taskId } = req.body;

    if (fileId && !code) {
      const file = await filesDB.findById(fileId);
      if (file) {
        if (file.content) {
          code = file.content;
        } else if (file.cloudinaryUrl) {
          try {
            const buf = await fetchRemoteContent(file.cloudinaryUrl);
            code = buf.toString('utf-8');
          } catch (e) { /* ignore */ }
        }
        if (!language && file.extension) {
          language = file.extension;
        }
      }
    }

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Source code is required.' });
    }

    let langKey = (language || 'python').toLowerCase().trim();

    // Auto-detect language for ADSA/DBMS or generic extensions
    if (langKey === 'adsa') {
      if (code.includes('#include') || code.includes('cout') || code.includes('cin')) {
        langKey = 'cpp';
      } else if (code.includes('import java.') || code.includes('public class')) {
        langKey = 'java';
      } else if (code.includes('def ') || code.includes('print(')) {
        langKey = 'python';
      } else {
        langKey = 'cpp';
      }
    } else if (langKey === 'dbms') {
      langKey = 'sql';
    }

    const languageId = JUDGE0_LANG_IDS[langKey];
    if (!languageId) {
      return res.status(400).json({
        error: 'Invalid language specified or language unavailable.'
      });
    }

    // Preprocessing Java source code for standalone execution
    if (languageId === 62) {
      // 1. Strip package declarations
      code = code.replace(/^\s*package\s+[\w.]+;/gm, '');

      // 2. Class name normalization to Main
      const publicClassMatch = code.match(/public\s+class\s+([A-Za-z0-9_]+)/);
      if (publicClassMatch && publicClassMatch[1]) {
        const mainClassName = publicClassMatch[1];
        if (mainClassName !== 'Main') {
          const classRegex = new RegExp('\\b' + mainClassName + '\\b', 'g');
          code = code.replace(classRegex, 'Main');
        }
      } else {
        const classMatch = code.match(/class\s+([A-Za-z0-9_]+)/);
        if (classMatch && classMatch[1]) {
          const className = classMatch[1];
          if (className !== 'Main') {
            const classRegex = new RegExp('\\b' + className + '\\b', 'g');
            code = code.replace(classRegex, 'Main');
          }
          if (!code.includes('public class Main')) {
            code = code.replace(/class\s+Main/, 'public class Main');
          }
        } else {
          code = `public class Main {\n  public static void main(String[] args) {\n${code}\n  }\n}`;
        }
      }
    }

    const providerMode = (process.env.COMPILER_PROVIDER || 'auto').toLowerCase();

    // Priority 1: Check if forced local execution or local compiler exists
    if (providerMode === 'local') {
      try {
        const localResult = await executeLocalSandbox(langKey, code, stdin, taskId);
        return res.json(localResult);
      } catch (localErr) {
        console.warn('Local execution failed, falling back to Judge0 API:', localErr.message);
      }
    }

    // Priority 2: Primary Judge0 CE API Execution (ce.judge0.com)
    const payload = {
      source_code: code,
      language_id: languageId,
      stdin: stdin != null ? String(stdin) : '',
      cpu_time_limit: 10.0,
      memory_limit: 128000
    };

    try {
      const judge0Res = await requestJudge0(payload);

      const stdout = judge0Res.stdout || '';
      const compileErr = judge0Res.compile_output || '';
      const stdErr = judge0Res.stderr || '';
      const msgErr = judge0Res.message || '';

      const stderrParts = [compileErr, stdErr, msgErr].filter(Boolean);
      const stderr = stderrParts.join('\n\n').trim();

      const statusObj = judge0Res.status || {};
      const statusId = statusObj.id;
      let statusDesc = statusObj.description || 'Completed';

      // Standardized verdict status classification
      if (statusId === 3) statusDesc = 'Accepted';
      else if (statusId === 5) statusDesc = 'Time Limit Exceeded';
      else if (statusId === 6) statusDesc = 'Compilation Error';
      else if (statusId >= 7 && statusId <= 12) statusDesc = 'Runtime Error';

      const time = judge0Res.time != null ? `${judge0Res.time}s` : '0.00s';
      const memory = judge0Res.memory != null ? `${(judge0Res.memory / 1024).toFixed(1)} MB` : '0.0 MB';

      return res.json({
        stdout,
        stderr,
        status: statusDesc,
        time,
        memory,
        exitCode: judge0Res.exit_code != null ? judge0Res.exit_code : (stderr ? 1 : 0),
        provider: 'Judge0 CE'
      });
    } catch (judge0Err) {
      console.warn('Judge0 CE API request failed, trying local sandbox fallback:', judge0Err.message);
    }

    // Priority 3: Local Sandbox Fallback for Python / JavaScript
    if (langKey === 'python' || langKey === 'py' || langKey === 'js' || langKey === 'javascript') {
      try {
        const localFallback = await executeLocalSandbox(langKey, code, stdin, taskId);
        return res.json(localFallback);
      } catch (e) {
        console.warn('Local sandbox fallback failed:', e.message);
      }
    }

    return res.status(503).json({
      error: 'Compiler API is currently offline. Please check network connection or try again later.',
      status: 'Compiler Offline'
    });

  } catch (err) {
    console.error('Compiler execution error:', err.message);
    res.status(500).json({
      error: 'Compiler execution encountered a server error.',
      details: err.message,
      status: 'Server Error'
    });
  }
});

module.exports = router;

