const cloudinary = require('cloudinary').v2;
const https = require('https');
const http = require('http');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || undefined,
  api_key: process.env.CLOUDINARY_API_KEY || undefined,
  api_secret: process.env.CLOUDINARY_API_SECRET || undefined,
  secure: true
});

function isCloudinaryConfigured() {
  if (process.env.CLOUDINARY_URL) return true;
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

/**
 * Upload buffer or file path to Cloudinary
 * @param {Buffer|string} fileSource - Buffer or local file path
 * @param {Object} options - Upload options
 */
async function uploadToCloudinary(fileSource, options = {}) {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary environment variables (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) are missing.');
  }

  const resourceType = options.resource_type || 'raw';
  const uploadOptions = {
    folder: options.folder || 'zipshare_uploads',
    resource_type: resourceType,
    use_filename: true,
    unique_filename: true,
    ...options
  };

  if (Buffer.isBuffer(fileSource)) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      });
      stream.end(fileSource);
    });
  } else if (typeof fileSource === 'string') {
    return await cloudinary.uploader.upload(fileSource, uploadOptions);
  } else {
    throw new Error('Invalid file source passed to Cloudinary uploader.');
  }
}

/**
 * Delete asset from Cloudinary
 * @param {string} publicId - Cloudinary public_id
 * @param {string} [resourceType='raw'] - Asset resource type ('raw', 'image', 'video')
 */
async function deleteFromCloudinary(publicId, resourceType = 'raw') {
  if (!publicId || !isCloudinaryConfigured()) return { result: 'skipped' };
  try {
    let res = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
    if (res.result !== 'ok' && res.result !== 'not_found') {
      const altType = resourceType === 'raw' ? 'image' : 'raw';
      res = await cloudinary.uploader.destroy(publicId, { resource_type: altType, invalidate: true });
    }
    return res;
  } catch (err) {
    console.error('Cloudinary deletion error:', err.message);
    throw err;
  }
}

/**
 * Fetch file buffer or text content from a remote Cloudinary URL
 * @param {string} url - Secure Cloudinary URL
 */
function fetchRemoteContent(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchRemoteContent(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch file from Cloudinary (Status: ${res.statusCode})`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

module.exports = {
  cloudinary,
  isCloudinaryConfigured,
  uploadToCloudinary,
  deleteFromCloudinary,
  fetchRemoteContent
};
