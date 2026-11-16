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

// Sample contents for initial sample lab files
const SAMPLE_CODES = {
  'DefaultValues.java': `public class DefaultValues {
    static byte defaultByte;
    static short defaultShort;
    static int defaultInt;
    static long defaultLong;
    static float defaultFloat;
    static double defaultDouble;
    static char defaultChar;
    static boolean defaultBoolean;

    public static void main(String[] args) {
        System.out.println("Default Values of Primitive Datatypes in Java using Static Keyword:");
        System.out.println("byte: " + defaultByte);
        System.out.println("short: " + defaultShort);
        System.out.println("int: " + defaultInt);
        System.out.println("long: " + defaultLong);
        System.out.println("float: " + defaultFloat);
        System.out.println("double: " + defaultDouble);
        System.out.println("char: [" + defaultChar + "]");
        System.out.println("boolean: " + defaultBoolean);
    }
}`,
  'QuadraticRoots.java': `import java.util.Scanner;

public class QuadraticRoots {
    public static void main(String[] args) {
        double a = 1.0, b = -5.0, c = 6.0;
        double discriminant = b * b - 4 * a * c;

        System.out.println("Equation: " + a + "x^2 + " + b + "x + " + c + " = 0");
        if (discriminant > 0) {
            double r1 = (-b + Math.sqrt(discriminant)) / (2 * a);
            double r2 = (-b - Math.sqrt(discriminant)) / (2 * a);
            System.out.println("Roots are real and distinct:");
            System.out.println("Root 1 = " + r1);
            System.out.println("Root 2 = " + r2);
        } else if (discriminant == 0) {
            double r = -b / (2 * a);
            System.out.println("Roots are real and equal: " + r);
        } else {
            double real = -b / (2 * a);
            double imag = Math.sqrt(-discriminant) / (2 * a);
            System.out.println("Roots are complex: " + real + " +/- " + imag + "i");
        }
    }
}`,
  'greatest_of_three.py': `def greatest_of_three(a, b, c):
    if a >= b and a >= c:
        return a
    elif b >= a and b >= c:
        return b
    else:
        return c

if __name__ == "__main__":
    n1, n2, n3 = 14, 42, 28
    print("Numbers:", n1, n2, n3)
    print("Largest of Three Numbers is:", greatest_of_three(n1, n2, n3))
`,
  'primes_in_given_range.py': `def is_prime(n):
    if n <= 1:
        return False
    for i in range(2, int(n**0.5) + 1):
        if n % i == 0:
            return False
    return True

def primes_in_interval(start, end):
    return [num for num in range(start, end + 1) if is_prime(num)]

if __name__ == "__main__":
    start, end = 10, 50
    print(f"Prime numbers in interval [{start}, {end}]:")
    print(primes_in_interval(start, end))
`,
  'Operators_demonstrate.py': `# Demonstration of various operators in Python
# Note: Demonstrates multiple operator types (arithmetic, comparison, logical)
a = 15
b = 4

print("Arithmetic Operators:")
print(f"{a} + {b} = {a + b}")
print(f"{a} - {b} = {a - b}")
print(f"{a} * {b} = {a * b}")
print(f"{a} / {b} = {a / b}")

print("\nComparison Operators:")
print(f"{a} > {b}: {a > b}")
print(f"{a} == {b}: {a == b}")

print("\nLogical Operators:")
print(f"({a} > 10 and {b} < 5): {a > 10 and b < 5}")
`
};

const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ZIP_SOURCE_NAME = 'zipshare.zip';
const LEGACY_DEMO_IDS = new Set([
  '6a69f6f543b8c52430bf13e4',
  '6a69f6f543b8c52430bf13e5',
  '6a69f6f543b8c52430bf13e6',
  '6a69f6f543b8c52430bf13e7',
  '6a69f6f543b8c52430bf13e8'
]);

function walkFilesRecursively(dir, baseDir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFilesRecursively(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relInside = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      results.push({ fullPath, fileName: entry.name, relInside });
    }
  }
  return results;
}

async function seedLabProgramsFromZip() {
  if (process.env.ZIPSHARE_AUTO_SEED !== 'true') {
    return { insertedCount: 0, updatedCount: 0, removedCount: 0, fileToZipFolder: new Map() };
  }
  const zipPath = path.join(__dirname, '..', ZIP_SOURCE_NAME);
  if (!fs.existsSync(zipPath)) {
    return { insertedCount: 0, updatedCount: 0, removedCount: 0, fileToZipFolder: new Map() };
  }

  const extractBase = path.join(os.tmpdir(), 'zipshare_extracted');
  const stampFile = path.join(extractBase, '.zip_stamp');
  const zipStat = fs.statSync(zipPath);
  const currentStamp = `${zipStat.size}:${Math.floor(zipStat.mtimeMs)}`;

  let needsExtract = !fs.existsSync(extractBase);
  if (!needsExtract) {
    try {
      const prevStamp = fs.existsSync(stampFile) ? fs.readFileSync(stampFile, 'utf8').trim() : '';
      if (prevStamp !== currentStamp) needsExtract = true;
    } catch (e) {
      needsExtract = true;
    }
  }

  if (needsExtract) {
    try {
      fs.rmSync(extractBase, { recursive: true, force: true });
      fs.mkdirSync(extractBase, { recursive: true });
      console.log(`📦 Extracting "${ZIP_SOURCE_NAME}"...`);
      execFileSync('unzip', ['-q', '-o', zipPath, '-d', extractBase], { timeout: 20000 });
      fs.writeFileSync(stampFile, currentStamp, 'utf8');
    } catch (err) {
      console.warn('Extraction notice:', err.message);
    }
  }

  // Handle either zipshare/<folder> or direct <folder> layout
  const nestedRoot = path.join(extractBase, 'zipshare');
  const extractedRoot = fs.existsSync(nestedRoot) ? nestedRoot : extractBase;
  if (!fs.existsSync(extractedRoot)) {
    return { insertedCount: 0, updatedCount: 0, removedCount: 0, fileToZipFolder: new Map() };
  }

  const existingFiles = await filesDB.find({}, {}, 10000);

  // Preserve pinned & download stats from legacy seeded/demo records for matching experiments
  const preservedStatsByCourseExp = new Map();
  const staleIdsToDelete = [];
  const staleStoredNames = [];

  for (const f of existingFiles) {
    const isOldZip =
      f.zipSource === 'Lab Programs Updated.zip' ||
      f.originalName === 'Lab Programs Updated.zip' ||
      LEGACY_DEMO_IDS.has(f._id || f.id);

    if (isOldZip) {
      if (f.category && f.experimentNumber && (f.pinned || f.downloads)) {
        const statKey = `${f.category}_${f.experimentNumber}`;
        const prev = preservedStatsByCourseExp.get(statKey) || { pinned: false, downloads: 0 };
        preservedStatsByCourseExp.set(statKey, {
          pinned: prev.pinned || Boolean(f.pinned),
          downloads: Math.max(prev.downloads, f.downloads || 0)
        });
      }
      staleIdsToDelete.push(f._id || f.id);
      if (f.storedName) staleStoredNames.push(f.storedName);
    }
  }

  if (staleIdsToDelete.length > 0) {
    await filesDB.deleteManyByIds(staleIdsToDelete);
    for (const stored of staleStoredNames) {
      try {
        const p = path.join(UPLOAD_DIR, stored);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (e) {}
    }
    console.log(`🧹 Replaced ${staleIdsToDelete.length} stale legacy/old-zip record(s).`);
  }

  const remainingFiles = await filesDB.find({}, {}, 10000);
  const existingByRelPath = new Map();
  for (const f of remainingFiles) {
    if (f.relativePath) existingByRelPath.set(f.relativePath, f);
  }

  const subdirs = [
    { folder: 'java programs', category: 'java' },
    { folder: 'python code', category: 'python' },
    { folder: 'SQL Lab Programs', category: 'dbms' },
    { folder: 'DS code', category: 'adsa' }
  ];

  const docsToInsert = [];
  const updatesToApply = [];
  const fileToZipFolder = new Map();
  const activeZipRelPaths = new Set();

  for (const { folder, category } of subdirs) {
    const fullFolder = path.join(extractedRoot, folder);
    if (!fs.existsSync(fullFolder)) continue;

    const walked = walkFilesRecursively(fullFolder, fullFolder);
    for (const { fullPath, fileName, relInside } of walked) {
      const relPath = `${folder}/${relInside}`;
      activeZipRelPaths.add(relPath);
      fileToZipFolder.set(fileName, folder);

      let content = '';
      try {
        content = fs.readFileSync(fullPath, 'utf8');
      } catch (rErr) {
        content = '';
      }

      const ext = path.extname(fileName).replace('.', '').toLowerCase();
      const match = matchFileToSyllabus({
        originalName: fileName,
        extension: ext,
        relativePath: relPath,
        content: content,
        category: category
      });

      const resolvedCategory = match.category || category;
      const existing = existingByRelPath.get(relPath);

      if (existing) {
        const needsContentUpdate = (existing.content || '') !== content;
        const needsMetaUpdate =
          existing.category !== resolvedCategory ||
          existing.experimentNumber !== match.experimentNumber ||
          existing.experimentName !== match.experimentName ||
          existing.status !== match.status ||
          existing.zipSource !== ZIP_SOURCE_NAME;

        if (needsContentUpdate || needsMetaUpdate) {
          if (needsContentUpdate && existing.storedName) {
            try {
              fs.writeFileSync(path.join(UPLOAD_DIR, existing.storedName), content, 'utf8');
            } catch (wErr) {}
          }
          updatesToApply.push({
            id: existing._id || existing.id,
            update: {
              content: content,
              size: Buffer.byteLength(content, 'utf8'),
              category: resolvedCategory,
              course: match.course,
              courseCode: match.courseCode,
              experimentNumber: match.experimentNumber,
              experimentName: match.experimentName,
              matchConfidence: match.matchConfidence,
              status: match.status,
              reviewReason: match.reviewReason || null,
              zipFolder: folder,
              zipSource: ZIP_SOURCE_NAME,
              description: match.experimentName ? `Experiment #${match.experimentNumber}: ${match.experimentName}` : '',
              updatedAt: new Date().toISOString()
            }
          });
        }
        continue;
      }

      const storedName = crypto.randomUUID() + (ext ? '.' + ext : '');
      const destPath = path.join(UPLOAD_DIR, storedName);
      try {
        fs.writeFileSync(destPath, content, 'utf8');
      } catch (wErr) {}

      const statKey = match.experimentNumber ? `${resolvedCategory}_${match.experimentNumber}` : '';
      const carried = preservedStatsByCourseExp.get(statKey);
      // Avoid pinning duplicate supporting .txt files; pin primary code file once
      const shouldPin = Boolean(carried && carried.pinned && ext !== 'txt');
      const carriedDownloads = carried && ext !== 'txt' ? carried.downloads : 0;
      if (carried) preservedStatsByCourseExp.delete(statKey);

      docsToInsert.push({
        originalName: fileName,
        storedName: storedName,
        relativePath: relPath,
        folderName: null,
        zipFolder: folder,
        zipSource: ZIP_SOURCE_NAME,
        batchId: null,
        extension: ext,
        category: resolvedCategory,
        course: match.course,
        courseCode: match.courseCode,
        experimentNumber: match.experimentNumber,
        experimentName: match.experimentName,
        matchConfidence: match.matchConfidence,
        status: match.status,
        reviewReason: match.reviewReason || null,
        size: Buffer.byteLength(content, 'utf8'),
        tags: [ext, resolvedCategory, folder].filter(Boolean),
        description: match.experimentName ? `Experiment #${match.experimentNumber}: ${match.experimentName}` : '',
        content: content,
        pinned: shouldPin,
        downloads: carriedDownloads,
        uploadDate: new Date().toISOString()
      });
    }
  }

  // Remove any previously seeded zipshare.zip records that are no longer inside zipshare.zip
  const orphanZipRecords = remainingFiles.filter(
    f => f.zipSource === ZIP_SOURCE_NAME && f.extension !== 'zip' && !activeZipRelPaths.has(f.relativePath)
  );
  if (orphanZipRecords.length > 0) {
    await filesDB.deleteManyByIds(orphanZipRecords.map(f => f._id || f.id));
    for (const f of orphanZipRecords) {
      if (f.storedName) {
        try { fs.unlinkSync(path.join(UPLOAD_DIR, f.storedName)); } catch (e) {}
      }
    }
  }

  // Ensure main zipshare.zip archive is indexed as a downloadable zip package
  const existingZipEntry = existingByRelPath.get(ZIP_SOURCE_NAME);
  if (!existingZipEntry) {
    try {
      const zipStored = crypto.randomUUID() + '.zip';
      try {
        fs.copyFileSync(zipPath, path.join(UPLOAD_DIR, zipStored));
      } catch (cpErr) {}
      docsToInsert.push({
        originalName: ZIP_SOURCE_NAME,
        storedName: zipStored,
        relativePath: ZIP_SOURCE_NAME,
        folderName: 'zipshare',
        zipFolder: 'zipshare',
        zipSource: ZIP_SOURCE_NAME,
        batchId: 'zip-root-lab-programs',
        extension: 'zip',
        category: 'zip',
        course: null,
        courseCode: null,
        experimentNumber: null,
        experimentName: null,
        matchConfidence: 'high',
        status: 'available',
        reviewReason: null,
        size: zipStat.size,
        mimeType: 'application/zip',
        tags: ['zip', 'archive', 'lab-programs', 'java', 'python', 'dbms', 'adsa'],
        description: 'Complete zip archive containing all official Java, Python, SQL/DBMS, and ADSA/C lab programs.',
        pinned: false,
        downloads: 0,
        uploadDate: new Date().toISOString()
      });
    } catch (zErr) {}
  } else if (existingZipEntry.size !== zipStat.size) {
    if (existingZipEntry.storedName) {
      try { fs.copyFileSync(zipPath, path.join(UPLOAD_DIR, existingZipEntry.storedName)); } catch (cpErr) {}
    }
    updatesToApply.push({
      id: existingZipEntry._id || existingZipEntry.id,
      update: { size: zipStat.size, updatedAt: new Date().toISOString() }
    });
  }

  if (updatesToApply.length > 0) {
    await filesDB.bulkUpdate(updatesToApply);
  }
  if (docsToInsert.length > 0) {
    await filesDB.insertMany(docsToInsert);
    console.log(`✨ Successfully seeded ${docsToInsert.length} official lab programs from "${ZIP_SOURCE_NAME}"!`);
  }

  return {
    insertedCount: docsToInsert.length,
    updatedCount: updatesToApply.length,
    removedCount: staleIdsToDelete.length + orphanZipRecords.length,
    fileToZipFolder
  };
}

async function migrateExistingFilesToSyllabus() {
  console.log('🔄 Checking existing files for official syllabus mapping...');
  try {
    // 1. Seed/sync files from zipshare.zip package
    const seedRes = await seedLabProgramsFromZip();
    const fileToZipFolder = seedRes && seedRes.fileToZipFolder ? seedRes.fileToZipFolder : new Map();

    // 2. Remove legacy UUID-named duplicate/corrupted records in one batch
    const allFiles = await filesDB.find({}, {}, 10000);
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i;
    const namedFiles = allFiles.filter(f => !uuidPattern.test(f.originalName || ''));
    const namedStoredSet = new Set(namedFiles.map(f => f.storedName).filter(Boolean));
    const namedContentSet = new Set(namedFiles.map(f => (f.content || '').trim()).filter(Boolean));

    const duplicateIds = [];
    for (const f of allFiles) {
      if (uuidPattern.test(f.originalName || '')) {
        const trimmedContent = (f.content || '').trim();
        const isDuplicate = namedStoredSet.has(f.storedName) || (trimmedContent && namedContentSet.has(trimmedContent));
        if (isDuplicate) {
          duplicateIds.push(f._id || f.id);
        }
      }
    }
    if (duplicateIds.length > 0) {
      await filesDB.deleteManyByIds(duplicateIds);
      console.log(`🧹 Cleaned ${duplicateIds.length} legacy UUID duplicate/mismatched file record(s).`);
    }

    // 3. Audit and fix syllabus mapping ONLY for records needing changes (single batch write)
    const files = await filesDB.find({}, {}, 10000);
    const batchUpdates = [];
    let mappedCount = 0;
    let reviewCount = 0;

    for (const f of files) {
      if ((f.extension || '').toLowerCase() === 'zip' || f.category === 'zip') {
        if (f.status !== 'available' || f.category !== 'zip') {
          batchUpdates.push({
            id: f._id || f.id,
            update: { category: 'zip', status: 'available', reviewReason: null }
          });
        }
        mappedCount++;
        continue;
      }

      if (f.storedName) {
        const fullPath = path.join(UPLOAD_DIR, f.storedName);
        if (!fs.existsSync(fullPath)) {
          const sample = f.content || SAMPLE_CODES[f.originalName];
          if (sample) {
            try { fs.writeFileSync(fullPath, sample, 'utf-8'); } catch (wErr) {}
          }
        }
      }

      let content = f.content;
      if (!content && SAMPLE_CODES[f.originalName]) {
        content = SAMPLE_CODES[f.originalName];
      }

      const match = matchFileToSyllabus({
        originalName: f.originalName,
        extension: f.extension,
        category: f.category,
        relativePath: f.relativePath,
        content: content
      });

      const resolvedCategory = match.category || f.category;
      const mappedZipFolder = fileToZipFolder.get(f.originalName);

      const changed =
        f.category !== resolvedCategory ||
        f.course !== match.course ||
        f.courseCode !== match.courseCode ||
        f.experimentNumber !== match.experimentNumber ||
        f.experimentName !== match.experimentName ||
        f.matchConfidence !== match.matchConfidence ||
        f.status !== match.status ||
        (f.reviewReason || null) !== (match.reviewReason || null) ||
        (content && !f.content) ||
        (mappedZipFolder && (!f.zipFolder || !f.zipSource));

      if (changed) {
        const updateData = {
          category: resolvedCategory,
          course: match.course,
          courseCode: match.courseCode,
          experimentNumber: match.experimentNumber,
          experimentName: match.experimentName,
          matchConfidence: match.matchConfidence,
          status: match.status,
          reviewReason: match.reviewReason || null
        };
        if (mappedZipFolder) {
          if (!f.zipFolder) updateData.zipFolder = mappedZipFolder;
          if (!f.zipSource) updateData.zipSource = ZIP_SOURCE_NAME;
        }
        if (content && !f.content) {
          updateData.content = content;
        }
        batchUpdates.push({ id: f._id || f.id, update: updateData });
      }

      if (match.status === 'available') {
        mappedCount++;
      } else {
        reviewCount++;
      }
    }

    if (batchUpdates.length > 0) {
      await filesDB.bulkUpdate(batchUpdates);
    }

    console.log(`✨ Syllabus sync complete: ${mappedCount} mapped (available), ${reviewCount} needing review.`);
    return { mappedCount, reviewCount, total: files.length };
  } catch (err) {
    console.error('Syllabus migration error:', err.message);
    throw err;
  }
}

module.exports = {
  migrateExistingFilesToSyllabus,
  SAMPLE_CODES
};
