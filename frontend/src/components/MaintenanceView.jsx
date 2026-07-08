import { useState } from "react";
import client from "../api/client";

// Plan de maintenance : prochain entretien calcule (dernier + intervalle), retards en rouge,
// bouton "entretien fait" qui date + journalise, historique depliable par equipement.

const DAY_MS = 24 * 60 * 60 * 1000;

function nextMaintenance(eq) {
  if (!eq.maintenanceIntervalDays) return null;
  const base = eq.lastMaintenanceDate ? new Date(eq.lastMaintenanceDate) : null;
  if (!base) return "JAMAIS";
  return new Date(base.getTime() + eq.maintenanceIntervalDays * DAY_MS);
}

export default function MaintenanceView({ project, onChange }) {
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState(null);
  const lots = project.lots || [];
  const lotById = Object.fromEntries(lots.map((l) => [l.id, l]));
  const today = new Date();

  const tracked = (project.equipments || [])
    .filter((e) => e.maintenanceIntervalDays)
    .map((e) => {
      const next = nextMaintenance(e);
      const overdue = next === "JAMAIS" || (next && next < today);
      const daysLeft = next && next !== "JAMAIS" ? Math.ceil((next - today) / DAY_MS) : null;
      return { e, next, overdue, daysLeft };
    })
    .sort((a, b) => {
      const ka = a.next === "JAMAIS" ? -Infinity : a.next?.getTime() ?? Infinity;
      const kb = b.next === "JAMAIS" ? -Infinity : b.next?.getTime() ?? Infinity;
      return ka - kb;
    });
  const untracked = (project.equipments || []).filter((e) => !e.maintenanceIntervalDays);
  const overdueCount = tracked.filter((x) => x.overdue).length;

  async function markDone(eq) {
    const notes = prompt(`Entretien realise sur « ${eq.name} » — remarques (optionnel) :`, "");
    if (notes === null) return;
    setBusy(eq.id);
    try {
      await client.post(`/equipments/${eq.id}/maintenance`, { notes });
      onChange();
    } finally {
      setBusy(null);
    }
  }

  const fmt = (d) => new Date(d).toLocaleDateString("fr-FR");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Equipements suivis" value={tracked.length} />
        <Metric label="Entretiens en retard" value={overdueCount} danger={overdueCount > 0} />
        <Metric label="Sans plan de maintenance" value={untracked.length} />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
              <th className="px-4 py-2">Equipement</th>
              <th className="px-4 py-2">Lot</th>
              <th className="px-4 py-2">Intervalle</th>
              <th className="px-4 py-2">Dernier entretien</th>
              <th className="px-4 py-2">Prochain</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tracked.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Aucun equipement avec un intervalle de maintenance. Renseigne « Intervalle d'entretien (jours) »
                  sur les fiches de l'inventaire.
                </td>
              </tr>
            )}
            {tracked.map(({ e, next, overdue, daysLeft }) => (
              <>
                <tr key={e.id} className={`border-b border-slate-50 ${overdue ? "bg-red-50/50" : ""}`}>
                  <td className="px-4 py-2">
                    <div className="font-medium">
                      {e.name}
                      {e.quantity > 1 ? ` (x${e.quantity})` : ""}
                    </div>
                    <div className="text-xs text-slate-400">
                      {[e.manufacturer, e.location].filter(Boolean).join(" · ")}
                      {(e.maintenanceRecords || []).length > 0 && (
                        <button onClick={() => setExpanded(expanded === e.id ? null : e.id)} className="text-brand-600 underline ml-2">
                          {expanded === e.id ? "masquer" : `${e.maintenanceRecords.length} entretien(s)`}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{e.lotId && lotById[e.lotId] ? lotById[e.lotId].code : "-"}</td>
                  <td className="px-4 py-2 text-xs">{e.maintenanceIntervalDays} j</td>
                  <td className="px-4 py-2 text-xs">{e.lastMaintenanceDate ? fmt(e.lastMaintenanceDate) : <span className="text-red-600">jamais</span>}</td>
                  <td className={`px-4 py-2 text-xs ${overdue ? "text-red-600 font-semibold" : daysLeft !== null && daysLeft < 30 ? "text-amber-700 font-medium" : "text-slate-600"}`}>
                    {next === "JAMAIS" ? "a planifier !" : `${fmt(next)} (${daysLeft >= 0 ? `dans ${daysLeft} j` : `retard de ${-daysLeft} j`})`}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => markDone(e)}
                      disabled={busy === e.id}
                      className="text-xs bg-green-50 border border-green-200 text-green-700 rounded-md px-2 py-1 hover:bg-green-100 disabled:opacity-50"
                    >
                      {busy === e.id ? "..." : "✓ Entretien fait"}
                    </button>
                  </td>
                </tr>
                {expanded === e.id && (
                  <tr key={e.id + "-hist"}>
                    <td colSpan={6} className="px-6 pb-2">
                      <div className="border border-slate-100 rounded-md divide-y divide-slate-50 text-xs">
                        {(e.maintenanceRecords || []).map((r) => (
                          <div key={r.id} className="px-3 py-1.5 flex items-center justify-between gap-2">
                            <span>
                              {fmt(r.date)}
                              {r.userName ? ` — ${r.userName}` : ""}
                              {r.notes ? ` : ${r.notes}` : ""}
                            </span>
                            <button
                              onClick={async () => {
                                if (!confirm("Supprimer cet entretien de l'historique ?")) return;
                                await client.delete(`/equipments/maintenance/${r.id}`);
                                onChange();
                              }}
                              className="text-slate-300 hover:text-red-500 flex-shrink-0"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {untracked.length > 0 && (
        <p className="text-xs text-slate-400">
          Sans plan de maintenance : {untracked.map((e) => e.name).slice(0, 8).join(", ")}
          {untracked.length > 8 ? `... (+${untracked.length - 8})` : ""} — ajoute un intervalle sur leur fiche pour les suivre ici.
        </p>
      )}
    </div>
  );
}

function Metric({ label, value, danger }) {
  return (
    <div className="bg-slate-100 rounded-md p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-medium ${danger ? "text-red-600" : ""}`}>{value}</div>
    </div>
  );
}
