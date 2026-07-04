import { useMemo, useState } from "react";
import client, { fileUrl } from "../api/client";

function computeNextMaintenance(eq) {
  if (!eq.maintenanceIntervalDays) return null;
  const base = eq.lastMaintenanceDate ? new Date(eq.lastMaintenanceDate) : new Date(eq.createdAt);
  return new Date(base.getTime() + eq.maintenanceIntervalDays * 24 * 60 * 60 * 1000);
}

function isDue(next) {
  return next && next < new Date();
}

const EMPTY_FORM = {
  lotId: "",
  name: "",
  category: "",
  manufacturer: "",
  model: "",
  serialNumber: "",
  quantity: "1",
  location: "",
  maintenanceIntervalDays: "",
  lastMaintenanceDate: "",
  notes: "",
  specs: [{ label: "", value: "" }],
};

// Categories usuelles rencontrees sur les projets de reseaux de chaleur / geothermie, proposees
// en suggestions mais laissees libres (champ texte) pour ne pas bloquer un cas particulier.
const CATEGORY_SUGGESTIONS = [
  "PAC geothermique",
  "PAC aerothermique",
  "PAC booster",
  "Echangeur de chaleur",
  "HIU maison",
  "HIU immeuble",
  "Ballon / accumulateur",
  "Pompe de circulation",
  "Vanne / regulation",
  "Compteur d'energie",
  "Sous-station",
  "Chaudiere",
];

export default function EquipmentsView({ project, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pendingFile, setPendingFile] = useState(null);
  const [filterLotId, setFilterLotId] = useState("ALL");
  const [search, setSearch] = useState("");

  const equipments = project.equipments || [];
  const lots = project.lots || [];
  const lotById = Object.fromEntries(lots.map((l) => [l.id, l]));

  function openAddForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPendingFile(null);
    setShowForm(true);
  }

  function openEditForm(eq) {
    setForm({
      lotId: eq.lotId || "",
      name: eq.name || "",
      category: eq.category || "",
      manufacturer: eq.manufacturer || "",
      model: eq.model || "",
      serialNumber: eq.serialNumber || "",
      quantity: String(eq.quantity ?? 1),
      location: eq.location || "",
      maintenanceIntervalDays: eq.maintenanceIntervalDays ?? "",
      lastMaintenanceDate: eq.lastMaintenanceDate ? eq.lastMaintenanceDate.slice(0, 10) : "",
      notes: eq.notes || "",
      specs: eq.specs && eq.specs.length > 0 ? eq.specs : [{ label: "", value: "" }],
    });
    setEditingId(eq.id);
    setPendingFile(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPendingFile(null);
  }

  function updateSpecRow(index, field, value) {
    const specs = form.specs.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    setForm({ ...form, specs });
  }

  function addSpecRow() {
    setForm({ ...form, specs: [...form.specs, { label: "", value: "" }] });
  }

  function removeSpecRow(index) {
    setForm({ ...form, specs: form.specs.filter((_, i) => i !== index) });
  }

  async function handleSubmit(e) {
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
    const payload = { ...form, lotId: form.lotId || null, projectId: project.id, ...fileData };
    if (editingId) {
      await client.put(`/equipments/${editingId}`, payload);
    } else {
      await client.post("/equipments", payload);
    }
    closeForm();
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return equipments.filter((eq) => {
      if (filterLotId === "ALL") return true;
      if (filterLotId === "NONE") return !eq.lotId;
      return eq.lotId === filterLotId;
    }).filter((eq) => {
      if (!q) return true;
      return [eq.name, eq.category, eq.manufacturer, eq.model, eq.serialNumber, eq.location]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q));
    });
  }, [equipments, filterLotId, search]);

  // Regroupe par lot (BB) dans l'ordre des lots du projet, avec un groupe "General" pour ceux
  // qui ne sont rattaches a aucun lot (ex: equipements communs comme le CEC avant repartition).
  const groups = useMemo(() => {
    const byLot = new Map();
    const general = [];
    for (const eq of filtered) {
      if (eq.lotId && lotById[eq.lotId]) {
        if (!byLot.has(eq.lotId)) byLot.set(eq.lotId, []);
        byLot.get(eq.lotId).push(eq);
      } else {
        general.push(eq);
      }
    }
    const ordered = lots
      .filter((l) => byLot.has(l.id))
      .map((l) => ({ key: l.id, label: `${l.code} - ${l.name}`, items: byLot.get(l.id) }));
    if (general.length > 0) ordered.push({ key: "GENERAL", label: "General / non rattache a un lot", items: general });
    return ordered;
  }, [filtered, lots, lotById]);

  const dueCount = equipments.filter((eq) => isDue(computeNextMaintenance(eq))).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-medium">Equipements &amp; fiches techniques</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {equipments.length} equipement{equipments.length > 1 ? "s" : ""}
            {dueCount > 0 && <span className="text-red-600 font-medium"> · {dueCount} maintenance(s) en retard</span>}
          </p>
        </div>
        <button onClick={showForm && !editingId ? closeForm : openAddForm} className="text-sm text-brand-600 font-medium">
          {showForm && !editingId ? "Annuler" : "+ Ajouter un equipement"}
        </button>
      </div>

      {equipments.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={filterLotId}
            onChange={(e) => setFilterLotId(e.target.value)}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-xs"
          >
            <option value="ALL">Tous les lots</option>
            <option value="NONE">General (sans lot)</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} - {l.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Rechercher (nom, categorie, fabricant...)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-xs flex-1 min-w-[180px]"
          />
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-2 gap-3">
          <h4 className="col-span-2 text-sm font-medium">
            {editingId ? "Modifier l'equipement" : "Nouvel equipement"}
          </h4>
          <input
            required
            placeholder="Nom de l'equipement (ex: PAC geothermique 1)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="col-span-2 border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <select
            value={form.lotId}
            onChange={(e) => setForm({ ...form, lotId: e.target.value })}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Lot (optionnel)</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} - {l.name}
              </option>
            ))}
          </select>
          <input
            list="equipment-categories"
            placeholder="Categorie (ex: PAC geothermique)"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <datalist id="equipment-categories">
            {CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
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
          <input
            type="number"
            min="1"
            placeholder="Quantite"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Emplacement (ex: Toit batiment Est, local CEC)"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="col-span-2 border border-slate-300 rounded-md px-3 py-2 text-sm"
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

          <div className="col-span-2 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">
                Parametres techniques (ex: Puissance, Dimensions, Poids, COP...)
              </label>
              <button type="button" onClick={addSpecRow} className="text-xs text-brand-600 font-medium">
                + Parametre
              </button>
            </div>
            <div className="space-y-2">
              {form.specs.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    placeholder="Parametre (ex: Puissance)"
                    value={s.label}
                    onChange={(e) => updateSpecRow(i, "label", e.target.value)}
                    className="flex-1 border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                  />
                  <input
                    placeholder="Valeur (ex: 474 kW)"
                    value={s.value}
                    onChange={(e) => updateSpecRow(i, "value", e.target.value)}
                    className="flex-1 border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeSpecRow(i)}
                    className="text-slate-300 hover:text-red-500 px-1"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="col-span-2">
            <label className="block text-xs text-slate-500 mb-1">
              Fiche technique (PDF/image{editingId ? " - laisser vide pour conserver l'existante" : ", optionnel"})
            </label>
            <input type="file" onChange={(e) => setPendingFile(e.target.files[0])} className="w-full text-sm" />
          </div>
          <textarea
            placeholder="Notes (optionnel)"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="col-span-2 border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <div className="col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={uploading}
              className="flex-1 bg-brand-600 text-white text-sm py-2 rounded-md disabled:opacity-50"
            >
              {uploading ? "Envoi du fichier..." : editingId ? "Enregistrer" : "Ajouter"}
            </button>
            <button type="button" onClick={closeForm} className="text-sm text-slate-500 px-3">
              Annuler
            </button>
          </div>
        </form>
      )}

      {equipments.length === 0 && !showForm && (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-lg p-4">
          Aucun equipement enregistre. Ajoute les equipements du projet (PAC, echangeurs, HIU...) avec leur fiche
          technique pour un suivi centralise.
        </p>
      )}

      {groups.length === 0 && equipments.length > 0 && (
        <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-lg p-4">
          Aucun equipement ne correspond a ce filtre.
        </p>
      )}

      {groups.map((group) => (
        <div key={group.key}>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 mt-1">{group.label}</h4>
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
            {group.items.map((eq) => {
              const next = computeNextMaintenance(eq);
              const due = isDue(next);
              return (
                <div key={eq.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{eq.name}</span>
                      {eq.quantity > 1 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          x{eq.quantity}
                        </span>
                      )}
                      {eq.category && <span className="text-xs text-slate-400">({eq.category})</span>}
                      {due && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-600 text-white">Maintenance due</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {[eq.manufacturer, eq.model, eq.serialNumber, eq.location].filter(Boolean).join(" · ") ||
                        "Sans reference"}
                    </p>
                    {next && (
                      <p className={`text-xs mt-0.5 ${due ? "text-red-600 font-medium" : "text-slate-500"}`}>
                        Prochaine maintenance : {next.toLocaleDateString("fr-FR")}
                      </p>
                    )}
                    {eq.specs && eq.specs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {eq.specs.map((s, i) => (
                          <span key={i} className="text-[11px] bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                            <span className="text-slate-500">{s.label}</span>
                            {s.label && s.value ? ": " : ""}
                            <span className="font-medium text-slate-700">{s.value}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {eq.notes && <p className="text-xs text-slate-400 mt-1.5 italic">{eq.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3 text-sm flex-shrink-0">
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
                        Entretenu aujourd'hui
                      </button>
                    )}
                    <button onClick={() => openEditForm(eq)} className="text-xs text-slate-500 hover:text-brand-600 underline">
                      Modifier
                    </button>
                    <button onClick={() => handleDelete(eq.id)} className="text-slate-400 hover:text-red-500">
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
