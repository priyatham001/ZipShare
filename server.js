require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const zlib = require('zlib');
const { connectDB, isMongoExpectedButDisconnected, getDataVersion } = require('./db');

const filesRouter = require('./routes/files');
const adminRouter = require('./routes/admin');
const requestsRouter = require('./routes/requests');
const compilerRouter = require('./routes/compiler');
const aiRouter = require('./routes/ai');
const syllabusRouter = require('./routes/syllabus');

const app = express();

const isVercel = Boolean(process.env.VERCEL);
const isRender = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
// AI Studio dev server runs strictly on port 3000
const PORT = 3000;

app.use(cors());

// Built-in fast gzip compression for text/JSON/JS/CSS responses (skip on Vercel where edge compresses automatically)
app.use((req, res, next) => {
  if (isVercel) return next();
  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (!acceptEncoding.includes('gzip') || req.path.includes('/download')) {
    return next();
  }
  const origJson = res.json.bind(res);
  const origSend = res.send.bind(res);

  res.json = (body) => {
    const jsonStr = JSON.stringify(body);
    if (jsonStr.length < 1024 || res.headersSent) {
      return origJson(body);
    }
    zlib.gzip(jsonStr, { level: 4 }, (err, compressed) => {
      if (err || res.headersSent) return origJson(body);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.end(compressed);
    });
    return res;
  };

  res.send = (body) => {
    if (res.headersSent || res.getHeader('Content-Encoding')) return origSend(body);
    const ct = String(res.getHeader('Content-Type') || '');
    const isCompressible = typeof body === 'string' || ct.includes('text/') || ct.includes('javascript') || ct.includes('json');
    if (!isCompressible || !body || body.length < 1024) {
      return origSend(body);
    }
    zlib.gzip(body, { level: 4 }, (err, compressed) => {
      if (err || res.headersSent) return origSend(body);
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.end(compressed);
    });
    return res;
  };

  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint (safe, no secrets exposed)
app.get('/api/health', async (req, res) => {
  try {
    await connectDB();
  } catch (e) {
    // Tracked via isMongoExpectedButDisconnected()
  }
  const dbUnavailable = isMongoExpectedButDisconnected();
  res.status(dbUnavailable ? 503 : 200).json({
    ok: !dbUnavailable,
    dbStatus: dbUnavailable ? 'disconnected' : (process.env.MONGODB_URI ? 'mongodb' : 'local_json'),
    mongoConfigured: Boolean(process.env.MONGODB_URI),
    dataVersion: getDataVersion()
  });
});

// Serverless-safe DB connection middleware for DB-backed API routes
app.use(async (req, res, next) => {
  const needsDB =
    req.path.startsWith('/api') &&
    !req.path.startsWith('/api/ai') &&
    !req.path.startsWith('/api/compiler') &&
    req.path !== '/api/health' &&
    req.path !== '/api/admin/login' &&
    req.path !== '/api/admin/settings';

  if (needsDB) {
    try {
      await connectDB();
    } catch (e) {
      console.error('Database connection middleware error:', e.message);
    }
    if (isMongoExpectedButDisconnected()) {
      return res.status(503).json({
        error: 'Could not connect to server file index (database connection unavailable).',
        code: 'DB_UNAVAILABLE'
      });
    }
  }
  next();
});

app.use('/api/files', filesRouter);
app.use('/api/syllabus', syllabusRouter);
app.use('/api/admin', adminRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/compiler', compilerRouter);
app.use('/api/ai', aiRouter);

app.use('/vendor/three.min.js', express.static(path.join(__dirname, 'node_modules', 'three', 'build', 'three.min.js'), { maxAge: '7d', etag: true }));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), { maxAge: '1d', etag: true }));
app.use(express.static(path.join(__dirname, 'public'), { etag: true }));

// Database offline / Mongoose error middleware
app.use((err, req, res, next) => {
  if (
    err.name === 'MongooseError' ||
    err.name === 'MongoNetworkError' ||
    err.name === 'MongoServerSelectionError' ||
    (err.message && err.message.includes('buffering timed out'))
  ) {
    console.warn('Database offline error:', err.message);
    return res.status(503).json({
      error: 'Could not connect to server file index (database temporarily offline).',
      code: 'DB_UNAVAILABLE'
    });
  }
  next(err);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// For Vercel Serverless Functions: export the Express app and do NOT call app.listen()
// For Render and local development: start normal HTTP server with app.listen()
if (!isVercel || require.main === module) {
  connectDB().then(() => {
    const { migrateLocalFilesToCloudinary } = require('./services/migration');
    const { migrateExistingFilesToSyllabus } = require('./services/syllabusMigration');
    migrateLocalFilesToCloudinary().catch(err => console.error('Migration error:', err.message));
    migrateExistingFilesToSyllabus().catch(err => console.error('Syllabus migration error:', err.message));

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`ZipShare V3 server running on port ${PORT} (0.0.0.0)`);
    });
  }).catch(err => {
    console.error('Server startup error:', err);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`ZipShare V3 server running on fallback port ${PORT} (0.0.0.0)`);
    });
  });
}

module.exports = app;
