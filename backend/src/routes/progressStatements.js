const express = require("express");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Verifie que le lot appartient a l'organisation de l'utilisateur (via son projet)
async function assertLotAccess(req, lotId) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId }, include: { project: true } });
  if (!lot) return null;
  if (lot.project.organizationId !== req.user.organizationId) return null;
  return lot;
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { lotId, subcontractorId, number, period, amount, status, fileUrl, fileName, date, notes, lines } = req.body;
    if (!lotId || !period || amount === undefined) {
      return res.status(400).json({ error: "lotId, period et amount sont requis" });
    }

    const lot = await assertLotAccess(req, lotId);
    if (!lot) return res.status(404).json({ error: "Lot introuvable" });

    const count = await prisma.progressStatement.count({ where: { lotId } });

    const statement = await prisma.progressStatement.create({
      data: {
        lotId,
        subcontractorId: subcontractorId || lot.subcontractorId || null,
        number: number ? Number(number) : count + 1,
        period,
        amount: Number(amount),
        status: status || "DRAFT",
        fileUrl,
        fileName,
        date: date ? new Date(date) : new Date(),
        notes,
        lines: lines || undefined,
      },
    });
    res.status(201).json(statement);
  })
);

async function loadWithAccess(req, res) {
  const statement = await prisma.progressStatement.findUnique({ where: { id: req.params.id } });
  if (!statement) {
    res.status(404).json({ error: "Etat d'avancement introuvable" });
    return null;
  }
  const lot = await assertLotAccess(req, statement.lotId);
  if (!lot) {
    res.status(403).json({ error: "Acces refuse" });
    return null;
  }
  return statement;
}

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;

    const { subcontractorId, number, period, amount, status, fileUrl, fileName, date, notes, lines } = req.body;
    const updated = await prisma.progressStatement.update({
      where: { id: req.params.id },
      data: {
        subcontractorId: subcontractorId !== undefined ? subcontractorId || null : undefined,
        number: number !== undefined ? Number(number) : undefined,
        period,
        amount: amount !== undefined ? Number(amount) : undefined,
        status,
        fileUrl,
        fileName,
        date: date ? new Date(date) : undefined,
        notes,
        lines: lines !== undefined ? lines : undefined,
      },
    });
    res.json(updated);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;

    await prisma.progressStatement.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

module.exports = router;
