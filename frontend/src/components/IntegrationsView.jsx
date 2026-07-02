import { useEffect, useState } from "react";
import client from "../api/client";

export default function IntegrationsView({ project, onChange }) {
  const [googleStatus, setGoogleStatus] = useState(null);
  const [odooStatus, setOdooStatus] = useState(null);
  const [purchaseOrders, setPurchaseOrders] = useState(null);
  const [odooError, setOdooError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState("");
  const [odooRef, setOdooRef] = useState(project.odooProjectRef || "");

  useEffect(() => {
    client.get("/integrations/google/status").then(({ data }) => setGoogleStatus(data));
    client.get("/integrations/odoo/status").then(({ data }) => setOdooStatus(data));
  }, []);

  async function handleConnectGoogle() {
    const { data } = await client.get("/integrations/google/auth-url");
    window.open(data.url, "_blank", "noopener,noreferrer,width=500,height=650");
  }

  async function handleSyncGoogle() {
    setSyncing(true);
    setSyncResult("");
    try {
      const { data } = await client.post(`/integrations/google/sync/${project.id}`);
      setSyncResult(`${data.eventsCreated} evenement(s) synchronise(s) vers Google Calendar.`);
    } catch (err) {
      setSyncResult(err.response?.data?.error || "Erreur de synchronisation");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnectGoogle() {
    await client.post("/integrations/google/disconnect");
    const { data } = await client.get("/integrations/google/status");
    setGoogleStatus(data);
  }

  async function handleSaveOdooRef(e) {
    e.preventDefault();
    await client.put(`/projects/${project.id}`, { odooProjectRef: odooRef });
    onChange();
  }

  async function handleLoadPurchaseOrders() {
    setOdooError("");
    setPurchaseOrders(null);
    try {
      const { data } = await client.get(`/integrations/odoo/purchase-orders/${project.id}`);
      setPurchaseOrders(data);
    } catch (err) {
      setOdooError(err.response?.data?.error || "Erreur de connexion a Odoo");
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
        <h3 className="font-medium">Google Calendar</h3>

        {!googleStatus ? (
          <p className="text-sm text-slate-400">Chargement...</p>
        ) : !googleStatus.configured ? (
          <p className="text-sm text-orange-600">
            Non configure cote serveur. Ajoutez GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET et GOOGLE_REDIRECT_URI dans les
            variables d'environnement du backend (voir README) pour activer cette integration.
          </p>
        ) : googleStatus.connected ? (
          <div className="space-y-2">
            <p className="text-sm text-green-700">Connecte en tant que {googleStatus.googleEmail}</p>
            <div className="flex gap-2">
              <button
                onClick={handleSyncGoogle}
                disabled={syncing}
                className="bg-brand-600 text-white text-sm px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                {syncing ? "Synchronisation..." : "Synchroniser ce projet"}
              </button>
              <button onClick={handleDisconnectGoogle} className="text-sm text-slate-500 underline">
                Deconnecter
              </button>
            </div>
            {syncResult && <p className="text-xs text-slate-500">{syncResult}</p>}
            <p className="text-xs text-slate-400">
              Cree un calendrier dedie au projet et y ajoute les jalons et les echeances de taches. Relancer la
              synchronisation ajoute les nouveaux elements (pas de suppression automatique des evenements passes).
            </p>
          </div>
        ) : (
          <button onClick={handleConnectGoogle} className="bg-brand-600 text-white text-sm px-3 py-1.5 rounded-md">
            Connecter mon compte Google
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
        <h3 className="font-medium">Achats Odoo</h3>

        {!odooStatus ? (
          <p className="text-sm text-slate-400">Chargement...</p>
        ) : !odooStatus.configured ? (
          <p className="text-sm text-orange-600">
            Non configure cote serveur. Ajoutez ODOO_URL, ODOO_DB, ODOO_USERNAME et ODOO_API_KEY dans les variables
            d'environnement du backend (voir README) pour activer cette integration.
          </p>
        ) : (
          <>
            <form onSubmit={handleSaveOdooRef} className="flex gap-2">
              <input
                value={odooRef}
                onChange={(e) => setOdooRef(e.target.value)}
                placeholder="Reference / nom du projet cote Odoo"
                className="flex-1 border border-slate-300 rounded-md px-3 py-1.5 text-sm"
              />
              <button type="submit" className="text-sm px-3 py-1.5 rounded-md border border-slate-300">
                Enregistrer
              </button>
            </form>
            <button onClick={handleLoadPurchaseOrders} className="bg-brand-600 text-white text-sm px-3 py-1.5 rounded-md">
              Charger les bons de commande
            </button>

            {odooError && <p className="text-sm text-red-600">{odooError}</p>}

            {purchaseOrders && (
              <div className="divide-y divide-slate-100 text-sm">
                {purchaseOrders.length === 0 && <p className="text-slate-500 py-2">Aucun bon de commande trouve.</p>}
                {purchaseOrders.map((po) => (
                  <div key={po.id} className="py-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{po.name}</div>
                      <div className="text-xs text-slate-400">{po.date_order}</div>
                    </div>
                    <div className="text-right">
                      <div>{po.amount_total?.toLocaleString("fr-FR")} EUR</div>
                      <div className="text-xs text-slate-400">{po.state}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
