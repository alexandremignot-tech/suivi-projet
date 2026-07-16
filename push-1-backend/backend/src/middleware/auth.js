const jwt = require("jsonwebtoken");

// Verifie le JWT et attache req.user = { id, organizationId, role }
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentification requise" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token invalide ou expire" });
  }
}

// Reserve aux admins de l'organisation
function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Reserve aux administrateurs" });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
