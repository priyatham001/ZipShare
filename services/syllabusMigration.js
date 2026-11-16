const fs = require('fs');
const path = require('path');
const os = require('os');
const { filesDB } = require('../db');
const { matchFileToSyllabus } = require('./syllabusMatcher');

const isVercel = Boolean(process.env.VERCEL);
const UPLOAD_DIR = isVercel
  ? path.join(os.tmpdir(), 'zipshare_uploads')
  : path.join(__dirname, '..', 'uploads');

try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
} catch (e) {
  // Safe on read-only environments
}

async function migrateExistingFilesToSyllabus() {
  console.log('🔄 Checking manually uploaded files for syllabus mapping...');
  try {
    const files = await filesDB.find({}, {}, 10000);
    let mappedCount = 0;
    let reviewCount = 0;

    for (const f of files) {
      if ((f.extension || '').toLowerCase() === 'zip' || f.category === 'zip') {
        if (f.status !== 'available' || f.category !== 'zip') {
          await filesDB.findByIdAndUpdate(f._id || f.id, { category: 'zip', status: 'available', reviewReason: null });
        }
        mappedCount++;
        continue;
      }

      const content = f.content || null;
      const match = matchFileToSyllabus({
        originalName: f.originalName,
        extension: f.extension,
        category: f.category,
        relativePath: f.relativePath,
        content
      });

      const updateData = {
        category: match.category || f.category,
        course: match.course,
        courseCode: match.courseCode,
        experimentNumber: match.experimentNumber,
        experimentName: match.experimentName,
        matchConfidence: match.matchConfidence,
        status: match.status,
        reviewReason: match.reviewReason || null
      };

      await filesDB.findByIdAndUpdate(f._id || f.id, updateData);

      if (match.status === 'available') {
        mappedCount++;
      } else {
        reviewCount++;
      }
    }

    console.log(`✨ Syllabus sync complete: ${mappedCount} mapped (available), ${reviewCount} needing review.`);
    return { mappedCount, reviewCount, total: files.length };
  } catch (err) {
    console.error('Syllabus migration error:', err.message);
    throw err;
  }
}

module.exports = {
  migrateExistingFilesToSyllabus
};
