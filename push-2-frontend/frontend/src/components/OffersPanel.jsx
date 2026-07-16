import { useEffect, useState } from "react";
import client, { fileUrl } from "../api/client";

// Comparatif d'offres (bid analysis) d'un lot : offres triees par montant, note /10,
// delai, fichier joint. "Retenir" cree la DEMANDE de bon de commande (brouillon) qui
// devra etre approuvee selon le seuil de l'organisation (page Achats).

const STATUS_STYLE = {
  RECUE: "bg-slate-100 text-slate-600",
  RETENUE: "bg-green-100 text-green-800",
  REJETEE: "bg-red-50 text-red-500 line-through",
};
const STATUS_LABEL = { RECUE: "Recue", RETENUE: "Retenue", REJETEE: "Rejetee" };

const emptyForm = { supplierName: "", subcontractorId: "", amount: "", delayWeeks: "", score: "", notes: "" };

export default function OffersPanel({ lot, subcontractors, onClose, onChange }) {
  const [offers, setOffers] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [pendingFile, setPendingFile] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await client.get(`/offers?lotId=${lot.id}`);
    setOffers(data);
  }
  useEffect(() => {
    load();
  }, [lot.id]);

  async function addOffer(e) {
    e.preventDefault();
    setBusy(true);
    try {
      let fileData = {};
      if (pendingFile) {
        const fd = new FormData();
        fd.append("file", pendingFile);
        const { data } = await client.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
        fileData = { fileUrl: data.fileUrl, fileName: data.fileName };
      }
      await client.post("/offers", { lotId: lot.id, ...form, subcontractorId: form.subcontractorId || null, ...fileData });
      setForm(emptyForm);
      setPendingFile(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function retain(offer) {
    if (!confirm(`Retenir l'offre de ${offer.supplierName} (${offer.amount.toLocaleString("fr-FR")} EUR) ?\nCela cree la demande de bon de commande, a faire approuver dans la page Achats.`)) return;
    setBusy(true);
    try {
      const { data } = await client.post(`/offers/${offer.id}/retain`);
      if (data.warnings?.length) alert("Attention :\n" + data.warnings.join("\n"));
      load();
      onChange();
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(offer, status) {
    await client.put(`/offers/${offer.id}`, { status });
    load();
  }
  async function remove(offer) {
    if (!confirm("Supprimer cette offre ?")) return;
    await client.delete(`/offers/${offer.id}`);
    load();
  }

  const best = offers && offers.length ? Math.min(...offers.map((o) => o.amount)) : null;
  const input = "border border-slate-300 rounded-md px-2 py-1.5 text-sm";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4 py-6">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[92vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Comparatif d'offres — {lot.code} {lot.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <p className="text-xs text-slate-500 -mt-2">
          Regle des 3 offres : au-dessus du seuil d'approbation, vise au moins trois offres avant de retenir.
          L'offre retenue cree la demande de BC (a approuver dans la page Achats), puis alimente le generateur de contrats.
        </p>

        {!offers ? (
          <p className="text-sm text-slate-400">Chargement...</p>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="px-3 py-2">Fournisseur</th>
                  <th className="px-3 py-2 text-right">Montant HTVA</th>
                  <th className="px-3 py-2 text-right">Delai</th>
                  <th className="px-3 py-2 text-right">Note</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {offers.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-5 text-center text-slate-400">Aucune offre pour ce lot. Ajoute-les ci-dessous.</td></tr>
                )}
                {offers.map((o) => (
                  <tr key={o.id} className={`border-b border-slate-50 ${o.status === "RETENUE" ? "bg-green-50/50" : ""}`}>
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {o.supplierName}
                        {o.amount === best && offers.length > 1 && <span className="text-[10px] text-green-700 ml-1">moins-disant</span>}
                      </div>
                      {o.notes && <div className="text-xs text-slate-400 max-w-[220px]">{o.notes}</div>}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{o.amount.toLocaleString("fr-FR")} €</td>
                    <td className="px-3 py-2 text-right text-xs">{o.delayWeeks ? `${o.delayWeeks} sem` : "-"}</td>
                    <td className="px-3 py-2 text-right text-xs">{o.score != null ? `${o.score}/10` : "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] rounded-full px-2 py-0.5 ${STATUS_STYLE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {o.fileUrl && (
                        <a href={fileUrl(o.fileUrl)} target="_blank" rel="noreferrer" className="text-brand-600 text-xs underline mr-2">offre</a>
                      )}
                      {o.status === "RECUE" && (
                        <>
                          <button onClick={() => retain(o)} disabled={busy} className="text-xs bg-green-600 text-white rounded px-2 py-0.5 mr-1 disabled:opacity-50">
                            Retenir
                          </button>
                          <button onClick={() => setStatus(o, "REJETEE")} className="text-xs text-slate-400 underline mr-1">rejeter</button>
                        </>
                      )}
                      {o.status === "REJETEE" && (
                        <button onClick={() => setStatus(o, "RECUE")} className="text-xs text-slate-400 underline mr-1">reactiver</button>
                      )}
                      <button onClick={() => remove(o)} className="text-slate-300 hover:text-red-500">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={addOffer} className="bg-slate-50 rounded-md p-3 grid grid-cols-3 gap-2">
          <input required placeholder="Fournisseur" value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} className={input} list="known-subs" />
          <datalist id="known-subs">
            {subcontractors.map((s) => <option key={s.id} value={s.name} />)}
          </datalist>
          <input required type="number" step="0.01" placeholder="Montant HTVA" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={input} />
          <select value={form.subcontractorId} onChange={(e) => setForm({ ...form, subcontractorId: e.target.value })} className={input}>
            <option value="">Lier a l'annuaire (optionnel)</option>
            {subcontractors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="number" step="0.5" placeholder="Delai (semaines)" value={form.delayWeeks} onChange={(e) => setForm({ ...form, delayWeeks: e.target.value })} className={input} />
          <input type="number" step="0.5" min="0" max="10" placeholder="Note /10" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} className={input} />
          <input placeholder="Commentaire" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={input} />
          <input type="file" onChange={(e) => setPendingFile(e.target.files[0])} className="col-span-2 text-xs" />
          <button type="submit" disabled={busy} className="bg-brand-600 text-white text-sm py-1.5 rounded-md disabled:opacity-50">
            + Ajouter l'offre
          </button>
        </form>
      </div>
    </div>
  );
}
