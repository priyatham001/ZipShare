const fs = require('fs');
const path = require('path');
const { filesDB } = require('../db');
const { isCloudinaryConfigured, uploadToCloudinary } = require('./cloudinary');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const CODE_EXTENSIONS = ['java', 'py', 'c', 'cpp', 'js', 'ts', 'html', 'css', 'sql', 'txt', 'md', 'json'];

async function migrateLocalFilesToCloudinary() {
  if (!isCloudinaryConfigured()) {
    console.log('⚡ Cloudinary environment variables not set. Running in local/fallback storage mode.');
    return;
  }

  console.log('🔄 Checking for local files to migrate to Cloudinary...');
  try {
    const files = await filesDB.find({}, {}, 10000);
    let count = 0;

    for (const f of files) {
      if (!f.cloudinaryUrl && f.storedName) {
        const fullPath = path.join(UPLOAD_DIR, f.storedName);
        if (fs.existsSync(fullPath)) {
          try {
            const ext = (f.extension || '').toLowerCase();
            const topFolder = f.folderName || null;
            const resType = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'].includes(ext) ? 'auto' : 'raw';

            const cloudRes = await uploadToCloudinary(fullPath, {
              folder: topFolder ? `zipshare_uploads/${topFolder}` : 'zipshare_uploads',
              resource_type: resType
            });

            let fileContent = f.content;
            if (!fileContent && CODE_EXTENSIONS.includes(ext)) {
              try {
                fileContent = fs.readFileSync(fullPath, 'utf-8');
              } catch (e) { /* ignore */ }
            }

            await filesDB.findByIdAndUpdate(f._id || f.id, {
              cloudinaryUrl: cloudRes.secure_url,
              cloudinaryPublicId: cloudRes.public_id,
              assetId: cloudRes.asset_id || null,
              content: fileContent,
              updatedAt: new Date()
            });

            // Clean up local copy after verified Cloudinary upload
            try { fs.unlinkSync(fullPath); } catch (e) { /* ignore */ }

            count++;
            console.log(`✅ Successfully migrated "${f.originalName}" to Cloudinary.`);
          } catch (mErr) {
            console.error(`❌ Migration failed for "${f.originalName}":`, mErr.message);
          }
        }
      }
    }

    if (count > 0) {
      console.log(`🎉 Cloudinary Migration completed! ${count} file(s) uploaded to permanent cloud storage.`);
    } else {
      console.log('✨ Cloudinary sync verified.');
    }
  } catch (err) {
    console.error('Cloudinary migration check error:', err.message);
  }
}

module.exports = {
  migrateLocalFilesToCloudinary
};
