import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const PHASE_LABELS = {
  RFP_RFQ: "RFP/RFQ",
  BID_ANALYSIS: "Analyse",
  CONTRACT: "Contrat",
  FOLLOW_UP: "Suivi",
  RECEPTION_DIU: "Reception",
  DONE: "Termine",
};
const PHASE_COLORS = {
  RFP_RFQ: "#94a3b8",
  BID_ANALYSIS: "#60a5fa",
  CONTRACT: "#818cf8",
  FOLLOW_UP: "#f59e0b",
  RECEPTION_DIU: "#34d399",
  DONE: "#22c55e",
};

const DOC_STATUS_LABELS = {
  MISSING: "Manquant",
  RECEIVED: "Recu",
  VALIDATED: "Valide",
  REJECTED: "Rejete",
};
const DOC_STATUS_COLORS = {
  MISSING: "bg-red-100 text-red-700",
  RECEIVED: "bg-blue-100 text-blue-700",
  VALIDATED: "bg-green-100 text-green-700",
  REJECTED: "bg-orange-100 text-orange-700",
};

function isDocOverdue(doc) {
  return doc.status === "MISSING" && doc.deadline && new Date(doc.deadline) < new Date();
}

function computeNextMaintenance(eq) {
  if (!eq.maintenanceIntervalDays) return null;
  const base = eq.lastMaintenanceDate ? new Date(eq.lastMaintenanceDate) : new Date(eq.createdAt);
  return new Date(base.getTime() + eq.maintenanceIntervalDays * 24 * 60 * 60 * 1000);
}

export default function OverviewView({ project }) {
  const lots = project.lots || [];
  const documents = project.documents || [];
  const equipments = project.equipments || [];
  const budgetItems = project.budgetItems || [];

  const lotsByPhase = Object.keys(PHASE_LABELS).map((phase) => ({
    phase,
    label: PHASE_LABELS[phase],
    count: lots.filter((l) => l.phase === phase).length,
  }));

  const totalSpent = budgetItems.filter((b) => b.type === "expense").reduce((s, b) => s + b.amount, 0);
  const totalIncome = budgetItems.filter((b) => b.type === "income").reduce((s, b) => s + b.amount, 0);
  const budgetPct = project.budgetTotal > 0 ? Math.round((totalSpent / project.budgetTotal) * 100) : 0;

  const docCounts = Object.keys(DOC_STATUS_LABELS).map((status) => ({
    status,
    label: DOC_STATUS_LABELS[status],
    count: documents.filter((d) => d.status === status).length,
  }));
  const overdueDocs = documents.filter(isDocOverdue).length;

  const maintenanceDue = equipments.filter((eq) => {
    const next = computeNextMaintenance(eq);
    return next && next < new Date();
  }).length;

  const contractedTotal = lots.reduce((s, l) => s + (l.contractAmount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Lots" value={lots.length} sub={`${lots.filter((l) => l.phase === "DONE").length} termine(s)`} />
        <StatCard
          label="Budget consomme"
          value={`${budgetPct}%`}
          sub={`${totalSpent.toLocaleString("fr-FR")} / ${project.budgetTotal.toLocaleString("fr-FR")} EUR`}
          warn={budgetPct > 100}
        />
        <StatCard
          label="Documents manquants"
          value={documents.filter((d) => d.status === "MISSING").length}
          sub={overdueDocs > 0 ? `${overdueDocs} en retard` : "aucun retard"}
          warn={overdueDocs > 0}
        />
        <StatCard
          label="Maintenance due"
          value={maintenanceDue}
          sub={`${equipments.length} equipement(s) suivi(s)`}
          warn={maintenanceDue > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="font-medium mb-3">Lots par phase</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={lotsByPhase} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" allowDecimals={false} hide />
              <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {lotsByPhase.map((entry) => (
                  <Cell key={entry.phase} fill={PHASE_COLORS[entry.phase]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {contractedTotal > 0 && (
            <p className="text-xs text-slate-400 mt-2">
              Montant total engage sur les lots : {contractedTotal.toLocaleString("fr-FR")} EUR
            </p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="font-medium mb-3">Documents par statut</h3>
          <div className="space-y-2">
            {docCounts.map((d) => (
              <div key={d.status} className="flex items-center justify-between text-sm">
                <span className={`px-2 py-0.5 rounded-full text-xs ${DOC_STATUS_COLORS[d.status]}`}>{d.label}</span>
                <span className="font-medium">{d.count}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Recettes enregistrees</span>
              <span className="font-medium text-green-700">{totalIncome.toLocaleString("fr-FR")} EUR</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Depenses enregistrees</span>
              <span className="font-medium text-red-700">{totalSpent.toLocaleString("fr-FR")} EUR</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Marge (recettes - depenses)</span>
              <span className="font-medium">{(totalIncome - totalSpent).toLocaleString("fr-FR")} EUR</span>
            </div>
          </div>
        </div>
      </div>

      {lots.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <h3 className="font-medium p-4 pb-0">Detail par lot</h3>
          <div className="divide-y divide-slate-100">
            {lots.map((l) => {
              const lotDocsMissing = (l.documents || []).filter((d) => d.status === "MISSING").length;
              const lotStatements = l.progressStatements || [];
              const paidOnLot = lotStatements.reduce((s, ps) => s + ps.amount, 0);
              return (
                <div key={l.id} className="p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div>
                    <span className="font-medium">
                      {l.code} - {l.name}
                    </span>
                    <span
                      className="ml-2 text-xs px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: PHASE_COLORS[l.phase] }}
                    >
                      {PHASE_LABELS[l.phase]}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    {l.contractAmount != null && (
                      <span>
                        {paidOnLot.toLocaleString("fr-FR")} / {Number(l.contractAmount).toLocaleString("fr-FR")} EUR
                      </span>
                    )}
                    {lotDocsMissing > 0 && <span className="text-red-600">{lotDocsMissing} doc(s) manquant(s)</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, warn }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-2xl font-semibold ${warn ? "text-red-600" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}
