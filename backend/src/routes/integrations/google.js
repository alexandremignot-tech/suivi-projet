const express = require("express");
const jwt = require("jsonwebtoken");
const { google } = require("googleapis");
const prisma = require("../../db");
const asyncHandler = require("../../utils/asyncHandler");
const { requireAuth } = require("../../middleware/auth");

const router = express.Router();

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

function isConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// Etat de l'integration : configuree cote serveur (identifiants Google Cloud) et connectee cote utilisateur
router.get(
  "/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.json({
      configured: isConfigured(),
      connected: Boolean(user?.googleRefreshToken),
      googleEmail: user?.googleEmail || null,
    });
  })
);

// Genere l'URL de consentement Google (a ouvrir dans un nouvel onglet)
router.get(
  "/auth-url",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isConfigured()) {
      return res.status(501).json({
        error:
          "Integration Google non configuree. Ajoutez GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET et GOOGLE_REDIRECT_URI dans les variables d'environnement du backend.",
      });
    }
    const oauth2Client = getOAuthClient();
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: SCOPES,
      // On transmet le token JWT de l'utilisateur dans le state pour le retrouver au callback
      state: req.headers.authorization?.slice(7) || "",
    });
    res.json({ url });
  })
);

// Callback appele par Google apres consentement (navigation directe du navigateur, sans header Authorization).
// L'identite de l'utilisateur est recuperee depuis le parametre "state" qui contient son JWT.
router.get(
  "/callback",
  asyncHandler(async (req, res) => {
    if (!isConfigured()) return res.status(501).send("Integration Google non configuree.");

    const { code, state } = req.query;
    let userId;
    try {
      const payload = jwt.verify(state, process.env.JWT_SECRET);
      userId = payload.id;
    } catch {
      return res.status(401).send("Session invalide, veuillez relancer la connexion Google depuis l'application.");
    }

    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    await prisma.user.update({
      where: { id: userId },
      data: { googleRefreshToken: tokens.refresh_token, googleEmail: profile.email },
    });

    res.send(
      "<html><body style='font-family:sans-serif;padding:2rem'>Connexion Google reussie. Vous pouvez fermer cet onglet et retourner sur l'application.</body></html>"
    );
  })
);

router.post(
  "/disconnect",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.user.update({ where: { id: req.user.id }, data: { googleRefreshToken: null, googleEmail: null } });
    res.status(204).end();
  })
);

async function getAuthorizedClient(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.googleRefreshToken) return null;
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
  return oauth2Client;
}

// Synchronise les jalons et echeances de taches du projet vers un calendrier Google dedie
router.post(
  "/sync/:projectId",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isConfigured()) {
      return res.status(501).json({ error: "Integration Google non configuree cote serveur." });
    }

    const project = await prisma.project.findFirst({
      where: { id: req.params.projectId, organizationId: req.user.organizationId },
      include: { milestones: true, tasks: true },
    });
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const auth = await getAuthorizedClient(req.user.id);
    if (!auth) return res.status(400).json({ error: "Connectez d'abord votre compte Google." });

    const calendar = google.calendar({ version: "v3", auth });

    let calendarId = project.googleCalendarId;
    if (!calendarId) {
      const { data } = await calendar.calendars.insert({
        requestBody: { summary: `Suivi de projet - ${project.name}` },
      });
      calendarId = data.id;
      await prisma.project.update({ where: { id: project.id }, data: { googleCalendarId: calendarId } });
    }

    let created = 0;
    for (const m of project.milestones) {
      const dateStr = new Date(m.date).toISOString().slice(0, 10);
      await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: `Jalon : ${m.name}`,
          start: { date: dateStr },
          end: { date: dateStr },
        },
      });
      created += 1;
    }

    for (const t of project.tasks.filter((t) => t.dueDate)) {
      const dateStr = new Date(t.dueDate).toISOString().slice(0, 10);
      await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: `Echeance tache : ${t.title}`,
          description: t.description || undefined,
          start: { date: dateStr },
          end: { date: dateStr },
        },
      });
      created += 1;
    }

    res.json({ calendarId, eventsCreated: created });
  })
);

module.exports = router;
