import { useState } from "react";
import client from "../api/client";

// Editeur d'etat d'avancement detaille par postes (inspire du "Suivi EA Sparx" K-0048) :
// - chaque poste a un montant de commande, un % precedent (chaine automatiquement depuis
//   le dernier EA) et un % cumule saisi ;
// - la periode = cumule - precedent, le montant de l'EA = somme des montants de periode ;
// - impossible de se tromper de chainage : le precedent est verrouille des qu'un EA anterieur existe.

const STATEMENT_STATUS_LABELS = {
  DRAFT: "Brouillon",
  SUBMITTED: "Soumis",
  VALIDATED: "Valide",
  INVOICED: "Facture",
};

function emptyLine() {
  return { description: "", total: "", prevPct: 0, cumulPct: 0 };
}

export default function EAEditor({ lot, statements, statement, onClose, onSaved }) {
  const isEdit = Boolean(statement);
  // Dernier EA existant (par numero) qui porte un detail par postes
  const previous = [...statements]
    .filter((s) => Array.isArray(s.lines) && s.lines.length > 0 && (!isEdit || s.number < statement.number))
    .sort((a, b) => b.number - a.number)[0];

  const [number, setNumber] = useState(isEdit ? statement.number : (statements.length ? Math.max(...statements.map((s) => s.number)) + 1 : 1));
  const [period, setPeriod] = useState(isEdit ? statement.period : "");
  const [status, setStatus] = useState(isEdit ? statement.status : "DRAFT");
  const [lines, setLines] = useState(() => {
    if (isEdit && Array.isArray(statement.lines) && statement.lines.length) return statement.lines.map((l) => ({ ...l }));
    if (previous) return previous.lines.map((l) => ({ description: l.description, total: l.total, prevPct: l.cumulPct, cumulPct: l.cumulPct }));
    return [emptyLine()];
  });
  const [saving, setSaving] = useState(false);
  const chained = Boolean(previous) && !isEdit;

  function updateLine(i, field, value) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [field]: value } : l)));
  }

  const num = (v) => Number(v) || 0;
  const periodPct = (l) => num(l.cumulPct) - num(l.prevPct);
  const periodAmount = (l) => (num(l.total) * periodPct(l)) / 100;
  const cumulAmount = (l) => (num(l.total) * num(l.cumulPct)) / 100;
  const totalOrder = lines.reduce((s, l) => s + num(l.total), 0);
  const totalPeriod = lines.reduce((s, l) => s + periodAmount(l), 0);
  const totalCumul = lines.reduce((s, l) => s + cumulAmount(l), 0);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        number: Number(number),
        period,
        status,
        amount: Math.round(totalPeriod * 100) / 100,
        lines: lines
          .filter((l) => l.description || num(l.total))
          .map((l) => ({
            description: l.description,
            total: num(l.total),
            prevPct: num(l.prevPct),
            cumulPct: num(l.cumulPct),
          })),
      };
      if (isEdit) {
        await client.put(`/progress-statements/${statement.id}`, payload);
      } else {
        await client.post("/progress-statements", { ...payload, lotId: lot.id });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString("fr-FR");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4 py-8">
      <form onSubmit={handleSave} className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">
            {isEdit ? `Modifier l'EA${statement.number}` : `Nouvel etat d'avancement — ${lot.code}`}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        {chained && (
          <p className="text-xs bg-blue-50 border border-blue-200 text-blue-800 rounded-md px-3 py-2">
            Postes et % precedents repris automatiquement de l'EA{previous.number} ({previous.period}) — le
            chainage est garanti, saisis uniquement les nouveaux % cumules.
          </p>
        )}

        <div className="grid grid-cols-3 gap-2">
          <input type="number" required value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Numero" className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
          <input required value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Periode (ex: Juillet 2026)" className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
            {Object.entries(STATEMENT_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-md">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
                <th className="px-2 py-2">Poste</th>
                <th className="px-2 py-2 text-right w-28">Commande (EUR)</th>
                <th className="px-2 py-2 text-right w-20">% prec.</th>
                <th className="px-2 py-2 text-right w-20">% cumule</th>
                <th className="px-2 py-2 text-right w-20">% periode</th>
                <th className="px-2 py-2 text-right w-28">Periode (EUR)</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="px-1 py-1">
                    <input value={l.description} onChange={(e) => updateLine(i, "description", e.target.value)} placeholder="Description du poste" className="w-full border border-slate-200 rounded px-2 py-1 text-sm" />
                  </td>
                  <td className="px-1 py-1">
                    <input type="number" step="0.01" value={l.total} onChange={(e) => updateLine(i, "total", e.target.value)} className="w-full border border-slate-200 rounded px-2 py-1 text-sm text-right" readOnly={chained} />
                  </td>
                  <td className="px-1 py-1">
                    <input type="number" step="0.01" value={l.prevPct} onChange={(e) => updateLine(i, "prevPct", e.target.value)} className={`w-full border border-slate-200 rounded px-2 py-1 text-sm text-right ${chained ? "bg-slate-50 text-slate-500" : ""}`} readOnly={chained} title={chained ? "Verrouille : cumule du dernier EA" : ""} />
                  </td>
                  <td className="px-1 py-1">
                    <input type="number" step="0.01" value={l.cumulPct} onChange={(e) => updateLine(i, "cumulPct", e.target.value)} className="w-full border-2 border-brand-200 rounded px-2 py-1 text-sm text-right font-medium" />
                  </td>
                  <td className={`px-2 py-1 text-right ${periodPct(l) < 0 ? "text-red-600" : "text-slate-600"}`}>{fmt(periodPct(l))} %</td>
                  <td className={`px-2 py-1 text-right font-medium ${periodAmount(l) < 0 ? "text-red-600" : ""}`}>{fmt(periodAmount(l))}</td>
                  <td className="px-1 text-center">
                    {!chained && (
                      <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-500">✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 text-sm font-medium">
                <td className="px-2 py-2">Total ({lines.length} poste{lines.length > 1 ? "s" : ""})</td>
                <td className="px-2 py-2 text-right">{fmt(totalOrder)}</td>
                <td></td>
                <td className="px-2 py-2 text-right text-slate-500">{totalOrder ? fmt((totalCumul / totalOrder) * 100) : 0} %</td>
                <td></td>
                <td className="px-2 py-2 text-right text-brand-700">{fmt(totalPeriod)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {!chained && (
          <button type="button" onClick={() => setLines((ls) => [...ls, emptyLine()])} className="text-xs text-brand-600 font-medium">
            + Ajouter un poste
          </button>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Montant de cet EA (somme des periodes) : <span className="font-semibold text-slate-700">{fmt(totalPeriod)} EUR</span>
            {" · "}Cumul realise : {fmt(totalCumul)} EUR
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded-md border border-slate-300">Annuler</button>
            <button type="submit" disabled={saving} className="bg-brand-600 text-white text-sm px-4 py-2 rounded-md disabled:opacity-50">
              {saving ? "Enregistrement..." : "Enregistrer l'EA"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
