import { useMemo, useState } from "react";
import client from "../api/client";

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(d) {
  return d ? new Date(d) : null;
}

export default function PlanningView({ project, onChange }) {
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState({ name: "", date: "" });

  const tasksWithDates = project.tasks.filter((t) => t.startDate || t.dueDate);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const dates = [];
    tasksWithDates.forEach((t) => {
      if (t.startDate) dates.push(new Date(t.startDate));
      if (t.dueDate) dates.push(new Date(t.dueDate));
    });
    project.milestones.forEach((m) => dates.push(new Date(m.date)));
    if (project.startDate) dates.push(new Date(project.startDate));
    if (project.endDate) dates.push(new Date(project.endDate));

    if (dates.length === 0) {
      const now = new Date();
      return { rangeStart: now, rangeEnd: new Date(now.getTime() + 30 * DAY_MS) };
    }
    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates));
    // marge de 3 jours de chaque cote
    return { rangeStart: new Date(min.getTime() - 3 * DAY_MS), rangeEnd: new Date(max.getTime() + 3 * DAY_MS) };
  }, [project]);

  const totalDays = Math.max(1, Math.round((rangeEnd - rangeStart) / DAY_MS));

  function positionOf(date) {
    const d = toDate(date);
    if (!d) return 0;
    return Math.max(0, Math.min(100, ((d - rangeStart) / DAY_MS / totalDays) * 100));
  }

  async function handleAddMilestone(e) {
    e.preventDefault();
    if (!milestoneForm.name || !milestoneForm.date) return;
    await client.post("/milestones", { projectId: project.id, ...milestoneForm });
    setMilestoneForm({ name: "", date: "" });
    setShowMilestoneForm(false);
    onChange();
  }

  async function toggleMilestone(m) {
    await client.put(`/milestones/${m.id}`, { done: !m.done });
    onChange();
  }

  async function deleteMilestone(id) {
    if (!confirm("Supprimer ce jalon ?")) return;
    await client.delete(`/milestones/${id}`);
    onChange();
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Chronologie des taches</h3>
        </div>

        {tasksWithDates.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune tache avec des dates. Ajoute des dates de debut/echeance depuis le Kanban.</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg p-4 overflow-x-auto">
            <div className="min-w-[600px]">
              {tasksWithDates.map((t) => {
                const start = t.startDate ? positionOf(t.startDate) : positionOf(t.dueDate);
                const end = t.dueDate ? positionOf(t.dueDate) : positionOf(t.startDate) + 2;
                const width = Math.max(1.5, end - start);
                return (
                  <div key={t.id} className="flex items-center gap-3 py-1.5">
                    <div className="w-40 flex-shrink-0 text-sm truncate" title={t.title}>
                      {t.title}
                    </div>
                    <div className="relative flex-1 h-5 bg-slate-100 rounded">
                      <div
                        className="absolute top-0 h-5 rounded bg-brand-500"
                        style={{ left: `${start}%`, width: `${width}%` }}
                        title={`${t.startDate ? new Date(t.startDate).toLocaleDateString("fr-FR") : "?"} → ${
                          t.dueDate ? new Date(t.dueDate).toLocaleDateString("fr-FR") : "?"
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Jalons</h3>
          <button
            onClick={() => setShowMilestoneForm((v) => !v)}
            className="text-sm text-brand-600 font-medium"
          >
            {showMilestoneForm ? "Annuler" : "+ Ajouter un jalon"}
          </button>
        </div>

        {showMilestoneForm && (
          <form onSubmit={handleAddMilestone} className="flex gap-2 mb-4 bg-white border border-slate-200 rounded-lg p-3">
            <input
              placeholder="Nom du jalon"
              value={milestoneForm.name}
              onChange={(e) => setMilestoneForm({ ...milestoneForm, name: e.target.value })}
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={milestoneForm.date}
              onChange={(e) => setMilestoneForm({ ...milestoneForm, date: e.target.value })}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <button type="submit" className="bg-brand-600 text-white text-sm px-4 py-2 rounded-md">
              Ajouter
            </button>
          </form>
        )}

        {project.milestones.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun jalon defini.</p>
        ) : (
          <ul className="space-y-2">
            {project.milestones.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between bg-white border border-slate-200 rounded-md px-4 py-2"
              >
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={m.done} onChange={() => toggleMilestone(m)} />
                  <span className={m.done ? "line-through text-slate-400" : ""}>{m.name}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  {new Date(m.date).toLocaleDateString("fr-FR")}
                  <button onClick={() => deleteMilestone(m.id)} className="text-slate-400 hover:text-red-500">
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
