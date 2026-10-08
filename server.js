require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
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
// Port resolution: Render sets process.env.PORT (e.g. 10000). AI Studio / local defaults to 3000.
const PORT = isRender ? (process.env.PORT || 10000) : (process.env.DEFAULT_APP_PORT || (process.env.PORT && !process.env.NGINX_PORT ? process.env.PORT : 3000));

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serverless-safe DB connection middleware for API routes on Vercel
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api')) {
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

app.use(express.static(path.join(__dirname, 'public')));

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
if (!isVercel) {
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
