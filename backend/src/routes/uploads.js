const express = require("express");
const multer = require("multer");
const path = require("path");
const { v4: uuid } = require("uuid");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});

// 25 Mo max (photos de chantier, PDF de fiches techniques, etc.)
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// Upload generique : renvoie une URL utilisable pour un Document, un Equipement, etc.
router.post(
  "/",
  upload.single("file"),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier recu" });
    res.status(201).json({
      fileUrl: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
    });
  }
);

module.exports = router;
