import { useEffect, useState } from "react";
import client, { fileUrl } from "../api/client";

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

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pendingFile, setPendingFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [filterLot, setFilterLot] = useState("ALL");
  const [filterType, setFilterType] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [search, setSearch] = useState("");

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
