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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/files', filesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/compiler', compilerRouter);
app.use('/api/ai', aiRouter);

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Connect Database & Start Server
connectDB().then(() => {
  const { migrateLocalFilesToCloudinary } = require('./services/migration');
  migrateLocalFilesToCloudinary().catch(err => console.error('Migration error:', err.message));

  app.listen(PORT, () => {
    console.log(`ZipShare V3 server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Server startup error:', err);
  app.listen(PORT, () => {
    console.log(`ZipShare V3 server running on fallback port ${PORT}`);
  });
});
