const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, organizationId: user.organizationId, role: user.role, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Cree une nouvelle organisation + le premier utilisateur (admin)
router.post(
  "/register-organization",
  asyncHandler(async (req, res) => {
    const { organizationName, name, email, password } = req.body;

    if (!organizationName || !name || !email || !password) {
      return res.status(400).json({ error: "Tous les champs sont requis" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caracteres" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Un compte existe deja avec cet email" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const organization = await prisma.organization.create({
      data: {
        name: organizationName,
        users: {
          create: {
            name,
            email,
            passwordHash,
            role: "ADMIN",
          },
        },
      },
      include: { users: true },
    });

    const user = organization.users[0];
    const token = signToken(user);

    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      organization: { id: organization.id, name: organization.name },
    });
  })
);

// Rejoindre une organisation existante via son identifiant (invitation simple)
router.post(
  "/join-organization",
  asyncHandler(async (req, res) => {
    const { organizationId, name, email, password } = req.body;

    if (!organizationId || !name || !email || !password) {
      return res.status(400).json({ error: "Tous les champs sont requis" });
    }

    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      return res.status(404).json({ error: "Organisation introuvable" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Un compte existe deja avec cet email" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, organizationId, role: "MEMBER" },
    });

    const token = signToken(user);
    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      organization: { id: organization.id, name: organization.name },
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email }, include: { organization: true } });

    if (!user) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Identifiants invalides" });
    }

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      organization: { id: user.organization.id, name: user.organization.name },
    });
  })
);

// Connexion automatique sans identifiants (pas d'ecran de mot de passe pour entrer sur le site).
// Actif par defaut. Pour reintroduire un mot de passe (ex. avant une mise en ligne grand public),
// positionner AUTO_LOGIN=false : sans cela, n'importe qui connaissant l'URL a un acces complet.
router.get(
  "/dev-session",
  asyncHandler(async (req, res) => {
    if (process.env.AUTO_LOGIN === "false") {
      return res.status(404).json({ error: "Connexion automatique desactivee (AUTO_LOGIN)" });
    }

    let user = await prisma.user.findFirst({
      orderBy: { createdAt: "asc" },
      include: { organization: true },
    });

    if (!user) {
      const organization = await prisma.organization.create({
        data: {
          name: "Mon organisation",
          users: {
            create: {
              name: "Utilisateur",
              email: "admin@local.app",
              passwordHash: await bcrypt.hash("changeme123", 10),
              role: "ADMIN",
            },
          },
        },
        include: { users: true },
      });
      user = { ...organization.users[0], organization };
    }

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      organization: { id: user.organization.id, name: user.organization.name },
    });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { organization: true },
    });
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      organization: { id: user.organization.id, name: user.organization.name },
    });
  })
);

module.exports = router;
