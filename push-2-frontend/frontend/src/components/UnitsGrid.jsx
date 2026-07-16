import { Fragment, useMemo, useState } from "react";
import client from "../api/client";

// Cycle de statut au clic : todo -> en cours -> fait -> bloque -> todo
const STATUS_CYCLE = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"];
const STATUS_COLORS = {
  TODO: "bg-slate-100 hover:bg-slate-200",
  IN_PROGRESS: "bg-blue-200 hover:bg-blue-300",
  DONE: "bg-green-200 hover:bg-green-300",
  BLOCKED: "bg-red-200 hover:bg-red-300",
};
const STATUS_LABELS = { TODO: "A faire", IN_PROGRESS: "En cours", DONE: "Fait", BLOCKED: "Probleme" };
const GENERAL_CATEGORY = "__GENERAL__";

// Categories usuelles observees sur les checklists reelles de mise en service / reception BB5.
const CATEGORY_SUGGESTIONS = [
  "Eau",
  "HIU",
  "PAC Booster",
  "Compteur ECS",
  "Compteur Chauffage",
  "Thermostat",
  "Pressostat",
];

// Grille compacte "maisons x etapes" : pensee pour des lots avec des dizaines/centaines d'unites
// installees de maniere identique (ex: BB5 - raccordement des maisons). Les etapes sont regroupees
// par categorie (Eau, HIU, Booster...) et repliees par defaut pour ne pas afficher des dizaines de
// colonnes en meme temps : on clique sur une categorie pour la deplier et voir/editer le detail.
export default function UnitsGrid({ lot, subcontractors, onChange }) {
  const templates = lot.unitStepTemplates || [];
  const units = lot.units || [];

  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: "", category: "", defaultSubcontractorId: "" });

  const [showUnitForm, setShowUnitForm] = useState(false);
  const [unitForm, setUnitForm] = useState({ name: "" });

  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkForm, setBulkForm] = useState({ prefix: "Lot ", from: "", to: "" });

  const [expandedCategory, setExpandedCategory] = useState(null);
  const [expandedUnitId, setExpandedUnitId] = useState(null);
  const [specsDraft, setSpecsDraft] = useState([]);

  const subById = Object.fromEntries(subcontractors.map((s) => [s.id, s]));

  // Regroupe les etapes type par categorie, dans l'ordre d'apparition (les categories connues
  // apparaissent normalement dans l'ordre logique du chantier : Eau, HIU, Booster, Compteurs...)
  const categories = useMemo(() => {
    const map = new Map();
    for (const t of templates) {
      const key = t.category || GENERAL_CATEGORY;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      label: key === GENERAL_CATEGORY ? "General" : key,
      items,
    }));
  }, [templates]);

  function stepFor(unit, templateId) {
    return (unit.steps || []).find((s) => s.templateId === templateId);
  }

  async function handleCellClick(step) {
    if (!step) return;
    const nextIndex = (STATUS_CYCLE.indexOf(step.status) + 1) % STATUS_CYCLE.length;
    const nextStatus = STATUS_CYCLE[nextIndex];
    let comment = step.comment;
    if (nextStatus === "BLOCKED") {
      comment = prompt("Probleme constate (optionnel) :", step.comment || "") ?? step.comment;
    }
    await client.patch(`/unit-steps/${step.id}`, { status: nextStatus, comment });
    onChange();
  }

  async function handleAddTemplate(e) {
    e.preventDefault();
    await client.post("/unit-templates", {
      lotId: lot.id,
      name: templateForm.name,
      category: templateForm.category || null,
      defaultSubcontractorId: templateForm.defaultSubcontractorId || null,
    });
    setTemplateForm({ name: "", category: "", defaultSubcontractorId: "" });
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

  function openSpecs(unit) {
    if (expandedUnitId === unit.id) {
      setExpandedUnitId(null);
      return;
    }
    setSpecsDraft(unit.specs && unit.specs.length > 0 ? unit.specs : [{ label: "", value: "" }]);
    setExpandedUnitId(unit.id);
  }

  function updateSpecRow(index, field, value) {
    setSpecsDraft((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }
  function addSpecRow() {
    setSpecsDraft((prev) => [...prev, { label: "", value: "" }]);
  }
  function removeSpecRow(index) {
    setSpecsDraft((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveSpecs(unitId) {
    await client.put(`/units/${unitId}`, { specs: specsDraft });
    setExpandedUnitId(null);
    onChange();
  }

  // Pour une unite et une categorie donnees : combien d'etapes sont "Fait" sur le total, et si
  // au moins une etape est "Probleme" (pour colorer l'agrege collapse en rouge d'un coup d'oeil).
  function categoryAggregate(unit, categoryItems) {
    let done = 0;
    let blocked = 0;
    for (const t of categoryItems) {
      const step = stepFor(unit, t.id);
      if (step?.status === "DONE") done++;
      if (step?.status === "BLOCKED") blocked++;
    }
    return { done, total: categoryItems.length, blocked };
  }

  const doneByTemplate = templates.map((t) => {
    const total = units.length;
    const done = units.filter((u) => stepFor(u, t.id)?.status === "DONE").length;
    return { id: t.id, done, total };
  });

  const activeCategory = categories.find((c) => c.key === expandedCategory);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-500">
          Checklist repetable pour les installations identiques (ex: raccordement de maisons), regroupee par
          categorie. Clique une categorie pour voir/cocher le detail, une case pour avancer son statut.
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
            placeholder="Nom de l'etape (ex: Raccordement HIU bornes M et N)"
            value={templateForm.name}
            onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
            className="flex-1 min-w-[220px] border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          />
          <input
            list="unit-step-categories"
            placeholder="Categorie (ex: HIU)"
            value={templateForm.category}
            onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}
            className="w-40 border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          />
          <datalist id="unit-step-categories">
            {CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
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
        <div className="border border-slate-200 rounded-md overflow-auto max-h-[480px]">
          <table className="text-xs border-collapse">
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th className="sticky left-0 bg-white px-2 py-2 text-left border-b border-r border-slate-200 min-w-[100px]">
                  Unite
                </th>
                {categories.map((cat) =>
                  cat.key === expandedCategory ? (
                    cat.items.map((t) => (
                      <th key={t.id} className="px-2 py-2 border-b border-slate-200 min-w-[90px] font-medium bg-brand-50">
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
                    ))
                  ) : (
                    <th
                      key={cat.key}
                      onClick={() => setExpandedCategory(cat.key)}
                      className="px-2 py-2 border-b border-slate-200 min-w-[90px] font-medium cursor-pointer hover:bg-slate-50"
                      title="Cliquer pour voir le detail"
                    >
                      {cat.label}
                      <div className="text-[10px] text-slate-400 font-normal">{cat.items.length} etapes &darr;</div>
                    </th>
                  )
                )}
                {expandedCategory && (
                  <th className="px-2 py-2 border-b border-slate-200">
                    <button
                      onClick={() => setExpandedCategory(null)}
                      className="text-[10px] text-brand-600 underline whitespace-nowrap"
                    >
                      Reduire
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <Fragment key={u.id}>
                  <tr>
                    <td className="sticky left-0 bg-white px-2 py-1.5 border-r border-b border-slate-100 font-medium whitespace-nowrap">
                      <div className="flex items-center justify-between gap-1">
                        <button onClick={() => openSpecs(u)} className="hover:text-brand-600 text-left" title="Fiche de l'unite">
                          {u.name}
                        </button>
                        <button onClick={() => handleDeleteUnit(u.id)} className="text-slate-300 hover:text-red-500">
                          &times;
                        </button>
                      </div>
                    </td>
                    {categories.map((cat) =>
                      cat.key === expandedCategory ? (
                        cat.items.map((t) => {
                          const step = stepFor(u, t.id);
                          return (
                            <td key={t.id} className="border-b border-slate-100 p-1 text-center bg-brand-50/30">
                              <button
                                onClick={() => handleCellClick(step)}
                                title={[step ? STATUS_LABELS[step.status] : "", step?.comment].filter(Boolean).join(" - ")}
                                className={`w-full h-6 rounded ${step ? STATUS_COLORS[step.status] : "bg-slate-50"}`}
                              />
                            </td>
                          );
                        })
                      ) : (
                        (() => {
                          const agg = categoryAggregate(u, cat.items);
                          const complete = agg.total > 0 && agg.done === agg.total;
                          const colorClass = agg.blocked > 0 ? "text-red-600 font-medium" : complete ? "text-green-600 font-medium" : "text-slate-500";
                          return (
                            <td
                              key={cat.key}
                              onClick={() => setExpandedCategory(cat.key)}
                              className={`border-b border-slate-100 text-center cursor-pointer hover:bg-slate-50 ${colorClass}`}
                            >
                              {agg.done}/{agg.total}
                            </td>
                          );
                        })()
                      )
                    )}
                    {expandedCategory && <td className="border-b border-slate-100"></td>}
                  </tr>
                  {expandedUnitId === u.id && (
                    <tr>
                      <td colSpan={100} className="bg-slate-50 border-b border-slate-200 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium text-slate-600">
                            Fiche de {u.name} (modeles / numeros de serie des equipements installes)
                          </p>
                          <button onClick={addSpecRow} className="text-xs text-brand-600 font-medium">
                            + Champ
                          </button>
                        </div>
                        <div className="space-y-1.5 max-w-xl">
                          {specsDraft.map((s, i) => (
                            <div key={i} className="flex gap-2">
                              <input
                                placeholder="Champ (ex: N. serie HIU)"
                                value={s.label}
                                onChange={(e) => updateSpecRow(i, "label", e.target.value)}
                                className="flex-1 border border-slate-300 rounded-md px-2 py-1 text-xs"
                              />
                              <input
                                placeholder="Valeur"
                                value={s.value}
                                onChange={(e) => updateSpecRow(i, "value", e.target.value)}
                                className="flex-1 border border-slate-300 rounded-md px-2 py-1 text-xs"
                              />
                              <button onClick={() => removeSpecRow(i)} className="text-slate-300 hover:text-red-500 px-1">
                                &times;
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => saveSpecs(u.id)}
                            className="bg-brand-600 text-white text-xs px-3 py-1.5 rounded-md"
                          >
                            Enregistrer
                          </button>
                          <button onClick={() => setExpandedUnitId(null)} className="text-xs text-slate-500 px-2">
                            Fermer
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            {expandedCategory && (
              <tfoot>
                <tr>
                  <td className="sticky left-0 bg-white px-2 py-1.5 text-slate-400 border-r border-slate-200">Termine</td>
                  {activeCategory?.items.map((t) => {
                    const d = doneByTemplate.find((x) => x.id === t.id);
                    return (
                      <td key={t.id} className="text-center text-slate-400 py-1.5 bg-brand-50/30">
                        {d.done}/{d.total}
                      </td>
                    );
                  })}
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
