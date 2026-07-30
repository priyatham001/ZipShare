require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const filesRouter = require('./routes/files');
const adminRouter = require('./routes/admin');
const compilerRouter = require('./routes/compiler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/files', filesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/compiler', compilerRouter);

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Non-blocking HTTP server startup
app.listen(PORT, () => {
  console.log(`ZipShare running on port ${PORT}`);
});

// Non-blocking MongoDB connection
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.warn('MongoDB connection warning:', err.message));
} else {
  console.log('MONGODB_URI not provided. Running in hybrid/in-memory mode.');
}
