import { useEffect, useMemo, useRef, useState } from "react";
import client from "../api/client";

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(d) {
  return d ? new Date(d) : null;
}

function toInputDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function shiftDate(d, days) {
  if (!d) return null;
  return new Date(new Date(d).getTime() + days * DAY_MS);
}

const DONE_COLUMN_RE = /termin|fini|done|recept|reçu|clôtur|clotur/i;

function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - firstThursday) / DAY_MS - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

export default function PlanningView({ project, onChange }) {
  const [mode, setMode] = useState("semaines"); // "semaines" (lookahead) | "gantt" (vue globale)
  const [weekOffset, setWeekOffset] = useState(0);
  const [cellAdd, setCellAdd] = useState(null); // { lotKey, weekStart } case en cours d'ajout rapide
  const [cellTitle, setCellTitle] = useState("");
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState({ name: "", date: "" });
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", columnId: "", lotId: "", startDate: "", dueDate: "" });
  const [filterLot, setFilterLot] = useState("ALL");
  const [editingTask, setEditingTask] = useState(null); // { id, startDate, dueDate }
  const [drag, setDrag] = useState(null); // { taskId, mode: "move"|"end", startX, pxPerDay, days }
  const [showUndated, setShowUndated] = useState(false);

  const lots = project.lots || [];
  const columns = project.columns || [];
  const lotById = Object.fromEntries(lots.map((l) => [l.id, l]));
  const columnById = Object.fromEntries(columns.map((c) => [c.id, c]));
  const today = new Date();

  const allTasks = project.tasks || [];
  const tasksWithDates = allTasks.filter((t) => t.startDate || t.dueDate);
  const undatedTasks = allTasks.filter((t) => !t.startDate && !t.dueDate);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const dates = [today];
    tasksWithDates.forEach((t) => {
      if (t.startDate) dates.push(new Date(t.startDate));
      if (t.dueDate) dates.push(new Date(t.dueDate));
    });
    (project.milestones || []).forEach((m) => dates.push(new Date(m.date)));
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    return {
      rangeStart: new Date(min.getTime() - 7 * DAY_MS),
      rangeEnd: new Date(max.getTime() + 14 * DAY_MS),
    };
  }, [project]);

  const totalDays = Math.max(1, Math.round((rangeEnd - rangeStart) / DAY_MS));

  function positionOf(date) {
    const d = toDate(date);
    if (!d) return 0;
    return Math.max(0, Math.min(100, ((d - rangeStart) / DAY_MS / totalDays) * 100));
  }

  // Graduations mensuelles
  const monthTicks = useMemo(() => {
    const ticks = [];
    const cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (cur <= rangeEnd) {
      ticks.push({
        label: cur.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }),
        pos: positionOf(cur),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return ticks;
  }, [rangeStart, rangeEnd, totalDays]);

  // Groupes par lot, tries par ordre de lot puis date de debut
  const groups = useMemo(() => {
    const visible = filterLot === "ALL" ? tasksWithDates : tasksWithDates.filter((t) => (filterLot === "" ? !t.lotId : t.lotId === filterLot));
    const byLot = {};
    for (const t of visible) {
      const key = t.lotId || "none";
      (byLot[key] = byLot[key] || []).push(t);
    }
    const sortTasks = (arr) =>
      arr.sort((a, b) => new Date(a.startDate || a.dueDate) - new Date(b.startDate || b.dueDate));
    const res = [];
    for (const lot of [...lots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      if (byLot[lot.id]) res.push({ key: lot.id, label: `${lot.code} - ${lot.name}`, tasks: sortTasks(byLot[lot.id]) });
    }
    if (byLot.none) res.push({ key: "none", label: "Sans lot", tasks: sortTasks(byLot.none) });
    return res;
  }, [tasksWithDates, filterLot, lots]);

  function isDone(task) {
    const col = columnById[task.columnId];
    return col ? DONE_COLUMN_RE.test(col.name) : false;
  }

  function isLate(task) {
    return !isDone(task) && task.dueDate && new Date(task.dueDate) < today;
  }

  // ----- Dependances entre taches -----
  const taskById = Object.fromEntries(allTasks.map((t) => [t.id, t]));

  // Toutes les taches qui dependent (directement ou en cascade) d'une tache donnee
  function dependentsOf(taskId) {
    const result = [];
    const seen = new Set([taskId]);
    const queue = [taskId];
    while (queue.length) {
      const cur = queue.shift();
      for (const t of allTasks) {
        if ((t.dependsOnIds || []).includes(cur) && !seen.has(t.id)) {
          seen.add(t.id);
          result.push(t);
          queue.push(t.id);
        }
      }
    }
    return result;
  }

  // Conflit : la tache demarre avant la fin d'une de ses dependances (non terminee)
  function conflictsOf(t) {
    const ref = t.startDate || t.dueDate;
    if (!ref) return [];
    return (t.dependsOnIds || [])
      .map((id) => taskById[id])
      .filter((dep) => dep && !isDone(dep) && dep.dueDate && new Date(ref) < new Date(dep.dueDate));
  }
  const allConflicts = allTasks.map((t) => ({ t, deps: conflictsOf(t) })).filter((x) => x.deps.length > 0);

  // Apres un deplacement de "task" de deltaDays : propose de decaler aussi ses dependantes
  async function cascadeShift(task, deltaDays) {
    if (!deltaDays) return;
    const deps = dependentsOf(task.id).filter((t) => t.startDate || t.dueDate);
    if (!deps.length) return;
    const list = deps.map((d) => `- ${d.title}`).slice(0, 8).join("\n");
    if (
      !confirm(
        `${deps.length} tache(s) dependent de "${task.title}".\nLes decaler aussi de ${deltaDays > 0 ? "+" : ""}${deltaDays} jour(s) ?\n${list}${deps.length > 8 ? "\n..." : ""}`
      )
    )
      return;
    // Un seul appel : le serveur decale toute la chaine dans une transaction atomique
    await client.patch(`/tasks/${task.id}/shift-dependents`, { days: deltaDays });
  }

  // ----- Drag des barres (deplacer = toute la barre, redimensionner = poignee droite) -----
  function startDrag(e, task, mode) {
    e.preventDefault();
    e.stopPropagation();
    const barArea = e.currentTarget.closest("[data-bararea]");
    if (!barArea) return;
    setDrag({
      taskId: task.id,
      mode,
      startX: e.clientX,
      pxPerDay: barArea.offsetWidth / totalDays,
      days: 0,
      task,
    });
  }

  useEffect(() => {
    if (!drag) return;
    function onMove(e) {
      const days = Math.round((e.clientX - drag.startX) / drag.pxPerDay);
      setDrag((d) => (d && d.days !== days ? { ...d, days } : d));
    }
    async function onUp(e) {
      const days = Math.round((e.clientX - drag.startX) / drag.pxPerDay);
      const t = drag.task;
      setDrag(null);
      if (days === 0) {
        // simple clic -> editeur de dates
        setEditingTask({ id: t.id, title: t.title, startDate: toInputDate(t.startDate), dueDate: toInputDate(t.dueDate) });
        return;
      }
      const patch = {};
      if (drag.mode === "move") {
        if (t.startDate) patch.startDate = toInputDate(shiftDate(t.startDate, days));
        if (t.dueDate) patch.dueDate = toInputDate(shiftDate(t.dueDate, days));
      } else {
        // redimensionnement : uniquement l'echeance, jamais avant le debut
        const newDue = shiftDate(t.dueDate || t.startDate, days);
        if (t.startDate && newDue < new Date(t.startDate)) return;
        patch.dueDate = toInputDate(newDue);
      }
      await client.put(`/tasks/${t.id}`, patch);
      await cascadeShift(t, days); // propose de decaler aussi les taches dependantes
      onChange();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, onChange]);

  function displayDates(task) {
    // dates affichees, decalees en direct pendant un drag
    let { startDate, dueDate } = task;
    if (drag && drag.taskId === task.id && drag.days !== 0) {
      if (drag.mode === "move") {
        startDate = startDate ? shiftDate(startDate, drag.days) : null;
        dueDate = dueDate ? shiftDate(dueDate, drag.days) : null;
      } else {
        dueDate = shiftDate(dueDate || startDate, drag.days);
      }
    }
    return { startDate, dueDate };
  }

  async function saveEditingTask(e) {
    e.preventDefault();
    const orig = taskById[editingTask.id];
    await client.put(`/tasks/${editingTask.id}`, {
      startDate: editingTask.startDate || null,
      dueDate: editingTask.dueDate || null,
    });
    // cascade : delta calcule sur la date de reference (debut, sinon echeance)
    if (orig) {
      const oldRef = orig.startDate || orig.dueDate;
      const newRef = editingTask.startDate || editingTask.dueDate;
      if (oldRef && newRef) {
        const delta = Math.round((new Date(newRef) - new Date(toInputDate(oldRef))) / DAY_MS);
        await cascadeShift(orig, delta);
      }
    }
    setEditingTask(null);
    onChange();
  }

  async function handleAddTask(e) {
    e.preventDefault();
    if (!taskForm.title || !taskForm.columnId) return;
    await client.post("/tasks", {
      projectId: project.id,
      columnId: taskForm.columnId,
      title: taskForm.title,
      lotId: taskForm.lotId || null,
      startDate: taskForm.startDate || null,
      dueDate: taskForm.dueDate || null,
    });
    setTaskForm({ ...taskForm, title: "", startDate: "", dueDate: "" });
    onChange();
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

  const todayPos = positionOf(today);
  const shortDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "?");

  return (
    <div className="space-y-8 select-none">
      {/* Barre d'actions */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-slate-300 overflow-hidden mr-2">
            <button
              onClick={() => setMode("semaines")}
              className={`px-3 py-1.5 text-sm ${mode === "semaines" ? "bg-brand-600 text-white" : "bg-white text-slate-600"}`}
            >
              Semaines
            </button>
            <button
              onClick={() => setMode("gantt")}
              className={`px-3 py-1.5 text-sm ${mode === "gantt" ? "bg-brand-600 text-white" : "bg-white text-slate-600"}`}
            >
              Vue globale
            </button>
          </div>
          <select value={filterLot} onChange={(e) => setFilterLot(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
            <option value="ALL">Tous les lots</option>
            <option value="">Sans lot</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </select>
          <span className="flex items-center gap-3 text-xs text-slate-500 ml-2">
            <span className="flex items-center gap-1"><i className="inline-block w-3 h-2 rounded-sm bg-brand-500" /> en cours</span>
            <span className="flex items-center gap-1"><i className="inline-block w-3 h-2 rounded-sm bg-green-500" /> termine</span>
            <span className="flex items-center gap-1"><i className="inline-block w-3 h-2 rounded-sm bg-red-500" /> en retard</span>
          </span>
        </div>
        <button onClick={() => setShowTaskForm((v) => !v)} className="bg-brand-600 text-white text-sm px-4 py-1.5 rounded-md">
          {showTaskForm ? "Fermer" : "+ Ajouter une tache"}
        </button>
      </div>

      {showTaskForm && (
        <form onSubmit={handleAddTask} className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap gap-2 items-end">
          <input
            autoFocus
            required
            placeholder="Titre de la tache"
            value={taskForm.title}
            onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
            className="flex-1 min-w-[180px] border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <select required value={taskForm.columnId} onChange={(e) => setTaskForm({ ...taskForm, columnId: e.target.value })} className="border border-slate-300 rounded-md px-2 py-2 text-sm">
            <option value="">Colonne...</option>
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={taskForm.lotId} onChange={(e) => setTaskForm({ ...taskForm, lotId: e.target.value })} className="border border-slate-300 rounded-md px-2 py-2 text-sm">
            <option value="">Sans lot</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </select>
          <label className="text-xs text-slate-500">
            Debut
            <input type="date" value={taskForm.startDate} onChange={(e) => setTaskForm({ ...taskForm, startDate: e.target.value })} className="block border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-slate-500">
            Echeance
            <input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} className="block border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="bg-brand-600 text-white text-sm px-4 py-2 rounded-md">
            Ajouter
          </button>
        </form>
      )}

      {/* Conflits de dependances : une tache demarre avant la fin d'une tache dont elle depend */}
      {allConflicts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-red-700 mb-1">
            ⛓ {allConflicts.length} conflit(s) de dependances a resoudre :
          </p>
          {allConflicts.slice(0, 6).map(({ t, deps }) => (
            <p key={t.id} className="text-xs text-red-600">
              « {t.title} » ({shortDate(t.startDate || t.dueDate)}) demarre avant la fin de{" "}
              {deps.map((d) => `« ${d.title} » (${shortDate(d.dueDate)})`).join(", ")}
            </p>
          ))}
          {allConflicts.length > 6 && <p className="text-xs text-red-400">... et {allConflicts.length - 6} autre(s)</p>}
        </div>
      )}

      {/* Editeur de dates (ouvert au clic sur une barre ou une tache sans dates) */}
      {editingTask && (
        <form onSubmit={saveEditingTask} className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-wrap gap-3 items-end">
          <div className="text-sm font-medium flex-1 min-w-[180px]">{editingTask.title}</div>
          <label className="text-xs text-slate-500">
            Debut
            <input type="date" value={editingTask.startDate} onChange={(e) => setEditingTask({ ...editingTask, startDate: e.target.value })} className="block border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-slate-500">
            Echeance
            <input type="date" value={editingTask.dueDate} onChange={(e) => setEditingTask({ ...editingTask, dueDate: e.target.value })} className="block border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="bg-brand-600 text-white text-sm px-4 py-2 rounded-md">
            Enregistrer
          </button>
          <button type="button" onClick={() => setEditingTask(null)} className="text-sm px-3 py-2 rounded-md border border-slate-300">
            Annuler
          </button>
        </form>
      )}

      {/* Vue Semaines (lookahead chantier) : grille semaines x lots, cartes glissables */}
      {mode === "semaines" && (() => {
        const weeks = [0, 1, 2, 3].map((i) => {
          const start = mondayOf(today);
          start.setDate(start.getDate() + (weekOffset + i) * 7);
          const end = new Date(start.getTime() + 6 * DAY_MS);
          return { start, end, iso: isoWeek(start) };
        });
        const isCurrentWeek = (w) => mondayOf(today).getTime() === w.start.getTime();
        const fmtRange = (w) =>
          `${w.start.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} - ${w.end.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;

        const visibleLots = [...lots]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .filter((l) => filterLot === "ALL" || filterLot === l.id);
        const rows = [
          ...visibleLots.map((l) => ({ key: l.id, lotId: l.id, label: l.code, title: l.name })),
          ...(filterLot === "ALL" || filterLot === "" ? [{ key: "none", lotId: null, label: "—", title: "Sans lot" }] : []),
        ];

        const tasksInWeek = (lotId, w) =>
          tasksWithDates
            .filter((t) => (t.lotId || null) === lotId)
            .filter((t) => {
              const s = new Date(t.startDate || t.dueDate);
              const e = new Date(t.dueDate || t.startDate);
              return s <= w.end && e >= w.start;
            })
            .sort((a, b) => new Date(a.startDate || a.dueDate) - new Date(b.startDate || b.dueDate));

        async function onDropInCell(e, row, w) {
          e.preventDefault();
          let payload;
          try {
            payload = JSON.parse(e.dataTransfer.getData("text/plain"));
          } catch {
            return;
          }
          const t = allTasks.find((x) => x.id === payload.taskId);
          if (!t) return;
          const deltaDays = Math.round((w.start.getTime() - payload.fromWeek) / DAY_MS);
          const patch = {};
          if (deltaDays !== 0) {
            if (t.startDate) patch.startDate = toInputDate(shiftDate(t.startDate, deltaDays));
            if (t.dueDate) patch.dueDate = toInputDate(shiftDate(t.dueDate, deltaDays));
          }
          if ((t.lotId || null) !== row.lotId) patch.lotId = row.lotId;
          if (Object.keys(patch).length === 0) return;
          await client.put(`/tasks/${t.id}`, patch);
          await cascadeShift(t, deltaDays); // propose de decaler aussi les taches dependantes
          onChange();
        }

        async function submitCellAdd(e) {
          e.preventDefault();
          if (!cellTitle.trim() || !columns.length) return;
          const monday = new Date(cellAdd.weekStart);
          await client.post("/tasks", {
            projectId: project.id,
            columnId: columns[0].id,
            title: cellTitle.trim(),
            lotId: cellAdd.lotKey === "none" ? null : cellAdd.lotKey,
            startDate: toInputDate(monday),
            dueDate: toInputDate(new Date(monday.getTime() + 4 * DAY_MS)),
          });
          setCellTitle("");
          onChange(); // reste en mode ajout pour enchainer
        }

        return (
          <div className="bg-white border border-slate-200 rounded-lg p-4 overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setWeekOffset((o) => o - 1)} className="px-2 py-1 text-sm border border-slate-300 rounded-md hover:bg-slate-50">
                  ← Sem. préc.
                </button>
                <button onClick={() => setWeekOffset(0)} className={`px-3 py-1 text-sm rounded-md ${weekOffset === 0 ? "text-slate-400" : "text-brand-600 font-medium"}`}>
                  Aujourd'hui
                </button>
                <button onClick={() => setWeekOffset((o) => o + 1)} className="px-2 py-1 text-sm border border-slate-300 rounded-md hover:bg-slate-50">
                  Sem. suiv. →
                </button>
              </div>

              <div className="grid gap-1.5" style={{ gridTemplateColumns: "110px repeat(4, 1fr)" }}>
                <div />
                {weeks.map((w) => (
                  <div key={w.iso + "-" + w.start} className={`text-center text-xs py-1 rounded-md ${isCurrentWeek(w) ? "bg-brand-50 text-brand-700 font-semibold" : "text-slate-500"}`}>
                    <div>Semaine {w.iso}{isCurrentWeek(w) ? " · en cours" : ""}</div>
                    <div className="text-[10px] text-slate-400">{fmtRange(w)}</div>
                  </div>
                ))}

                {rows.map((row) => (
                  <div key={row.key} className="contents">
                    <div className="text-xs font-semibold text-slate-600 pt-2 truncate" title={row.title}>
                      {row.label}
                      <div className="text-[10px] font-normal text-slate-400 truncate">{row.title}</div>
                    </div>
                    {weeks.map((w) => {
                      const cellTasks = tasksInWeek(row.lotId, w);
                      const adding = cellAdd && cellAdd.lotKey === row.key && cellAdd.weekStart === w.start.getTime();
                      return (
                        <div
                          key={row.key + w.start}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => onDropInCell(e, row, w)}
                          className={`rounded-md border p-1 min-h-[52px] space-y-1 ${isCurrentWeek(w) ? "border-brand-200 bg-brand-50/40" : "border-slate-100 bg-slate-50/60"}`}
                        >
                          {cellTasks.map((t) => {
                            const color = isDone(t)
                              ? "bg-green-100 text-green-800 border-green-200"
                              : isLate(t)
                                ? "bg-red-100 text-red-700 border-red-200"
                                : "bg-blue-100 text-blue-800 border-blue-200";
                            return (
                              <div
                                key={t.id}
                                draggable
                                onDragStart={(e) =>
                                  e.dataTransfer.setData("text/plain", JSON.stringify({ taskId: t.id, fromWeek: w.start.getTime() }))
                                }
                                onClick={() =>
                                  setEditingTask({ id: t.id, title: t.title, startDate: toInputDate(t.startDate), dueDate: toInputDate(t.dueDate) })
                                }
                                className={`text-[11px] leading-tight border rounded px-1.5 py-1 cursor-grab active:cursor-grabbing ${color} ${conflictsOf(t).length ? "ring-1 ring-red-500" : ""}`}
                                title={`${t.title}\n${shortDate(t.startDate)} → ${shortDate(t.dueDate)}${conflictsOf(t).length ? "\nCONFLIT : demarre avant la fin d'une dependance" : ""} — glisse vers une autre semaine, clic pour éditer`}
                              >
                                {conflictsOf(t).length > 0 ? "⛓ " : ""}
                                {t.title}
                              </div>
                            );
                          })}
                          {adding ? (
                            <form onSubmit={submitCellAdd}>
                              <input
                                autoFocus
                                value={cellTitle}
                                onChange={(e) => setCellTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") {
                                    setCellAdd(null);
                                    setCellTitle("");
                                  }
                                }}
                                onBlur={() => {
                                  if (!cellTitle.trim()) setCellAdd(null);
                                }}
                                placeholder="Titre + Entrée"
                                className="w-full text-[11px] border border-brand-300 rounded px-1 py-0.5"
                              />
                            </form>
                          ) : (
                            <button
                              onClick={() => {
                                setCellAdd({ lotKey: row.key, weekStart: w.start.getTime() });
                                setCellTitle("");
                              }}
                              className="w-full text-[11px] text-slate-300 hover:text-brand-600 text-center rounded border border-dashed border-transparent hover:border-brand-300"
                              title="Ajouter une tâche cette semaine"
                            >
                              +
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Gantt (vue globale) */}
      {mode === "gantt" && (tasksWithDates.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune tache avec des dates. Ajoute une tache ci-dessus ou date les taches existantes.</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg p-4 overflow-x-auto">
          <div className="min-w-[720px]">
            {/* Echelle des mois */}
            <div className="flex items-center gap-3 mb-1">
              <div className="w-48 flex-shrink-0" />
              <div className="relative flex-1 h-6" data-bararea>
                {monthTicks.map((tick, i) => (
                  <div key={i} className="absolute top-0 h-full border-l border-slate-200 text-[10px] text-slate-400 pl-1" style={{ left: `${tick.pos}%` }}>
                    {tick.label}
                  </div>
                ))}
                <div className="absolute top-0 h-full border-l-2 border-red-400" style={{ left: `${todayPos}%` }} title="Aujourd'hui" />
              </div>
              <div className="w-24 flex-shrink-0" />
            </div>

            {groups.map((group) => (
              <div key={group.key} className="mb-2">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide py-1">{group.label}</div>
                {group.tasks.map((t) => {
                  const d = displayDates(t);
                  const start = d.startDate ? positionOf(d.startDate) : positionOf(d.dueDate);
                  const end = d.dueDate ? positionOf(d.dueDate) : positionOf(d.startDate) + 1.5;
                  const width = Math.max(1.5, end - start);
                  const color = isDone(t) ? "bg-green-500" : isLate(t) ? "bg-red-500" : "bg-brand-500";
                  const dragging = drag && drag.taskId === t.id;
                  const conflict = conflictsOf(t).length > 0;
                  return (
                    <div key={t.id} className="flex items-center gap-3 py-1 group/row">
                      <div
                        className="w-48 flex-shrink-0 text-sm truncate cursor-pointer hover:text-brand-600"
                        title={`${t.title} — clic pour modifier les dates`}
                        onClick={() => setEditingTask({ id: t.id, title: t.title, startDate: toInputDate(t.startDate), dueDate: toInputDate(t.dueDate) })}
                      >
                        {t.title}
                      </div>
                      <div className="relative flex-1 h-6 bg-slate-50 rounded" data-bararea>
                        {monthTicks.map((tick, i) => (
                          <div key={i} className="absolute top-0 h-full border-l border-slate-100" style={{ left: `${tick.pos}%` }} />
                        ))}
                        <div className="absolute top-0 h-full border-l-2 border-red-300" style={{ left: `${todayPos}%` }} />
                        <div
                          className={`absolute top-0.5 h-5 rounded ${color} ${dragging ? "opacity-80 ring-2 ring-brand-300" : conflict ? "ring-2 ring-red-500" : ""} cursor-grab active:cursor-grabbing`}
                          style={{ left: `${start}%`, width: `${width}%` }}
                          onPointerDown={(e) => startDrag(e, t, "move")}
                          title={`${shortDate(d.startDate)} → ${shortDate(d.dueDate)}${conflict ? " — CONFLIT : demarre avant la fin d'une dependance" : ""} — glisse pour deplacer, clic pour editer`}
                        >
                          <div
                            className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r bg-black/20 opacity-0 group-hover/row:opacity-100"
                            onPointerDown={(e) => startDrag(e, t, "end")}
                            title="Glisse pour changer l'echeance"
                          />
                        </div>
                      </div>
                      <div className={`w-24 flex-shrink-0 text-[11px] text-right ${isLate(t) ? "text-red-600 font-medium" : "text-slate-400"}`}>
                        {shortDate(d.startDate)} → {shortDate(d.dueDate)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Taches sans dates : a dater en 1 clic */}
      {undatedTasks.length > 0 && (
        <div>
          <button onClick={() => setShowUndated((v) => !v)} className="text-sm text-slate-500 hover:text-brand-600">
            {showUndated ? "▾" : "▸"} {undatedTasks.length} tache(s) sans dates — clique pour les dater
          </button>
          {showUndated && (
            <ul className="mt-2 space-y-1">
              {undatedTasks.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setEditingTask({ id: t.id, title: t.title, startDate: "", dueDate: "" })}
                    className="w-full text-left text-sm bg-white border border-slate-200 rounded-md px-3 py-1.5 hover:border-brand-400 flex justify-between"
                  >
                    <span className="truncate">{t.title}</span>
                    <span className="text-xs text-slate-400 flex-shrink-0 ml-2">
                      {t.lotId && lotById[t.lotId] ? lotById[t.lotId].code : ""} · {columnById[t.columnId]?.name || ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Jalons */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Jalons</h3>
          <button onClick={() => setShowMilestoneForm((v) => !v)} className="text-sm text-brand-600 font-medium">
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

        {(project.milestones || []).length === 0 ? (
          <p className="text-sm text-slate-500">Aucun jalon defini.</p>
        ) : (
          <ul className="space-y-2">
            {[...project.milestones]
              .sort((a, b) => new Date(a.date) - new Date(b.date))
              .map((m) => {
                const late = !m.done && new Date(m.date) < today;
                return (
                  <li key={m.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-md px-4 py-2">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={m.done} onChange={() => toggleMilestone(m)} />
                      <span className={m.done ? "line-through text-slate-400" : late ? "text-red-600 font-medium" : ""}>{m.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className={late ? "text-red-600 font-medium" : "text-slate-500"}>{new Date(m.date).toLocaleDateString("fr-FR")}</span>
                      <button onClick={() => deleteMilestone(m.id)} className="text-slate-400 hover:text-red-500">
                        ✕
                      </button>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </div>
  );
}
