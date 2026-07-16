import { useState } from "react";
import client from "../api/client";

const PRIORITIES = [
  { value: "LOW", label: "Basse" },
  { value: "MEDIUM", label: "Moyenne" },
  { value: "HIGH", label: "Haute" },
  { value: "URGENT", label: "Urgente" },
];

export default function TaskModal({ project, members, columnId, task, onClose, onSaved }) {
  const isEdit = Boolean(task);
  const [form, setForm] = useState({
    title: task?.title || "",
    description: task?.description || "",
    priority: task?.priority || "MEDIUM",
    startDate: task?.startDate ? task.startDate.slice(0, 10) : "",
    dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : "",
    estimatedHours: task?.estimatedHours ?? "",
    actualHours: task?.actualHours ?? "",
    estimatedCost: task?.estimatedCost ?? "",
    actualCost: task?.actualCost ?? "",
    assigneeId: task?.assigneeId || "",
    lotId: task?.lotId || "",
    columnId: task?.columnId || columnId || project.columns[0].id,
    dependsOnIds: task?.dependsOnIds || [],
  });
  const [saving, setSaving] = useState(false);
  const [depSearch, setDepSearch] = useState("");

  // Taches selectionnables comme dependances : pas soi-meme, pas les taches qui dependent
  // (directement ou non) de celle-ci — evite les cycles.
  const allTasks = project.tasks || [];
  const descendants = new Set();
  if (isEdit) {
    const queue = [task.id];
    while (queue.length) {
      const cur = queue.pop();
      for (const t of allTasks) {
        if ((t.dependsOnIds || []).includes(cur) && !descendants.has(t.id)) {
          descendants.add(t.id);
          queue.push(t.id);
        }
      }
    }
  }
  const selectableDeps = allTasks.filter((t) => (!isEdit || t.id !== task.id) && !descendants.has(t.id));
  const taskById = Object.fromEntries(allTasks.map((t) => [t.id, t]));

  function toggleDep(id) {
    setForm((f) => ({
      ...f,
      dependsOnIds: f.dependsOnIds.includes(id) ? f.dependsOnIds.filter((x) => x !== id) : [...f.dependsOnIds, id],
    }));
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form, projectId: project.id, assigneeId: form.assigneeId || null, lotId: form.lotId || null };
    try {
      if (isEdit) {
        await client.put(`/tasks/${task.id}`, payload);
      } else {
        await client.post("/tasks", payload);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Supprimer cette tache ?")) return;
    await client.delete(`/tasks/${task.id}`);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">{isEdit ? "Modifier la tache" : "Nouvelle tache"}</h2>

          <div>
            <label className="block text-sm font-medium mb-1">Titre</label>
            <input
              required
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={3}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Colonne</label>
              <select
                value={form.columnId}
                onChange={(e) => update("columnId", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              >
                {project.columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Priorite</label>
              <select
                value={form.priority}
                onChange={(e) => update("priority", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Assigne a</label>
              <select
                value={form.assigneeId}
                onChange={(e) => update("assigneeId", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Non assigne</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Lot (optionnel)</label>
              <select
                value={form.lotId}
                onChange={(e) => update("lotId", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Aucun lot</option>
                {(project.lots || []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} - {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date de debut</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => update("startDate", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date d'echeance</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => update("dueDate", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Heures estimees</label>
              <input
                type="number"
                step="0.5"
                value={form.estimatedHours}
                onChange={(e) => update("estimatedHours", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Heures reelles</label>
              <input
                type="number"
                step="0.5"
                value={form.actualHours}
                onChange={(e) => update("actualHours", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Cout estime (EUR)</label>
              <input
                type="number"
                step="0.01"
                value={form.estimatedCost}
                onChange={(e) => update("estimatedCost", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Cout reel (EUR)</label>
              <input
                type="number"
                step="0.01"
                value={form.actualCost}
                onChange={(e) => update("actualCost", e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Depend de {form.dependsOnIds.length > 0 ? `(${form.dependsOnIds.length})` : ""}
            </label>
            <p className="text-xs text-slate-400 mb-1">
              Cette tache ne peut commencer qu'apres les taches cochees. Le planning signale les
              conflits de dates et decale les dependantes quand tu deplaces une tache.
            </p>
            {form.dependsOnIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {form.dependsOnIds.map((id) => (
                  <span key={id} className="text-[11px] bg-brand-50 border border-brand-200 text-brand-700 rounded-full px-2 py-0.5 flex items-center gap-1">
                    {taskById[id]?.title || "?"}
                    <button type="button" onClick={() => toggleDep(id)} className="hover:text-red-600">
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              placeholder="Filtrer les taches..."
              value={depSearch}
              onChange={(e) => setDepSearch(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-1.5 text-xs mb-1"
            />
            <div className="border border-slate-200 rounded-md max-h-36 overflow-y-auto divide-y divide-slate-50">
              {selectableDeps
                .filter((t) => !depSearch || t.title.toLowerCase().includes(depSearch.toLowerCase()))
                .slice(0, 60)
                .map((t) => (
                  <label key={t.id} className="flex items-center gap-2 px-3 py-1 text-xs cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={form.dependsOnIds.includes(t.id)} onChange={() => toggleDep(t.id)} />
                    <span className="truncate">{t.title}</span>
                    {t.dueDate && <span className="text-slate-400 flex-shrink-0">→ {new Date(t.dueDate).toLocaleDateString("fr-FR")}</span>}
                  </label>
                ))}
              {selectableDeps.length === 0 && <p className="text-xs text-slate-400 px-3 py-2">Aucune tache disponible.</p>}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>
              {isEdit && (
                <button type="button" onClick={handleDelete} className="text-sm text-red-600 hover:underline">
                  Supprimer
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-md border border-slate-300 text-sm"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-md bg-brand-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
