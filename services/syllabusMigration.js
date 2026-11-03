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
const { execSync } = require('child_process');

async function seedLabProgramsFromZip() {
  const zipPath = path.join(__dirname, '..', 'Lab Programs Updated.zip');
  const extractedRoot = '/extracted_lab_programs/Lab Programs Updated';

  try {
    if (!fs.existsSync(extractedRoot) && fs.existsSync(zipPath)) {
      console.log('📦 Extracting "Lab Programs Updated.zip"...');
      execSync(`unzip -q -o "${zipPath}" -d /extracted_lab_programs`);
    }
  } catch (err) {
    console.warn('Extraction notice:', err.message);
  }

  if (!fs.existsSync(extractedRoot)) {
    return 0;
  }

  const existingFiles = await filesDB.find({}, {}, 10000);
  const existingNames = new Set(existingFiles.map(f => f.originalName));

  const subdirs = [
    { folder: 'java programs', category: 'java' },
    { folder: 'python code', category: 'python' },
    { folder: 'SQL Lab Programs', category: 'dbms' },
    { folder: 'DS code', category: 'adsa' }
  ];

  const docsToInsert = [];

  for (const { folder, category } of subdirs) {
    const fullFolder = path.join(extractedRoot, folder);
    if (!fs.existsSync(fullFolder)) continue;

    const fileList = fs.readdirSync(fullFolder);
    for (const fname of fileList) {
      if (fname.startsWith('.') || fname.endsWith('.txt')) continue;
      const fpath = path.join(fullFolder, fname);
      if (!fs.statSync(fpath).isFile()) continue;

      if (existingNames.has(fname)) {
        continue; // Rule 6: Never modify existing uploaded files
      }

      let content = '';
      try {
        content = fs.readFileSync(fpath, 'utf8');
      } catch (rErr) {
        content = '';
      }

      const ext = path.extname(fname).replace('.', '').toLowerCase();
      const storedName = crypto.randomUUID() + '.' + ext;
      const destPath = path.join(UPLOAD_DIR, storedName);

      try {
        fs.writeFileSync(destPath, content, 'utf8');
      } catch (wErr) {}

      const match = matchFileToSyllabus({
        originalName: fname,
        extension: ext,
        relativePath: fname,
        content: content,
        category: category
      });

      docsToInsert.push({
        originalName: fname,
        storedName: storedName,
        relativePath: fname,
        folderName: null,
        batchId: null,
        extension: ext,
        category: match.category || category,
        course: match.course,
        courseCode: match.courseCode,
        experimentNumber: match.experimentNumber,
        experimentName: match.experimentName,
        matchConfidence: match.matchConfidence,
        status: match.status,
        reviewReason: match.reviewReason || null,
        size: Buffer.byteLength(content, 'utf8'),
        tags: [ext, match.category || category],
        description: match.experimentName ? `Experiment #${match.experimentNumber}: ${match.experimentName}` : '',
        content: content,
        pinned: false,
        downloads: 0,
        uploadDate: new Date().toISOString()
      });

      existingNames.add(fname);
    }
  }

  if (docsToInsert.length > 0) {
    await filesDB.insertMany(docsToInsert);
    console.log(`✨ Successfully seeded ${docsToInsert.length} official lab programs from update package!`);
  }

  return docsToInsert.length;
}

async function migrateExistingFilesToSyllabus() {
  console.log('🔄 Checking existing files for official syllabus mapping...');
  try {
    // 1. Seed any new files from Lab Programs Updated package
    await seedLabProgramsFromZip();

    // 2. Audit and fix syllabus mapping for all existing records
    const files = await filesDB.find({}, {}, 10000);
    let mappedCount = 0;
    let reviewCount = 0;

    for (const f of files) {
      // Ensure physical sample file exists on disk if storedName is set
      if (f.storedName) {
        const fullPath = path.join(UPLOAD_DIR, f.storedName);
        if (!fs.existsSync(fullPath)) {
          const sample = f.content || SAMPLE_CODES[f.originalName];
          if (sample) {
            try {
              fs.writeFileSync(fullPath, sample, 'utf-8');
            } catch (wErr) {}
          }
        }
      }

      // Check if file content should be stored
      let content = f.content;
      if (!content && SAMPLE_CODES[f.originalName]) {
        content = SAMPLE_CODES[f.originalName];
      }

      // Run matcher with updated Rule 4 (.sql strictly to dbms, never adsa)
      const match = matchFileToSyllabus({
        originalName: f.originalName,
        extension: f.extension,
        category: f.category,
        relativePath: f.relativePath,
        content: content
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

      if (content && !f.content) {
        updateData.content = content;
      }

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
  migrateExistingFilesToSyllabus,
  SAMPLE_CODES
};
