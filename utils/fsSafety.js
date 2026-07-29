const path = require('path');
const sanitize = require('sanitize-filename');

const STORAGE_ROOT = path.join(__dirname, '..', 'uploads');

/**
 * Sanitize a single path segment (file or folder name) to prevent
 * path traversal and stripping of dangerous characters.
 */
function sanitizeSegment(segment) {
  const clean = sanitize(segment, { replacement: '_' }).trim();
  return clean.length ? clean : 'unnamed';
}

/**
 * Sanitize a relative path made of multiple segments (e.g. from
 * webkitdirectory uploads: "MyFolder/Sub/file.c"), rejecting any
 * attempt to escape the storage root.
 */
function sanitizeRelativePath(relPath) {
  const parts = relPath
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p.length && p !== '.' && p !== '..');
  const safeParts = parts.map(sanitizeSegment);
  return safeParts.join('/');
}

/**
 * Resolve a relative path against the storage root and verify the
 * result does not escape the root directory.
 */
function resolveSafe(relPath) {
  const target = path.join(STORAGE_ROOT, relPath);
  const normalizedRoot = path.normalize(STORAGE_ROOT + path.sep);
  const normalizedTarget = path.normalize(target);
  if (!normalizedTarget.startsWith(normalizedRoot) && normalizedTarget !== path.normalize(STORAGE_ROOT)) {
    throw new Error('Path traversal detected');
  }
  return normalizedTarget;
}

module.exports = { STORAGE_ROOT, sanitizeSegment, sanitizeRelativePath, resolveSafe };
