import { useEffect, useState } from "react";
import client, { fileUrl } from "../api/client";
import LotFinanceCards from "./LotFinanceCards";

const ENTRY_TYPE_LABELS = {
  PURCHASE_ORDER: "Commande",
  AMENDMENT: "Avenant",
  RISK: "Risque",
  INVOICE: "Facture",
  CONTRACT: "Contrat",
  SUBSIDY: "Subside",
  OTHER: "Autre",
};

const STATUS_LABELS = {
  DRAFT: "Brouillon",
  ENGAGED: "Engage",
  SUBMITTED: "Soumis",
  VALIDATED: "Valide",
  PAID: "Paye",
};

const STATUS_COLORS = {
  DRAFT: "bg-slate-100 text-slate-600",
  ENGAGED: "bg-blue-100 text-blue-700",
  SUBMITTED: "bg-amber-100 text-amber-700",
  VALIDATED: "bg-purple-100 text-purple-700",
  PAID: "bg-green-100 text-green-700",
};

const EXPENSE_TYPES = ["PURCHASE_ORDER", "AMENDMENT", "RISK", "INVOICE", "OTHER"];
const INCOME_TYPES = ["CONTRACT", "AMENDMENT", "RISK", "SUBSIDY", "OTHER"];

const emptyForm = {
  direction: "expense",
  entryType: "PURCHASE_ORDER",
  lotId: "",
  subcontractorId: "",
  label: "",
  amount: "",
  category: "",
  date: "",
  status: "ENGAGED",
  invoiceNumber: "",
  relatedEntryId: "",
};

export default function FinanceView({ project, onChange }) {
  const items = project.budgetItems || [];
  const lots = project.lots || [];
  const [subcontractors, setSubcontractors] = useState([]);

  useEffect(() => {
    client.get("/subcontractors").then(({ data }) => setSubcontractors(data));
  }, []);

  const [tab, setTab] = useState("lots"); // "lots" | "registre" | "dossier" | "synthese"
  const [importRows, setImportRows] = useState([]); // lignes en attente issues du glisser-deposer
  const [importing, setImporting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pendingFile, setPendingFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [filterLot, setFilterLot] = useState("ALL");
  const [filterType, setFilterType] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [search, setSearch] = useState("");

  // Cible de marge : 21 % par defaut (demande d'Alexandre ; le fichier source affiche 22 %),
  // modifiable et memorisee par projet.
  const marginKey = `marginTarget-${project.id}`;
  const [marginTarget, setMarginTarget] = useState(() => {
    const saved = typeof localStorage !== "undefined" ? Number(localStorage.getItem(marginKey)) : 0;
    return saved > 0 ? saved : 21;
  });
  function updateMarginTarget(value) {
    const v = Number(value);
    setMarginTarget(v);
    if (v > 0 && typeof localStorage !== "undefined") localStorage.setItem(marginKey, String(v));
  }

  const expenseItems = items.filter((i) => i.type === "expense");
  const incomeItems = items.filter((i) => i.type === "income");

  const capex = project.budgetTotal || 0;
  const engaged = expenseItems
    .filter((i) => ["PURCHASE_ORDER", "AMENDMENT", "RISK"].includes(i.entryType))
    .reduce((s, i) => s + i.amount, 0);
  const invoiced = expenseItems.filter((i) => i.entryType === "INVOICE").reduce((s, i) => s + i.amount, 0);
  const paid = expenseItems
    .filter((i) => i.entryType === "INVOICE" && i.status === "PAID")
    .reduce((s, i) => s + i.amount, 0);

  const incomeExpected = incomeItems.reduce((s, i) => s + i.amount, 0);
  const incomeReceived = incomeItems.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0);

  // IN / OUT / Marge — meme logique que l'onglet Budget du fichier "Suivi financier global" :
  // IN = recettes hors risque ; OUT = commandes + avenants (les risques et factures sont suivis a part).
  const totalIn = incomeItems.filter((i) => i.entryType !== "RISK").reduce((s, i) => s + i.amount, 0);
  const totalOut = expenseItems
    .filter((i) => ["PURCHASE_ORDER", "AMENDMENT"].includes(i.entryType))
    .reduce((s, i) => s + i.amount, 0);
  const totalRisks = items.filter((i) => i.entryType === "RISK").reduce((s, i) => s + i.amount, 0);
  const margin = totalIn - totalOut;
  const marginPct = totalIn > 0 ? (margin / totalIn) * 100 : 0;
  const marginWithRisks = margin - totalRisks;
  const marginWithRisksPct = totalIn > 0 ? (marginWithRisks / totalIn) * 100 : 0;
  const onTarget = marginPct >= marginTarget;

  // Dossier documents : toutes les lignes du registre qui portent un fichier, groupees par lot.
  const documentItems = items.filter((i) => i.fileUrl);
  const documentsByLot = [];
  {
    const groups = {};
    for (const item of documentItems) {
      const key = item.lotId || "none";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    const orderedLots = [...lots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const lot of orderedLots) {
      if (groups[lot.id]) documentsByLot.push({ lot, items: groups[lot.id] });
    }
    if (groups.none) documentsByLot.push({ lot: null, items: groups.none });
  }

  const lotById = Object.fromEntries(lots.map((l) => [l.id, l]));
  const subById = Object.fromEntries(subcontractors.map((s) => [s.id, s]));

  const filtered = items.filter((i) => {
    if (filterLot !== "ALL" && i.lotId !== filterLot) return false;
    if (filterType !== "ALL" && i.entryType !== filterType) return false;
    if (filterStatus !== "ALL" && i.status !== filterStatus) return false;
    if (search && !i.label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Commandes existantes du meme sens (utile pour rattacher une facture a sa commande)
  const purchaseOrders = items.filter((i) => ["PURCHASE_ORDER", "AMENDMENT"].includes(i.entryType));

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setUploading(true);
    try {
      let fileData = {};
      if (pendingFile) {
        const formData = new FormData();
        formData.append("file", pendingFile);
        const { data } = await client.post("/uploads", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        fileData = { fileUrl: data.fileUrl, fileName: data.fileName };
      }
      await client.post("/budget-items", {
        projectId: project.id,
        lotId: form.lotId || null,
        subcontractorId: form.subcontractorId || null,
        label: form.label,
        amount: form.amount,
        type: form.direction,
        category: form.category,
        date: form.date,
        entryType: form.entryType,
        status: form.status,
        invoiceNumber: form.invoiceNumber || null,
        relatedEntryId: form.relatedEntryId || null,
        ...fileData,
      });
      setForm(emptyForm);
      setPendingFile(null);
      setShowForm(false);
      onChange();
    } finally {
      setUploading(false);
    }
  }

  // ----- Import de factures / bons de commande par glisser-deposer -----
  // Lit la convention de nommage KARNO : K-0044-BB2-FAC-Societe-Objet-Ref.pdf
  // (FAC = facture, PO/BC = bon de commande, DEV = devis, AM = avenant)
  const normalize = (s) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  function parseFileName(name) {
    const base = name.replace(/\.[^.]+$/, "");
    const tokens = base.split("-").map((t) => t.trim()).filter(Boolean);
    let lotCode = null;
    let entryType = "INVOICE";
    let status = "SUBMITTED";
    let typeIndex = -1;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i].toUpperCase();
      if (/^BB\d+$/.test(t)) lotCode = t;
      if (typeIndex === -1 && ["FAC", "PO", "BC", "DEV", "AM"].includes(t)) {
        typeIndex = i;
        if (t === "FAC") [entryType, status] = ["INVOICE", "SUBMITTED"];
        else if (t === "DEV") [entryType, status] = ["PURCHASE_ORDER", "DRAFT"];
        else if (t === "AM") [entryType, status] = ["AMENDMENT", "ENGAGED"];
        else [entryType, status] = ["PURCHASE_ORDER", "ENGAGED"];
      }
    }
    const after = typeIndex >= 0 ? tokens.slice(typeIndex + 1) : [];
    const subName = after[0] || "";
    const label = (after.length > 1 ? after.slice(1).join(" - ") : after[0]) || base;
    const lot = lots.find((l) => l.code === lotCode);
    const sub = subName ? subcontractors.find((s) => normalize(s.name).includes(normalize(subName)) || normalize(subName).includes(normalize(s.name))) : null;
    return {
      lotId: lot ? lot.id : "",
      entryType,
      status,
      subId: sub ? sub.id : "",
      subName: sub ? sub.name : subName,
      label,
      amount: "",
    };
  }

  function handleDropFiles(e) {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    setImportRows((rows) => [...rows, ...files.map((file) => ({ file, fileName: file.name, ...parseFileName(file.name) }))]);
  }

  function updateImportRow(i, field, value) {
    setImportRows((rows) => rows.map((r, j) => (j === i ? { ...r, [field]: value } : r)));
  }

  async function handleImportSubmit() {
    setImporting(true);
    try {
      const subCache = {};
      for (const row of importRows) {
        let subcontractorId = row.subId || null;
        if (!subcontractorId && row.subName) {
          const key = normalize(row.subName);
          if (!subCache[key]) {
            const { data } = await client.post("/subcontractors", { name: row.subName });
            subCache[key] = data.id;
          }
          subcontractorId = subCache[key];
        }
        const formData = new FormData();
        formData.append("file", row.file);
        const { data: up } = await client.post("/uploads", formData, { headers: { "Content-Type": "multipart/form-data" } });
        await client.post("/budget-items", {
          projectId: project.id,
          lotId: row.lotId || null,
          subcontractorId,
          label: row.label,
          amount: row.amount || 0,
          type: "expense",
          entryType: row.entryType,
          status: row.status,
          fileUrl: up.fileUrl,
          fileName: up.fileName,
        });
      }
      setImportRows([]);
      onChange();
    } finally {
      setImporting(false);
    }
  }

  async function handleStatusChange(item, status) {
    await client.put(`/budget-items/${item.id}`, { status });
    onChange();
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer cette ligne ?")) return;
    await client.delete(`/budget-items/${id}`);
    onChange();
  }

  const availableTypes = form.direction === "expense" ? EXPENSE_TYPES : INCOME_TYPES;

  return (
    <div className="space-y-5">
      {/* IN / OUT / Marge — vision globale du projet (source : registre complet) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="IN (recettes)" value={totalIn} highlight="green" />
        <Metric label="OUT (commandes + avenants)" value={totalOut} />
        <div className={`rounded-md p-4 ${onTarget ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
          <div className="text-xs text-slate-500">Marge brute</div>
          <div className={`text-2xl font-medium ${onTarget ? "text-green-700" : "text-red-600"}`}>
            {marginPct.toFixed(1)} %
          </div>
          <div className="text-xs text-slate-500">
            {Math.round(margin).toLocaleString("fr-FR")} EUR
            <span className={onTarget ? "text-green-600" : "text-red-500"}>
              {" "}
              (cible{" "}
              <input
                type="number"
                min="0"
                max="100"
                value={marginTarget}
                onChange={(e) => updateMarginTarget(e.target.value)}
                className="w-12 bg-transparent border-b border-slate-300 text-center focus:outline-none"
              />
              %)
            </span>
          </div>
        </div>
        <div className="bg-slate-100 rounded-md p-4">
          <div className="text-xs text-slate-500">Marge avec risques</div>
          <div className="text-2xl font-medium">{marginWithRisksPct.toFixed(1)} %</div>
          <div className="text-xs text-slate-500">
            {Math.round(marginWithRisks).toLocaleString("fr-FR")} EUR &middot; risques {Math.round(totalRisks).toLocaleString("fr-FR")} EUR
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="CAPEX (budget total)" value={capex} />
        <Metric label="Engage (commandes)" value={engaged} warn={engaged > capex} />
        <Metric label="Facture" value={invoiced} />
        <Metric label="Paye" value={paid} highlight="green" />
      </div>

      {(incomeExpected > 0 || incomeItems.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex flex-wrap gap-6 text-sm">
          <div>
            <span className="text-slate-400">Recettes attendues : </span>
            <span className="font-medium">{incomeExpected.toLocaleString("fr-FR")} EUR</span>
          </div>
          <div>
            <span className="text-slate-400">Recettes recues : </span>
            <span className="font-medium text-green-700">{incomeReceived.toLocaleString("fr-FR")} EUR</span>
          </div>
        </div>
      )}

      {/* Onglets Par lot / Registre / Dossier documents / Synthese */}
      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setTab("lots")}
          className={`px-4 py-2 text-sm rounded-t-md ${tab === "lots" ? "bg-white border border-b-0 border-slate-200 font-medium" : "text-slate-500 hover:text-slate-700"}`}
        >
          Par lot
        </button>
        <button
          onClick={() => setTab("registre")}
          className={`px-4 py-2 text-sm rounded-t-md ${tab === "registre" ? "bg-white border border-b-0 border-slate-200 font-medium" : "text-slate-500 hover:text-slate-700"}`}
        >
          Registre
        </button>
        <button
          onClick={() => setTab("dossier")}
          className={`px-4 py-2 text-sm rounded-t-md ${tab === "dossier" ? "bg-white border border-b-0 border-slate-200 font-medium" : "text-slate-500 hover:text-slate-700"}`}
        >
          Dossier documents ({documentItems.length})
        </button>
        <button
          onClick={() => setTab("synthese")}
          className={`px-4 py-2 text-sm rounded-t-md ${tab === "synthese" ? "bg-white border border-b-0 border-slate-200 font-medium" : "text-slate-500 hover:text-slate-700"}`}
        >
          Synthese
        </button>
      </div>

      {tab === "lots" && <LotFinanceCards project={project} subcontractors={subcontractors} />}

      {tab === "synthese" && (() => {
        const agg = () => ({ po: 0, am: 0, risk: 0, inv: 0, paid: 0 });
        const byLot = {};
        const bySub = {};
        for (const i of expenseItems) {
          const lotKey = i.lotId || "none";
          const subKey = i.subcontractorId || "none";
          byLot[lotKey] = byLot[lotKey] || agg();
          bySub[subKey] = bySub[subKey] || agg();
          for (const g of [byLot[lotKey], bySub[subKey]]) {
            if (i.entryType === "PURCHASE_ORDER") g.po += i.amount;
            else if (i.entryType === "AMENDMENT") g.am += i.amount;
            else if (i.entryType === "RISK") g.risk += i.amount;
            else if (i.entryType === "INVOICE") {
              g.inv += i.amount;
              if (i.status === "PAID") g.paid += i.amount;
            }
          }
        }
        const f = (n) => Math.round(n).toLocaleString("fr-FR");
        const lotRows = [...lots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).filter((l) => byLot[l.id]);
        const subRows = subcontractors.filter((s) => bySub[s.id]).sort((a, b) => (bySub[b.id].po + bySub[b.id].am) - (bySub[a.id].po + bySub[a.id].am));
        const Table = ({ title, rows }) => (
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-sm font-medium">{title}</div>
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-2"></th>
                  <th className="px-4 py-2 text-right">Commandes</th>
                  <th className="px-4 py-2 text-right">Avenants</th>
                  <th className="px-4 py-2 text-right">Engage (C+A)</th>
                  <th className="px-4 py-2 text-right">Risques</th>
                  <th className="px-4 py-2 text-right">Facture</th>
                  <th className="px-4 py-2 text-right">Paye</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ key, label, g }) => (
                  <tr key={key} className="border-b border-slate-50">
                    <td className="px-4 py-2 font-medium">{label}</td>
                    <td className="px-4 py-2 text-right">{f(g.po)}</td>
                    <td className="px-4 py-2 text-right">{f(g.am)}</td>
                    <td className="px-4 py-2 text-right font-medium">{f(g.po + g.am)}</td>
                    <td className="px-4 py-2 text-right text-amber-700">{f(g.risk)}</td>
                    <td className="px-4 py-2 text-right">{f(g.inv)}</td>
                    <td className="px-4 py-2 text-right text-green-700">{f(g.paid)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-medium">
                  <td className="px-4 py-2">Total</td>
                  {["po", "am", null, "risk", "inv", "paid"].map((k, idx) => (
                    <td key={idx} className="px-4 py-2 text-right">
                      {k
                        ? f(rows.reduce((s, r) => s + r.g[k], 0))
                        : f(rows.reduce((s, r) => s + r.g.po + r.g.am, 0))}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        );
        // Avancement croise : % physique (EA cumules / commande) vs % facture vs % paye.
        // Alerte quand la facturation depasse nettement l'avancement physique (ou l'inverse).
        const crossRows = [...lots]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((l) => {
            const g = byLot[l.id] || agg();
            const engaged2 = g.po + g.am;
            const eaTotal = (l.progressStatements || []).reduce((s, st) => s + (st.amount || 0), 0);
            const base = l.contractAmount || engaged2;
            const physical = base > 0 ? (eaTotal / base) * 100 : null;
            const invoicedPct = engaged2 > 0 ? (g.inv / engaged2) * 100 : null;
            const paidPct = engaged2 > 0 ? (g.paid / engaged2) * 100 : null;
            return { lot: l, physical, invoicedPct, paidPct, hasData: eaTotal > 0 || g.inv > 0 || g.paid > 0 };
          })
          .filter((r) => r.hasData);
        const Bar = ({ pct, color }) => (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-slate-100 rounded">
              <div className={`h-2 rounded ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct || 0))}%` }} />
            </div>
            <span className="text-xs w-12 text-right">{pct === null ? "n/a" : `${Math.round(pct)} %`}</span>
          </div>
        );

        return (
          <div className="space-y-4">
            {crossRows.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-sm font-medium">
                  Avancement croise par lot — physique (EA) vs facture vs paye
                </div>
                <table className="w-full text-sm min-w-[620px]">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                      <th className="px-4 py-2 w-20"></th>
                      <th className="px-4 py-2">Avancement physique (EA)</th>
                      <th className="px-4 py-2">Facture</th>
                      <th className="px-4 py-2">Paye</th>
                      <th className="px-4 py-2 w-40">Ecart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crossRows.map(({ lot: l, physical, invoicedPct, paidPct }) => {
                      const gap = physical !== null && invoicedPct !== null ? invoicedPct - physical : null;
                      const alert = gap !== null && Math.abs(gap) > 15;
                      return (
                        <tr key={l.id} className="border-b border-slate-50">
                          <td className="px-4 py-2 font-medium">{l.code}</td>
                          <td className="px-4 py-2"><Bar pct={physical} color="bg-brand-500" /></td>
                          <td className="px-4 py-2"><Bar pct={invoicedPct} color="bg-amber-500" /></td>
                          <td className="px-4 py-2"><Bar pct={paidPct} color="bg-green-500" /></td>
                          <td className={`px-4 py-2 text-xs ${alert ? "text-red-600 font-semibold" : "text-slate-400"}`}>
                            {gap === null
                              ? "EA ou factures manquants"
                              : alert
                                ? gap > 0
                                  ? `Facture ${Math.round(gap)} pts au-dessus du realise !`
                                  : `Realise ${Math.round(-gap)} pts non facture`
                                : "coherent"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="px-4 py-2 text-[11px] text-slate-400">
                  Physique = somme des EA du lot / montant de commande du lot. Facture et paye = factures du registre / engage (commandes + avenants).
                </p>
              </div>
            )}
            <Table
              title="Depenses par lot (BB)"
              rows={[
                ...lotRows.map((l) => ({ key: l.id, label: `${l.code} - ${l.name}`, g: byLot[l.id] })),
                ...(byLot.none ? [{ key: "none", label: "Sans lot", g: byLot.none }] : []),
              ]}
            />
            <Table
              title="Depenses par societe"
              rows={[
                ...subRows.map((s) => ({ key: s.id, label: s.name, g: bySub[s.id] })),
                ...(bySub.none ? [{ key: "none", label: "Sans societe", g: bySub.none }] : []),
              ]}
            />
          </div>
        );
      })()}

      {tab === "dossier" && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropFiles}
            className="border-2 border-dashed border-slate-300 rounded-lg px-4 py-6 text-center text-sm text-slate-500 hover:border-brand-400"
          >
            Glisse ici tes factures / bons de commande / devis (PDF). Le nom du fichier est lu
            automatiquement : <span className="font-mono text-xs">K-0044-BB2-FAC-Societe-Objet.pdf</span>
          </div>

          {importRows.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium">
                {importRows.length} fichier(s) a importer — verifie et complete les montants :
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[760px]">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="px-2 py-1">Fichier</th>
                      <th className="px-2 py-1">Lot</th>
                      <th className="px-2 py-1">Type</th>
                      <th className="px-2 py-1">Societe</th>
                      <th className="px-2 py-1">Libelle</th>
                      <th className="px-2 py-1 text-right">Montant (EUR)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((r, i) => (
                      <tr key={i} className="border-t border-amber-100">
                        <td className="px-2 py-1 max-w-[160px] truncate" title={r.fileName}>{r.fileName}</td>
                        <td className="px-2 py-1">
                          <select value={r.lotId} onChange={(e) => updateImportRow(i, "lotId", e.target.value)} className="border border-slate-300 rounded px-1 py-0.5">
                            <option value="">Sans lot</option>
                            {lots.map((l) => (
                              <option key={l.id} value={l.id}>{l.code}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <select value={r.entryType} onChange={(e) => updateImportRow(i, "entryType", e.target.value)} className="border border-slate-300 rounded px-1 py-0.5">
                            {EXPENSE_TYPES.map((t) => (
                              <option key={t} value={t}>{ENTRY_TYPE_LABELS[t]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={r.subName}
                            onChange={(e) => {
                              updateImportRow(i, "subName", e.target.value);
                              updateImportRow(i, "subId", "");
                            }}
                            className={`border rounded px-1 py-0.5 w-28 ${r.subId ? "border-green-300 bg-green-50" : "border-amber-300"}`}
                            title={r.subId ? "Societe reconnue dans l'annuaire" : "Nouvelle societe (sera creee)"}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input value={r.label} onChange={(e) => updateImportRow(i, "label", e.target.value)} className="border border-slate-300 rounded px-1 py-0.5 w-full min-w-[140px]" />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" step="0.01" value={r.amount} onChange={(e) => updateImportRow(i, "amount", e.target.value)} className="border border-slate-300 rounded px-1 py-0.5 w-24 text-right" placeholder="0.00" />
                        </td>
                        <td className="px-1">
                          <button onClick={() => setImportRows((rows) => rows.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setImportRows([])} className="text-sm px-3 py-1.5 rounded-md border border-slate-300">Annuler</button>
                <button onClick={handleImportSubmit} disabled={importing} className="bg-brand-600 text-white text-sm px-4 py-1.5 rounded-md disabled:opacity-50">
                  {importing ? "Import en cours..." : `Creer ${importRows.length} ligne(s)`}
                </button>
              </div>
            </div>
          )}

          {documentsByLot.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-lg px-4 py-8 text-center text-slate-400 text-sm">
              Aucun document dans le registre pour l'instant. Ajoute un fichier (bon de commande,
              facture...) sur une ligne du registre et il apparaitra ici automatiquement.
            </div>
          )}
          {documentsByLot.map(({ lot, items: lotItems }) => (
            <div key={lot ? lot.id : "none"} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-sm font-medium">
                {lot ? `${lot.code} - ${lot.name}` : "General (sans lot)"}
                <span className="text-slate-400 font-normal"> &middot; {lotItems.length} document(s)</span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {lotItems.map((item) => (
                    <tr key={item.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2">
                        <a href={fileUrl(item.fileUrl)} target="_blank" rel="noreferrer" className="text-brand-600 underline font-medium">
                          {item.fileName || item.label}
                        </a>
                        <div className="text-xs text-slate-400">
                          {item.label}
                          {item.invoiceNumber ? ` · N° ${item.invoiceNumber}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">{ENTRY_TYPE_LABELS[item.entryType] || item.entryType}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {item.subcontractorId && subById[item.subcontractorId] ? subById[item.subcontractorId].name : "-"}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 ${STATUS_COLORS[item.status]}`}>{STATUS_LABELS[item.status]}</span>
                      </td>
                      <td className={`px-4 py-2 text-right font-medium ${item.type === "expense" ? "text-red-600" : "text-green-600"}`}>
                        {item.type === "expense" ? "-" : "+"}
                        {item.amount.toLocaleString("fr-FR")} EUR
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {tab === "registre" && (
      <>
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-2">
          <select value={filterLot} onChange={(e) => setFilterLot(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
            <option value="ALL">Tous les lots</option>
            <option value="">Sans lot (general)</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
            <option value="ALL">Tous les types</option>
            {Object.entries(ENTRY_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
            <option value="ALL">Tous les statuts</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          />
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="bg-brand-600 text-white text-sm px-4 py-1.5 rounded-md">
          {showForm ? "Annuler" : "+ Ajouter une ligne"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-2 gap-3">
          <select
            value={form.direction}
            onChange={(e) => update("direction", e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="expense">Depense</option>
            <option value="income">Recette</option>
          </select>
          <select
            value={form.entryType}
            onChange={(e) => update("entryType", e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          >
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {ENTRY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Libelle"
            value={form.label}
            onChange={(e) => update("label", e.target.value)}
            className="col-span-2 border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            required
            type="number"
            step="0.01"
            placeholder="Montant (EUR)"
            value={form.amount}
            onChange={(e) => update("amount", e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <select
            value={form.status}
            onChange={(e) => update("status", e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          >
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={form.lotId}
            onChange={(e) => update("lotId", e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Aucun lot (general)</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} - {l.name}
              </option>
            ))}
          </select>
          <select
            value={form.subcontractorId}
            onChange={(e) => update("subcontractorId", e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Societe (optionnel)</option>
            {subcontractors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Categorie (optionnel)"
            value={form.category}
            onChange={(e) => update("category", e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={form.date}
            onChange={(e) => update("date", e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          {form.entryType === "INVOICE" && (
            <>
              <input
                placeholder="Numero de facture (optionnel)"
                value={form.invoiceNumber}
                onChange={(e) => update("invoiceNumber", e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
              <select
                value={form.relatedEntryId}
                onChange={(e) => update("relatedEntryId", e.target.value)}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Rattacher a une commande (optionnel)</option>
                {purchaseOrders.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.label} ({po.amount.toLocaleString("fr-FR")} EUR)
                  </option>
                ))}
              </select>
            </>
          )}
          <div className="col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Fichier (bon de commande, facture, offre...)</label>
            <input type="file" onChange={(e) => setPendingFile(e.target.files[0])} className="w-full text-sm" />
          </div>
          <button
            type="submit"
            disabled={uploading}
            className="col-span-2 bg-brand-600 text-white text-sm py-2 rounded-md disabled:opacity-50"
          >
            {uploading ? "Enregistrement..." : "Ajouter au registre"}
          </button>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
              <th className="px-4 py-2">Lot</th>
              <th className="px-4 py-2">Libelle</th>
              <th className="px-4 py-2">Societe</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Statut</th>
              <th className="px-4 py-2 text-right">Montant</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Aucune ligne pour ce filtre.
                </td>
              </tr>
            )}
            {filtered.map((item) => (
              <tr key={item.id} className="border-b border-slate-50">
                <td className="px-4 py-2 text-xs text-slate-500">{item.lotId && lotById[item.lotId] ? lotById[item.lotId].code : "-"}</td>
                <td className="px-4 py-2">
                  <div className="font-medium">{item.label}</div>
                  {item.category && <div className="text-xs text-slate-400">{item.category}</div>}
                  {item.invoiceNumber && <div className="text-xs text-slate-400">N&deg; {item.invoiceNumber}</div>}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {item.subcontractorId && subById[item.subcontractorId] ? subById[item.subcontractorId].name : "-"}
                </td>
                <td className="px-4 py-2 text-xs">{ENTRY_TYPE_LABELS[item.entryType] || item.entryType}</td>
                <td className="px-4 py-2">
                  <select
                    value={item.status}
                    onChange={(e) => handleStatusChange(item, e.target.value)}
                    className={`text-xs rounded-full px-2 py-1 border-0 ${STATUS_COLORS[item.status]}`}
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={`px-4 py-2 text-right font-medium ${item.type === "expense" ? "text-red-600" : "text-green-600"}`}>
                  {item.type === "expense" ? "-" : "+"}
                  {item.amount.toLocaleString("fr-FR")} EUR
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center gap-2 justify-end">
                    {item.fileUrl && (
                      <a href={fileUrl(item.fileUrl)} target="_blank" rel="noreferrer" className="text-brand-600 text-xs underline">
                        Fichier
                      </a>
                    )}
                    <button onClick={() => handleDelete(item.id)} className="text-slate-400 hover:text-red-500">
                      &times;
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}
    </div>
  );
}

function Metric({ label, value, warn, highlight }) {
  const color = warn ? "text-red-600" : highlight === "green" ? "text-green-700" : "";
  return (
    <div className="bg-slate-100 rounded-md p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-medium ${color}`}>
        {Math.round(Number(value)).toLocaleString("fr-FR")} <span className="text-sm font-normal">EUR</span>
      </div>
    </div>
  );
}
