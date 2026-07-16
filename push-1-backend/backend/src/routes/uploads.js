const express = require("express");
const multer = require("multer");
const path = require("path");
const { v4: uuid } = require("uuid");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Les fichiers sont stockes EN BASE DE DONNEES (table StoredFile) et plus sur le disque :
// le disque de Render (plan gratuit) est efface a chaque redeploiement, la base persiste.
// Les anciens fichiers restes sur disque sont toujours servis en secours (voir index.js).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier recu" });
    const ext = path.extname(req.file.originalname);
    const name = `${uuid()}${ext}`;
    await prisma.storedFile.create({
      data: {
        name,
        originalName: req.file.originalname,
        mime: req.file.mimetype,
        size: req.file.size,
        data: req.file.buffer,
      },
    });
    res.status(201).json({
      fileUrl: `/uploads/${name}`,
      fileName: req.file.originalname,
    });
  })
);

module.exports = router;
