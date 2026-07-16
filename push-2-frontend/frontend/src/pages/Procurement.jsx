import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client, { fileUrl } from "../api/client";

// Page Achats : les demandes de bons de commande en attente d'approbation, tous projets
// confondus, avec le seuil de delegation configurable (admins). Au-dessus du seuil, seul
// un ADMIN peut approuver — le serveur le verifie aussi.

export default function Procurement() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [threshold, setThreshold] = useState("");

  async function load() {
    const { data } = await client.get("/budget-items/pending");
    setData(data);
    setThreshold(String(data.approvalThreshold));
  }
  useEffect(() => {
    load();
  }, []);

  async function approve(item) {
    if (!confirm(`Approuver et engager « ${item.label} » (${item.amount.toLocaleString("fr-FR")} EUR) ?`)) return;
    setBusy(item.id);
    try {
      await client.post(`/budget-items/${item.id}/approve`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setBusy(null);
    }
  }

  async function reject(item) {
    const reason = prompt(`Motif du rejet de « ${item.label} » (la ligne reste en brouillon, annotee) :`, "");
    if (reason === null) return;
    setBusy(item.id);
    try {
      await client.post(`/budget-items/${item.id}/reject`, { reason });
      load();
    } finally {
      setBusy(null);
    }
  }

  async function saveThreshold() {
    await client.put("/organizations", { approvalThreshold: Number(threshold) });
    load();
  }

  if (!data) return <div className="p-8 text-center text-slate-500">Chargement...</div>;

  const over = data.items.filter((i) => i.amount > data.approvalThreshold);
  const under = data.items.filter((i) => i.amount <= data.approvalThreshold);

  const Row = ({ item }) => (
    <div className="px-4 py-2 flex items-center gap-3 text-sm">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{item.label}</div>
        <div className="text-xs text-slate-400">
          <Link to={`/projects/${item.project.id}`} className="hover:underline">{item.project.name}</Link>
          {item.lot ? ` · ${item.lot.code}` : ""}
          {item.subcontractor ? ` · ${item.subcontractor.name}` : ""}
          {item.requestedByName ? ` · demande par ${item.requestedByName}` : ""}
          {item.category?.includes("REJETE") ? <span className="text-red-500"> · {item.category.split("|").pop()}</span> : ""}
        </div>
      </div>
      {item.fileUrl && (
        <a href={fileUrl(item.fileUrl)} target="_blank" rel="noreferrer" className="text-brand-600 text-xs underline flex-shrink-0">offre</a>
      )}
      <span className="font-semibold flex-shrink-0">{item.amount.toLocaleString("fr-FR")} €</span>
      <div className="flex gap-1 flex-shrink-0">
        <button
          onClick={() => approve(item)}
          disabled={busy === item.id || (item.amount > data.approvalThreshold && !data.isAdmin)}
          title={item.amount > data.approvalThreshold && !data.isAdmin ? "Reserve aux administrateurs (au-dessus du seuil)" : ""}
          className="text-xs bg-green-600 text-white rounded px-2 py-1 disabled:opacity-40"
        >
          Approuver
        </button>
        <button onClick={() => reject(item)} disabled={busy === item.id} className="text-xs border border-slate-300 rounded px-2 py-1 text-slate-500">
          Rejeter
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Achats — approbations</h1>
          <p className="text-sm text-slate-500">
            Demandes de bons de commande en attente. Au-dessus du seuil, l'approbation est reservee aux
            administrateurs (verifie aussi cote serveur).
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Seuil :</span>
          <input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            disabled={!data.isAdmin}
            className="border border-slate-300 rounded-md px-2 py-1.5 w-28 text-right disabled:bg-slate-50"
          />
          <span className="text-slate-500">€</span>
          {data.isAdmin && Number(threshold) !== data.approvalThreshold && (
            <button onClick={saveThreshold} className="bg-brand-600 text-white text-xs px-3 py-1.5 rounded-md">OK</button>
          )}
        </div>
      </div>

      <div className="bg-white border border-red-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-sm font-medium text-red-800">
          Au-dessus du seuil — approbation administrateur ({over.length})
        </div>
        <div className="divide-y divide-slate-50">
          {over.length === 0 && <p className="px-4 py-4 text-sm text-slate-400">Rien en attente.</p>}
          {over.map((i) => <Row key={i.id} item={i} />)}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-sm font-medium">
          Sous le seuil — approbation libre ({under.length})
        </div>
        <div className="divide-y divide-slate-50">
          {under.length === 0 && <p className="px-4 py-4 text-sm text-slate-400">Rien en attente.</p>}
          {under.map((i) => <Row key={i.id} item={i} />)}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Une demande naît d'une offre retenue dans un comparatif (fiche du lot → « Comparatif d'offres ») ou d'une
        ligne créée en brouillon dans le registre. Approuver = engager la commande dans le suivi financier ;
        chaque approbation est tracée (qui, quand) et visible dans l'Historique.
      </p>
    </div>
  );
}
