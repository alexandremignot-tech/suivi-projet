const express = require("express");
const prisma = require("../../db");
const asyncHandler = require("../../utils/asyncHandler");
const { requireAuth } = require("../../middleware/auth");
const odoo = require("../../utils/odooClient");

const router = express.Router();
router.use(requireAuth);

router.get(
  "/status",
  asyncHandler(async (req, res) => {
    res.json({ configured: odoo.isConfigured() });
  })
);

// Recupere les bons de commande Odoo lies au projet (via son champ odooProjectRef)
router.get(
  "/purchase-orders/:projectId",
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: { id: req.params.projectId, organizationId: req.user.organizationId },
    });
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    if (!odoo.isConfigured()) {
      return res.status(501).json({
        error:
          "Integration Odoo non configuree. Ajoutez ODOO_URL, ODOO_DB, ODOO_USERNAME et ODOO_API_KEY dans les variables d'environnement du backend.",
      });
    }

    try {
      const orders = await odoo.searchPurchaseOrders(project.odooProjectRef || project.name);
      res.json(orders);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  })
);

module.exports = router;
