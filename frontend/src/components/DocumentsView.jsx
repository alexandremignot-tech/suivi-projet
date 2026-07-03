import { useEffect, useState } from "react";
import client, { fileUrl } from "../api/client";

// Documents transverses au projet (pas rattaches a un lot precis) : etudes reglementaires,
// securite, dossier d'intervention ulterieure global. Les documents par lot (RFP/RFQ, contrat,
// reception...) se gerent depuis l'onglet Lots.
const CATEGORIES = [
  "PEB",
  "CSS",
  "DIU global",
  "Admin / Securite",
  "Plan As-built",
  "Certificat de conformite",
  "Manuel d'exploitation",
  "Garantie constructeur",
  "Autre",
];

const STATUS_LABELS = {
  MISSING: "Manquant",
  RECEIVED: "Recu",
  VALIDATED: "Valide",
  REJECTED: "Rejete",
};

const STATUS_COLORS = {
  MISSING: "bg-red-100 text-red-700",
  RECEIVED: "bg-blue-100 text-blue-700",
  VALIDATED: "bg-green-100 text-green-700",
  REJECTED: "bg-orange-100 text-orange-700",
};

function isOverdue(doc) {
  return doc.status === "MISSING" && doc.deadline && new Date(doc.deadline) < new Date();
}

export default function DocumentsView({ project, onChange }) {
  const [subcontractors, setSubcontractors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [form, setForm] = useState({
    name: "",
    category: CATEGORIES[0],
    subcontractorId: "",
    deadline: "",
    notes: "",
  });
  const [pendingFile, setPendingFile] = useState(null);

  useEffect(() => {
    client.get("/subcontractors").then(({ data }) => setSubcontractors(data));
  }, []);

  // N'affiche ici que les documents transverses au projet ; les documents propres a un lot
  // se gerent depuis la fiche du lot concerne (onglet Lots)
  const documents = (project.documents || []).filter((d) => !d.lotId);
  const missingCount = documents.filter((d) => d.status === "MISSING").length;
  const overdueCount = documents.filter(isOverdue).length;

  const filtered = filterStatus === "ALL" ? documents : documents.filter((d) => d.status === filterStatus);

  async function handleCreate(e) {
    e.preventDefault();
    let fileData = {};
    if (pendingFile) {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", pendingFile);
      const { data } = await client.post("/uploads", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      fileData = { fileUrl: data.fileUrl, fileName: data.fileName };
      setUploading(false);
    }
    await client.post("/documents", { ...form, projectId: project.id, ...fileData });
    setForm({ name: "", category: CATEGORIES[0], subcontractorId: "", deadline: "", notes: "" });
    setPendingFile(null);
    setShowForm(false);
    onChange();
  }

  async function handleUploadFile(doc, file) {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await client.post("/uploads", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    await client.put(`/documents/${doc.id}`, { fileUrl: data.fileUrl, fileName: data.fileName, status: "RECEIVED" });
    onChange();
  }

  async function handleStatusChange(doc, status) {
    await client.put(`/documents/${doc.id}`, { status });
    onChange();
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer ce document ?")) return;
    await client.delete(`/documents/${id}`);
    onChange();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4 text-sm">
          <span className="text-slate-500">
            {documents.length} document(s) &middot; <span className="text-red-600 font-medium">{missingCount} manquant(s)</span>
            {overdueCount > 0 && <span className="text-red-600 font-medium"> &middot; {overdueCount} en retard</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="ALL">Tous les statuts</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button onClick={() => setShowForm((v) => !v)} className="text-sm text-brand-600 font-medium">
            {showForm ? "Annuler" : "+ Ajouter un document attendu"}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-2 gap-3">
          <input
            required
            placeholder="Nom du document"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="col-span-2 border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={form.subcontractorId}
            onChange={(e) => setForm({ ...form, subcontractorId: e.target.value })}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Sous-traitant responsable (optionnel)</option>
            {subcontractors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Date limite</label>
            <input
              type="date"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Fichier (optionnel, si deja recu)</label>
            <input
              type="file"
              onChange={(e) => setPendingFile(e.target.files[0])}
              className="w-full text-sm"
            />
          </div>
          <input
            placeholder="Notes (optionnel)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="col-span-2 border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={uploading}
            className="col-span-2 bg-brand-600 text-white text-sm py-2 rounded-md disabled:opacity-50"
          >
            {uploading ? "Envoi du fichier..." : "Ajouter"}
          </button>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
        {filtered.length === 0 && <p className="text-sm text-slate-500 p-4">Aucun document dans cette vue.</p>}
        {filtered.map((doc) => (
          <div key={doc.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-[200px]">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{doc.name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLORS[doc.status]}`}>
                  {STATUS_LABELS[doc.status]}
                </span>
                {isOverdue(doc) && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-600 text-white">En retard</span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {doc.category}
                {doc.subcontractor && ` · ${doc.subcontractor.name}`}
                {doc.deadline && ` · echeance ${new Date(doc.deadline).toLocaleDateString("fr-FR")}`}
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <select
                value={doc.status}
                onChange={(e) => handleStatusChange(doc, e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1 text-xs"
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>

              {doc.fileUrl ? (
                <a
                  href={fileUrl(doc.fileUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 text-xs font-medium underline"
                >
                  Voir le fichier
                </a>
              ) : (
                <label className="text-xs text-brand-600 font-medium cursor-pointer underline">
                  Deposer le fichier
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => e.target.files[0] && handleUploadFile(doc, e.target.files[0])}
                  />
                </label>
              )}

              <button onClick={() => handleDelete(doc.id)} className="text-slate-400 hover:text-red-500">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
