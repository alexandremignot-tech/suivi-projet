import { useState } from "react";
import client from "../api/client";

// Cycle de statut au clic : todo -> en cours -> fait -> bloque -> todo
const STATUS_CYCLE = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"];
const STATUS_COLORS = {
  TODO: "bg-slate-100 hover:bg-slate-200",
  IN_PROGRESS: "bg-blue-200 hover:bg-blue-300",
  DONE: "bg-green-200 hover:bg-green-300",
  BLOCKED: "bg-red-200 hover:bg-red-300",
};
const STATUS_LABELS = { TODO: "A faire", IN_PROGRESS: "En cours", DONE: "Fait", BLOCKED: "Bloque" };

// Grille compacte "maisons x etapes" : pensee pour des lots avec des dizaines/centaines d'unites
// installees de maniere identique (ex: BB5 - raccordement des maisons). Chaque case se clique pour
// avancer le statut, plutot que d'avoir une carte par maison (trop lourd a grande echelle).
export default function UnitsGrid({ lot, subcontractors, onChange }) {
  const templates = lot.unitStepTemplates || [];
  const units = lot.units || [];

  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: "", defaultSubcontractorId: "" });

  const [showUnitForm, setShowUnitForm] = useState(false);
  const [unitForm, setUnitForm] = useState({ name: "" });

  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkForm, setBulkForm] = useState({ prefix: "Lot ", from: "", to: "" });

  const subById = Object.fromEntries(subcontractors.map((s) => [s.id, s]));

  function stepFor(unit, templateId) {
    return (unit.steps || []).find((s) => s.templateId === templateId);
  }

  async function handleCellClick(step) {
    if (!step) return;
    const nextIndex = (STATUS_CYCLE.indexOf(step.status) + 1) % STATUS_CYCLE.length;
    await client.patch(`/unit-steps/${step.id}`, { status: STATUS_CYCLE[nextIndex] });
    onChange();
  }

  async function handleAddTemplate(e) {
    e.preventDefault();
    await client.post("/unit-templates", {
      lotId: lot.id,
      name: templateForm.name,
      defaultSubcontractorId: templateForm.defaultSubcontractorId || null,
    });
    setTemplateForm({ name: "", defaultSubcontractorId: "" });
    setShowTemplateForm(false);
    onChange();
  }

  async function handleDeleteTemplate(id) {
    if (!confirm("Supprimer cette etape type pour toutes les unites ?")) return;
    await client.delete(`/unit-templates/${id}`);
    onChange();
  }

  async function handleAddUnit(e) {
    e.preventDefault();
    await client.post("/units", { lotId: lot.id, name: unitForm.name });
    setUnitForm({ name: "" });
    setShowUnitForm(false);
    onChange();
  }

  async function handleBulkAdd(e) {
    e.preventDefault();
    await client.post("/units/bulk", {
      lotId: lot.id,
      prefix: bulkForm.prefix,
      from: bulkForm.from,
      to: bulkForm.to,
    });
    setBulkForm({ prefix: "Lot ", from: "", to: "" });
    setShowBulkForm(false);
    onChange();
  }

  async function handleDeleteUnit(id) {
    if (!confirm("Supprimer cette unite ?")) return;
    await client.delete(`/units/${id}`);
    onChange();
  }

  const doneByTemplate = templates.map((t) => {
    const total = units.length;
    const done = units.filter((u) => stepFor(u, t.id)?.status === "DONE").length;
    return { id: t.id, done, total };
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-500">
          Checklist repetable pour les installations identiques (ex: raccordement de maisons). Clique une case pour
          avancer son statut.
        </p>
        <div className="flex gap-2 text-xs">
          <button onClick={() => setShowTemplateForm((v) => !v)} className="text-brand-600 font-medium">
            + Etape type
          </button>
          <button onClick={() => setShowUnitForm((v) => !v)} className="text-brand-600 font-medium">
            + Unite
          </button>
          <button onClick={() => setShowBulkForm((v) => !v)} className="text-brand-600 font-medium">
            + En masse
          </button>
        </div>
      </div>

      {showTemplateForm && (
        <form onSubmit={handleAddTemplate} className="bg-slate-50 rounded-md p-3 flex flex-wrap gap-2 items-center">
          <input
            required
            placeholder="Nom de l'etape (ex: Piquage reseau)"
            value={templateForm.name}
            onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
            className="flex-1 min-w-[160px] border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          />
          <select
            value={templateForm.defaultSubcontractorId}
            onChange={(e) => setTemplateForm({ ...templateForm, defaultSubcontractorId: e.target.value })}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">Sous-traitant par defaut</option>
            {subcontractors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="submit" className="bg-brand-600 text-white text-xs px-3 py-1.5 rounded-md">
            Ajouter
          </button>
        </form>
      )}

      {showUnitForm && (
        <form onSubmit={handleAddUnit} className="bg-slate-50 rounded-md p-3 flex gap-2">
          <input
            required
            placeholder="Nom de l'unite (ex: Lot 91)"
            value={unitForm.name}
            onChange={(e) => setUnitForm({ name: e.target.value })}
            className="flex-1 border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          />
          <button type="submit" className="bg-brand-600 text-white text-xs px-3 py-1.5 rounded-md">
            Ajouter
          </button>
        </form>
      )}

      {showBulkForm && (
        <form onSubmit={handleBulkAdd} className="bg-slate-50 rounded-md p-3 flex flex-wrap gap-2 items-center">
          <input
            placeholder="Prefixe (ex: Lot )"
            value={bulkForm.prefix}
            onChange={(e) => setBulkForm({ ...bulkForm, prefix: e.target.value })}
            className="w-28 border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-slate-400">de</span>
          <input
            required
            type="number"
            placeholder="53"
            value={bulkForm.from}
            onChange={(e) => setBulkForm({ ...bulkForm, from: e.target.value })}
            className="w-20 border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-slate-400">a</span>
          <input
            required
            type="number"
            placeholder="90"
            value={bulkForm.to}
            onChange={(e) => setBulkForm({ ...bulkForm, to: e.target.value })}
            className="w-20 border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          />
          <button type="submit" className="bg-brand-600 text-white text-xs px-3 py-1.5 rounded-md">
            Creer la plage
          </button>
        </form>
      )}

      {templates.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune etape type definie. Ajoutes-en une pour commencer la checklist.</p>
      ) : units.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune unite pour l'instant. Ajoute une unite ou une plage (ex: Lot 53 a 90).</p>
      ) : (
        <div className="border border-slate-200 rounded-md overflow-auto max-h-[420px]">
          <table className="text-xs border-collapse">
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th className="sticky left-0 bg-white px-2 py-2 text-left border-b border-r border-slate-200 min-w-[100px]">
                  Unite
                </th>
                {templates.map((t) => (
                  <th key={t.id} className="px-2 py-2 border-b border-slate-200 min-w-[90px] font-medium">
                    <div className="flex items-center justify-center gap-1">
                      <span>{t.name}</span>
                      <button onClick={() => handleDeleteTemplate(t.id)} className="text-slate-300 hover:text-red-500">
                        &times;
                      </button>
                    </div>
                    {t.defaultSubcontractorId && subById[t.defaultSubcontractorId] && (
                      <div className="text-[10px] text-slate-400 font-normal">{subById[t.defaultSubcontractorId].name}</div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td className="sticky left-0 bg-white px-2 py-1.5 border-r border-b border-slate-100 font-medium whitespace-nowrap">
                    <div className="flex items-center justify-between gap-1">
                      <span>{u.name}</span>
                      <button onClick={() => handleDeleteUnit(u.id)} className="text-slate-300 hover:text-red-500">
                        &times;
                      </button>
                    </div>
                  </td>
                  {templates.map((t) => {
                    const step = stepFor(u, t.id);
                    return (
                      <td key={t.id} className="border-b border-slate-100 p-1 text-center">
                        <button
                          onClick={() => handleCellClick(step)}
                          title={step ? STATUS_LABELS[step.status] : ""}
                          className={`w-full h-6 rounded ${step ? STATUS_COLORS[step.status] : "bg-slate-50"}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky left-0 bg-white px-2 py-1.5 text-slate-400 border-r border-slate-200">Termine</td>
                {doneByTemplate.map((d) => (
                  <td key={d.id} className="text-center text-slate-400 py-1.5">
                    {d.done}/{d.total}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
