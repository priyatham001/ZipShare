require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const zlib = require('zlib');
const { connectDB } = require('./db');

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

// Built-in fast gzip compression for text/JSON/JS/CSS responses
app.use((req, res, next) => {
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

// Serverless-safe DB connection middleware for API routes on Vercel (skip for AI and compiler routes)
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api') && !req.path.startsWith('/api/ai') && !req.path.startsWith('/api/compiler')) {
    try {
      await connectDB();
    } catch (e) {
      // Local fallback handles it gracefully
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

// Database offline / Mongoose fallback error middleware
app.use((err, req, res, next) => {
  if (err.name === 'MongooseError' || err.name === 'MongoNetworkError' || (err.message && err.message.includes('buffering timed out'))) {
    console.warn('[AI Studio] Database offline — returning fallback response');
    if (req.method === 'GET') {
      return res.json(req.path.endsWith('s') || req.path.endsWith('s/') ? [] : {});
    }
    return res.status(503).json({ error: 'Service temporarily unavailable (database offline)' });
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
