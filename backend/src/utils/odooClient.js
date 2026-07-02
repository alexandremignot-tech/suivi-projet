// Client minimal pour l'API JSON-RPC d'Odoo (external API).
// Doc Odoo : https://www.odoo.com/documentation/latest/developer/reference/external_api.html
// Necessite les variables d'environnement : ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY

function isConfigured() {
  return Boolean(process.env.ODOO_URL && process.env.ODOO_DB && process.env.ODOO_USERNAME && process.env.ODOO_API_KEY);
}

async function jsonRpc(url, service, method, args) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Date.now(),
    }),
  });
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.data?.message || data.error.message || "Erreur Odoo");
  }
  return data.result;
}

async function authenticate() {
  const url = `${process.env.ODOO_URL.replace(/\/$/, "")}/jsonrpc`;
  const uid = await jsonRpc(url, "common", "login", [
    process.env.ODOO_DB,
    process.env.ODOO_USERNAME,
    process.env.ODOO_API_KEY,
  ]);
  if (!uid) throw new Error("Authentification Odoo refusee (verifiez ODOO_USERNAME / ODOO_API_KEY / ODOO_DB)");
  return uid;
}

// Recherche les bons de commande (purchase.order) dont le nom ou la reference client contient le texte fourni
async function searchPurchaseOrders(searchText) {
  if (!isConfigured()) {
    throw new Error(
      "Integration Odoo non configuree. Ajoutez ODOO_URL, ODOO_DB, ODOO_USERNAME et ODOO_API_KEY dans les variables d'environnement du backend."
    );
  }
  const url = `${process.env.ODOO_URL.replace(/\/$/, "")}/jsonrpc`;
  const uid = await authenticate();

  const domain = searchText
    ? ["|", ["name", "ilike", searchText], ["partner_ref", "ilike", searchText]]
    : [];

  const orders = await jsonRpc(url, "object", "execute_kw", [
    process.env.ODOO_DB,
    uid,
    process.env.ODOO_API_KEY,
    "purchase.order",
    "search_read",
    [domain],
    { fields: ["name", "partner_id", "date_order", "amount_total", "state"], limit: 50 },
  ]);

  return orders;
}

module.exports = { isConfigured, searchPurchaseOrders };
