const express = require("express");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Journal des modifications de l'organisation (filtrable par projet)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId, limit } = req.query;
    const take = Math.min(Number(limit) || 150, 500);
    const logs = await prisma.auditLog.findMany({
      where: {
        organizationId: req.user.organizationId,
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });
    res.json(logs);
  })
);

module.exports = router;
