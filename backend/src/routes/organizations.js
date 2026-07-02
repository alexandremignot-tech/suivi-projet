const express = require("express");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Liste des membres de mon organisation (pour assigner des taches)
router.get(
  "/members",
  asyncHandler(async (req, res) => {
    const members = await prisma.user.findMany({
      where: { organizationId: req.user.organizationId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { name: "asc" },
    });
    res.json(members);
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const org = await prisma.organization.findUnique({ where: { id: req.user.organizationId } });
    res.json(org);
  })
);

router.put(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name } = req.body;
    const org = await prisma.organization.update({
      where: { id: req.user.organizationId },
      data: { name },
    });
    res.json(org);
  })
);

module.exports = router;
