import { useState } from "react";
import { fileUrl } from "../api/client";

// Proposition B : pilotage financier par cartes de lots.
// Une carte par BB : barre empilee paye / facture / engage, badges avenants-risques,
// alerte quand la facturation s'ecarte de l'avancement physique (EA).
// Clic sur une carte -> panneau lateral avec le registre du lot.

const ENTRY_TYPE_LABELS = {
  PURCHASE_ORDER: "Commande",
  AMENDMENT: "Avenant",
  RISK: "Risque",
  INVOICE: "Facture",
  CONTRACT: "Contrat",
  SUBSIDY: "Subside",
  OTHER: "Autre",
};
const STATUS_LABELS = { DRAFT: "Brouillon", ENGAGED: "Engage", SUBMITTED: "Soumis", VALIDATED: "Valide", PAID: "Paye" };

const fmtK = (n) => {
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M€`;
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`;
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
};
const fmt = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const pct = (num, den) => (den > 0 ? (num / den) * 100 : null);

export default function LotFinanceCards({ project, subcontractors }) {
  const [openLot, setOpenLot] = useState(null); // lot ouvert dans le panneau lateral
  const items = project.budgetItems || [];
  const lots = [...(project.lots || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const subById = Object.fromEntries((subcontractors || []).map((s) => [s.id, s]));

  function lotStats(lotId) {
    const lotItems = items.filter((i) => i.type === "expense" && (i.lotId || null) === lotId);
    const sum = (f) => lotItems.filter(f).reduce((s, i) => s + i.amount, 0);
    const orders = sum((i) => i.entryType === "PURCHASE_ORDER");
    const amendments = sum((i) => i.entryType === "AMENDMENT");
    const risks = sum((i) => i.entryType === "RISK");
    const invoiced = sum((i) => i.entryType === "INVOICE");
    const paid = sum((i) => i.entryType === "INVOICE" && i.status === "PAID");
    const engaged = orders + amendments;
    return { lotItems, orders, amendments, risks, invoiced, paid, engaged };
  }

  const cards = lots.map((lot) => {
    const s = lotStats(lot.id);
    const eaTotal = (lot.progressStatements || []).reduce((t, st) => t + (st.amount || 0), 0);
    const base = lot.contractAmount || s.engaged;
    const eaPct = pct(eaTotal, base);
    const invPct = pct(s.invoiced, s.engaged);
    const paidPct = pct(s.paid, s.engaged);
    const gap = eaPct !== null && invPct !== null && (eaTotal > 0 || s.invoiced > 0) ? invPct - eaPct : null;
    const alert = gap !== null && Math.abs(gap) > 15;
    return { lot, ...s, eaTotal, eaPct, invPct, paidPct, gap, alert };
  });
  const noLotItems = items.filter((i) => i.type === "expense" && !i.lotId);

  const totalEngaged = cards.reduce((t, c) => t + c.engaged, 0);

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        {cards.map((c) => {
          const paidW = Math.min(100, c.paidPct || 0);
          const invW = Math.max(0, Math.min(100, c.invPct || 0) - paidW);
          return (
            <button
              key={c.lot.id}
              onClick={() => setOpenLot(c)}
              className={`text-left bg-white border rounded-lg p-4 hover:shadow-md transition ${c.alert ? "border-red-300" : "border-slate-200"}`}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <span className="font-semibold">{c.lot.code}</span>
                  <span className="text-sm text-slate-500 truncate"> · {c.lot.name}</span>
                </div>
                <span className="text-sm font-semibold text-slate-700 flex-shrink-0">{fmtK(c.engaged)}</span>
              </div>
              {c.lot.subcontractor && <div className="text-xs text-slate-400 mb-2">{c.lot.subcontractor.name}</div>}

              <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex" title={`Paye ${Math.round(c.paidPct || 0)} % · Facture ${Math.round(c.invPct || 0)} % de l'engage`}>
                <div className="bg-green-600 h-full" style={{ width: `${paidW}%` }} />
                <div className="bg-green-300 h-full" style={{ width: `${invW}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                <span>
                  paye <span className="font-medium text-green-700">{c.paidPct === null ? "–" : `${Math.round(c.paidPct)} %`}</span>
                </span>
                <span>
                  facture <span className="font-medium">{c.invPct === null ? "–" : `${Math.round(c.invPct)} %`}</span>
                </span>
                <span>
                  EA <span className="font-medium text-brand-700">{c.eaPct === null || c.eaTotal === 0 ? "–" : `${Math.round(c.eaPct)} %`}</span>
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-2">
                {c.amendments > 0 && (
                  <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-2 py-0.5">
                    avenants {fmtK(c.amendments)}
                  </span>
                )}
                {c.risks > 0 && (
                  <span className="text-[10px] bg-red-50 border border-red-200 text-red-700 rounded-full px-2 py-0.5">
                    risques {fmtK(c.risks)}
                  </span>
                )}
                {c.alert && (
                  <span className="text-[10px] bg-red-100 text-red-700 rounded-full px-2 py-0.5 font-medium">
                    {c.gap > 0 ? `facturé ${Math.round(c.gap)} pts > EA` : `réalisé ${Math.round(-c.gap)} pts non facturé`}
                  </span>
                )}
                {c.engaged === 0 && <span className="text-[10px] text-slate-400">aucune commande</span>}
              </div>
            </button>
          );
        })}
      </div>

      {noLotItems.length > 0 && (
        <p className="text-xs text-slate-400">
          {noLotItems.length} ligne(s) de depense sans lot ({fmtK(noLotItems.reduce((s, i) => s + i.amount, 0))}) — visibles dans l'onglet Registre.
        </p>
      )}
      <p className="text-xs text-slate-400">
        Total engage (commandes + avenants) : <span className="font-medium text-slate-600">{fmt(totalEngaged)}</span> · barre = paye (fonce) puis facture (clair) sur l'engage · EA = avancement physique declare.
      </p>

      {/* Panneau lateral : detail du lot */}
      {openLot && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setOpenLot(null)}>
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">
                  {openLot.lot.code} — {openLot.lot.name}
                </h3>
                {openLot.lot.subcontractor && <p className="text-xs text-slate-400">{openLot.lot.subcontractor.name}</p>}
              </div>
              <button onClick={() => setOpenLot(null)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                ["Engage", openLot.engaged, ""],
                ["Facture", openLot.invoiced, ""],
                ["Paye", openLot.paid, "text-green-700"],
                ["EA cumules", openLot.eaTotal, "text-brand-700"],
              ].map(([label, value, cls]) => (
                <div key={label} className="bg-slate-50 rounded-md p-2">
                  <div className="text-[10px] text-slate-400">{label}</div>
                  <div className={`text-sm font-semibold ${cls}`}>{fmtK(value)}</div>
                </div>
              ))}
            </div>

            {["PURCHASE_ORDER", "AMENDMENT", "RISK", "INVOICE", "OTHER"].map((type) => {
              const rows = openLot.lotItems.filter((i) => i.entryType === type);
              if (!rows.length) return null;
              return (
                <div key={type}>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                    {ENTRY_TYPE_LABELS[type]}s ({rows.length})
                  </h4>
                  <div className="border border-slate-200 rounded-md divide-y divide-slate-50">
                    {rows.map((i) => (
                      <div key={i.id} className="px-3 py-1.5 text-sm flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate">{i.label}</div>
                          <div className="text-[10px] text-slate-400">
                            {STATUS_LABELS[i.status]}
                            {i.invoiceNumber ? ` · N° ${i.invoiceNumber}` : ""}
                            {i.subcontractorId && subById[i.subcontractorId] ? ` · ${subById[i.subcontractorId].name}` : ""}
                            {i.date ? ` · ${new Date(i.date).toLocaleDateString("fr-FR")}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {i.fileUrl && (
                            <a href={fileUrl(i.fileUrl)} target="_blank" rel="noreferrer" className="text-brand-600 text-xs underline">
                              fichier
                            </a>
                          )}
                          <span className={`font-medium ${i.status === "PAID" ? "text-green-700" : ""}`}>{fmt(i.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {(openLot.lot.progressStatements || []).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Etats d'avancement</h4>
                <div className="border border-slate-200 rounded-md divide-y divide-slate-50">
                  {[...openLot.lot.progressStatements]
                    .sort((a, b) => a.number - b.number)
                    .map((s) => (
                      <div key={s.id} className="px-3 py-1.5 text-sm flex justify-between">
                        <span>
                          EA{s.number} <span className="text-xs text-slate-400">{s.period}</span>
                        </span>
                        <span className="font-medium">{fmt(s.amount)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
            <p className="text-[11px] text-slate-400">
              Edition des lignes : onglet Registre. Edition des EA : Vue Lots → {openLot.lot.code}.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
