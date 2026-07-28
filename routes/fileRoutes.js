const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const File = require("../models/File");

const router = express.Router();

// Where uploads get stored, and how they get named
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads"));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, unique);
  }
});

// Only allow .zip files, max 100 MB
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isZip =
      file.mimetype === "application/zip" ||
      file.mimetype === "application/x-zip-compressed" ||
      path.extname(file.originalname).toLowerCase() === ".zip";
    if (!isZip) {
      return cb(new Error("Only .zip files are allowed"));
    }
    cb(null, true);
  }
});

// POST /files  -> upload a zip
router.post("/", (req, res) => {
  upload.single("zipfile")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    try {
      const file = await File.create({
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size
      });

      res.json({ success: true, message: "ZIP uploaded successfully", file });
    } catch (dbErr) {
      res.status(500).json({ success: false, message: dbErr.message });
    }
  });
});

// GET /files -> list all uploaded files
router.get("/", async (req, res) => {
  try {
    const files = await File.find().sort({ uploadDate: -1 });
    res.json(files);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /files/:id -> remove a file
router.delete("/:id", async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    const filepath = path.join(__dirname, "../uploads", file.filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    await File.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "File deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
