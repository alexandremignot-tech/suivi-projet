const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuid } = require("uuid");
const { requireAuth } = require("../middleware/auth");
const prisma = require("../db");

const router = express.Router();
router.use(requireAuth);

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");

// Stockage en memoire (pas disque direct) : le fichier est ensuite ecrit a la fois sur disque
// (acces rapide, pas de round-trip DB pour servir les fichiers courants) ET en base via
// StoredFile (voir schema.prisma), qui persiste aux redeploiements. Sans cette double ecriture,
// tout fichier uploade (documents, fiches techniques, devis/factures, contrats generes depuis un
// devis...) disparaissait silencieusement au redeploiement suivant, car le disque d'un service
// Render est ephemere. La route GET /uploads/:name (voir index.js) verifie deja la base en
// premier avant de retomber sur le disque : cette route termine le circuit en alimentant cette base.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Upload generique : renvoie une URL utilisable pour un Document, un Equipement, etc.
router.post(
  "/",
  upload.single("file"),
  async (req, res, next) => {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier recu" });
    const filename = `${uuid()}${path.extname(req.file.originalname)}`;
    try {
      // Ecriture disque : best-effort, ne bloque pas la reponse si le disque est indisponible
      // (conteneur en lecture seule, etc.) puisque la base est la source de verite durable.
      try {
        fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);
      } catch (diskErr) {
        console.error("Ecriture disque du fichier uploade impossible (non bloquant) :", diskErr.message);
      }
      await prisma.storedFile.create({
        data: {
          name: filename,
          originalName: req.file.originalname,
          mime: req.file.mimetype,
          size: req.file.size,
          data: req.file.buffer,
        },
      });
      res.status(201).json({
        fileUrl: `/uploads/${filename}`,
        fileName: req.file.originalname,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
