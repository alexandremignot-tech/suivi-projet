import { useState } from "react";
import client, { fileUrl } from "../api/client";

function computeNextMaintenance(eq) {
  if (!eq.maintenanceIntervalDays) return null;
  const base = eq.lastMaintenanceDate ? new Date(eq.lastMaintenanceDate) : new Date(eq.createdAt);
  return new Date(base.getTime() + eq.maintenanceIntervalDays * 24 * 60 * 60 * 1000);
}

function isDue(next) {
  return next && next < new Date();
}

export default function EquipmentsView({ project, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "",
    manufacturer: "",
    model: "",
    serialNumber: "",
    maintenanceIntervalDays: "",
    lastMaintenanceDate: "",
    notes: "",
  });
  const [pendingFile, setPendingFile] = useState(null);

  const equipments = project.equipments || [];

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
      fileData = { technicalSheetUrl: data.fileUrl, technicalSheetFileName: data.fileName };
      setUploading(false);
    }
    await client.post("/equipments", { ...form, projectId: project.id, ...fileData });
    setForm({
      name: "",
      category: "",
      manufacturer: "",
      model: "",
      serialNumber: "",
      maintenanceIntervalDays: "",
      lastMaintenanceDate: "",
      notes: "",
    });
    setPendingFile(null);
    setShowForm(false);
    onChange();
  }

  async function handleMarkMaintained(eq) {
    await client.put(`/equipments/${eq.id}`, { lastMaintenanceDate: new Date().toISOString().slice(0, 10) });
    onChange();
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer cet equipement ?")) return;
    await client.delete(`/equipments/${id}`);
    onChange();
  }

  const sorted = [...equipments].sort((a, b) => {
    const na = computeNextMaintenance(a);
    const nb = computeNextMaintenance(b);
    if (!na && !nb) return 0;
    if (!na) return 1;
    if (!nb) return -1;
    return na - nb;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Equipements &amp; plan de maintenance</h3>
        <button onClick={() => setShowForm((v) => !v)} className="text-sm text-brand-600 font-medium">
          {showForm ? "Annuler" : "+ Ajouter un equipement"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-2 gap-3">
          <input
            required
            placeholder="Nom de l'equipement (ex: Chaudiere gaz B2)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="col-span-2 border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Categorie (ex: Chaudiere, PAC, Sous-station)"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Fabricant"
            value={form.manufacturer}
            onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Modele"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Numero de serie"
            value={form.serialNumber}
            onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <div>
            <label className="block text-xs text-slate-500 mb-1">Intervalle de maintenance (jours)</label>
            <input
              type="number"
              placeholder="ex: 180"
              value={form.maintenanceIntervalDays}
              onChange={(e) => setForm({ ...form, maintenanceIntervalDays: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Derniere maintenance</label>
            <input
              type="date"
              value={form.lastMaintenanceDate}
              onChange={(e) => setForm({ ...form, lastMaintenanceDate: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Fiche technique (PDF/image, optionnel)</label>
            <input type="file" onChange={(e) => setPendingFile(e.target.files[0])} className="w-full text-sm" />
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
        {sorted.length === 0 && <p className="text-sm text-slate-500 p-4">Aucun equipement enregistre.</p>}
        {sorted.map((eq) => {
          const next = computeNextMaintenance(eq);
          const due = isDue(next);
          return (
            <div key={eq.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{eq.name}</span>
                  {eq.category && <span className="text-xs text-slate-400">({eq.category})</span>}
                  {due && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-600 text-white">Maintenance due</span>}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {[eq.manufacturer, eq.model, eq.serialNumber].filter(Boolean).join(" · ") || "Sans reference"}
                </p>
                {next && (
                  <p className={`text-xs mt-0.5 ${due ? "text-red-600 font-medium" : "text-slate-500"}`}>
                    Prochaine maintenance : {next.toLocaleDateString("fr-FR")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                {eq.technicalSheetUrl && (
                  <a
                    href={fileUrl(eq.technicalSheetUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 text-xs font-medium underline"
                  >
                    Fiche technique
                  </a>
                )}
                {eq.maintenanceIntervalDays && (
                  <button onClick={() => handleMarkMaintained(eq)} className="text-xs text-green-700 font-medium underline">
                    Marquer entretenu aujourd'hui
                  </button>
                )}
                <button onClick={() => handleDelete(eq.id)} className="text-slate-400 hover:text-red-500">
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
