import { useEffect, useMemo, useState } from "react";
import client from "../api/client";

// Planning v3 — trois niveaux de zoom sur une echelle en JOURS ENTIERS (exacte, sans decalage) :
//  - "jour"     : la semaine en 7 colonnes, cartes par jour, glisser d'un jour a l'autre
//  - "semaines" : lookahead chantier 4 semaines x lots (cartes glissables)
//  - "gantt"    : vue globale avec graduations mois/semaines exactes, fleches de dependances
//                 (mode "lier" facon Notion : bouton chaine puis clic sur la tache cible)

const DAY_MS = 24 * 60 * 60 * 1000;
const DONE_COLUMN_RE = /termin|fini|done|recept|reçu|clôtur|clotur/i;

// Normalise n'importe quelle date (ISO UTC, Date, yyyy-mm-dd) en minuit LOCAL — supprime
// les decalages de fuseau qui faisaient bouger les axes d'un jour.
function toDay(v) {
  const d = new Date(v);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(day, n) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + n);
}
function diffDays(a, b) {
  return Math.round((toDay(a) - toDay(b)) / DAY_MS); // round : robuste aux changements d'heure
}
function toInputDate(d) {
  if (!d) return "";
  const x = toDay(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
function mondayOf(d) {
  const x = toDay(d);
  return addDays(x, -((x.getDay() + 6) % 7));
}
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - firstThursday) / DAY_MS - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}
const shortDate = (d) => (d ? toDay(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "?");

export default function PlanningView({ project, onChange, initialMode }) {
  const [mode, setMode] = useState(initialMode || "semaines"); // "jour" | "semaines" | "gantt"
  const [weekOffset, setWeekOffset] = useState(0);
  const [filterLot, setFilterLot] = useState("ALL");
  const [editingTask, setEditingTask] = useState(null);
  const [cellAdd, setCellAdd] = useState(null); // { key, date | weekStart, lotId }
  const [cellTitle, setCellTitle] = useState("");
  const [linkSource, setLinkSource] = useState(null); // tache source du mode "lier"
  const [showUndated, setShowUndated] = useState(false);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState({ name: "", date: "" });

  const lots = project.lots || [];
  const columns = project.columns || [];
  const allTasks = project.tasks || [];
  const lotById = Object.fromEntries(lots.map((l) => [l.id, l]));
  const columnById = Object.fromEntries(columns.map((c) => [c.id, c]));
  const taskById = Object.fromEntries(allTasks.map((t) => [t.id, t]));
  const today = toDay(new Date());

  const tasksWithDates = allTasks.filter((t) => t.startDate || t.dueDate);
  const undatedTasks = allTasks.filter((t) => !t.startDate && !t.dueDate);
  const visibleTasks =
    filterLot === "ALL" ? tasksWithDates : tasksWithDates.filter((t) => (filterLot === "" ? !t.lotId : t.lotId === filterLot));

  const isDone = (t) => (columnById[t.columnId] ? DONE_COLUMN_RE.test(columnById[t.columnId].name) : false);
  const isLate = (t) => !isDone(t) && t.dueDate && toDay(t.dueDate) < today;
  const taskStart = (t) => toDay(t.startDate || t.dueDate);
  const taskEnd = (t) => toDay(t.dueDate || t.startDate);

  // ----- Dependances -----
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
  function conflictsOf(t) {
    const ref = t.startDate || t.dueDate;
    if (!ref) return [];
    return (t.dependsOnIds || [])
      .map((id) => taskById[id])
      .filter((dep) => dep && !isDone(dep) && dep.dueDate && toDay(ref) < toDay(dep.dueDate));
  }
  const allConflicts = allTasks.map((t) => ({ t, deps: conflictsOf(t) })).filter((x) => x.deps.length > 0);

  async function cascadeShift(task, deltaDays) {
    if (!deltaDays) return;
    const deps = dependentsOf(task.id).filter((t) => t.startDate || t.dueDate);
    if (!deps.length) return;
    const list = deps.slice(0, 8).map((d) => `- ${d.title}`).join("\n");
    if (!confirm(`${deps.length} tache(s) dependent de "${task.title}".\nLes decaler aussi de ${deltaDays > 0 ? "+" : ""}${deltaDays} jour(s) ?\n${list}${deps.length > 8 ? "\n..." : ""}`)) return;
    await client.patch(`/tasks/${task.id}/shift-dependents`, { days: deltaDays });
  }

  async function moveTask(t, deltaDays, newLotId) {
    const patch = {};
    if (deltaDays) {
      if (t.startDate) patch.startDate = toInputDate(addDays(toDay(t.startDate), deltaDays));
      if (t.dueDate) patch.dueDate = toInputDate(addDays(toDay(t.dueDate), deltaDays));
    }
    if (newLotId !== undefined && (t.lotId || null) !== newLotId) patch.lotId = newLotId;
    if (!Object.keys(patch).length) return;
    await client.put(`/tasks/${t.id}`, patch);
    if (deltaDays) await cascadeShift(t, deltaDays);
    onChange();
  }

  async function linkTasks(sourceId, targetId) {
    // source doit etre terminee avant target : target depend de source
    const target = taskById[targetId];
    if (!target || sourceId === targetId) return;
    if (dependentsOf(targetId).some((d) => d.id === sourceId)) {
      alert("Impossible : cela creerait une boucle de dependances.");
      return;
    }
    const deps = new Set(target.dependsOnIds || []);
    deps.add(sourceId);
    await client.put(`/tasks/${targetId}`, { dependsOnIds: [...deps] });
    setLinkSource(null);
    onChange();
  }

  async function unlink(taskId, depId) {
    const t = taskById[taskId];
    if (!t) return;
    if (!confirm(`Supprimer la dependance « ${taskById[depId]?.title || "?"} » → « ${t.title} » ?`)) return;
    await client.put(`/tasks/${taskId}`, { dependsOnIds: (t.dependsOnIds || []).filter((x) => x !== depId) });
    onChange();
  }

  useEffect(() => {
    if (!linkSource) return;
    const onKey = (e) => e.key === "Escape" && setLinkSource(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [linkSource]);

  async function saveEditingTask(e) {
    e.preventDefault();
    const orig = taskById[editingTask.id];
    await client.put(`/tasks/${editingTask.id}`, {
      startDate: editingTask.startDate || null,
      dueDate: editingTask.dueDate || null,
    });
    if (orig) {
      const oldRef = orig.startDate || orig.dueDate;
      const newRef = editingTask.startDate || editingTask.dueDate;
      if (oldRef && newRef) await cascadeShift(orig, diffDays(newRef, oldRef));
    }
    setEditingTask(null);
    onChange();
  }

  async function quickAdd(e, { date, endDate, lotId }) {
    e.preventDefault();
    if (!cellTitle.trim() || !columns.length) return;
    await client.post("/tasks", {
      projectId: project.id,
      columnId: columns[0].id,
      title: cellTitle.trim(),
      lotId: lotId || null,
      startDate: toInputDate(date),
      dueDate: toInputDate(endDate || date),
    });
    setCellTitle("");
    onChange();
  }

  const openEditor = (t) =>
    setEditingTask({ id: t.id, title: t.title, startDate: toInputDate(t.startDate), dueDate: toInputDate(t.dueDate) });

  const chipColor = (t) =>
    isDone(t) ? "bg-green-100 text-green-800 border-green-200" : isLate(t) ? "bg-red-100 text-red-700 border-red-200" : "bg-blue-100 text-blue-800 border-blue-200";

  function onDragStartChip(e, t, fromDay) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ taskId: t.id, fromDay: fromDay.getTime() }));
  }
  async function onDropDay(e, day, lotId) {
    e.preventDefault();
    let payload;
    try {
      payload = JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    const t = taskById[payload.taskId];
    if (!t) return;
    await moveTask(t, diffDays(day, new Date(payload.fromDay)), lotId);
  }

  // =====================================================================
  // VUE JOUR : 7 colonnes, cartes par jour couvert
  // =====================================================================
  function DayView() {
    const monday = addDays(mondayOf(today), weekOffset * 7);
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i));
    const tasksOnDay = (day) =>
      visibleTasks
        .filter((t) => taskStart(t) <= day && taskEnd(t) >= day)
        .sort((a, b) => taskStart(a) - taskStart(b));
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4 overflow-x-auto">
        <div className="min-w-[860px]">
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((day) => {
              const isToday = day.getTime() === today.getTime();
              const weekend = day.getDay() === 0 || day.getDay() === 6;
              const dayTasks = tasksOnDay(day);
              const adding = cellAdd && cellAdd.key === `d${day.getTime()}`;
              return (
                <div
                  key={day.getTime()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropDay(e, day)}
                  className={`rounded-md border p-1.5 min-h-[160px] ${isToday ? "border-brand-300 bg-brand-50/50" : weekend ? "border-slate-100 bg-slate-50" : "border-slate-100"}`}
                >
                  <div className={`text-xs text-center mb-1.5 ${isToday ? "text-brand-700 font-semibold" : "text-slate-500"}`}>
                    {day.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                    {isToday ? " · auj." : ""}
                  </div>
                  <div className="space-y-1">
                    {dayTasks.map((t) => {
                      const isStart = taskStart(t).getTime() === day.getTime();
                      const isEnd = taskEnd(t).getTime() === day.getTime();
                      return (
                        <div
                          key={t.id}
                          draggable
                          onDragStart={(e) => onDragStartChip(e, t, day)}
                          onClick={() => (linkSource ? linkTasks(linkSource.id, t.id) : openEditor(t))}
                          className={`text-[11px] leading-tight border rounded px-1.5 py-1 cursor-grab active:cursor-grabbing ${chipColor(t)} ${linkSource && linkSource.id !== t.id ? "ring-1 ring-brand-400" : ""}`}
                          title={`${t.title}\n${shortDate(t.startDate)} → ${shortDate(t.dueDate)}${t.lotId && lotById[t.lotId] ? `\n${lotById[t.lotId].code}` : ""}`}
                        >
                          {!isStart && "… "}
                          {t.title}
                          {t.lotId && lotById[t.lotId] && <span className="opacity-60"> · {lotById[t.lotId].code}</span>}
                          {!isEnd && " …"}
                        </div>
                      );
                    })}
                    {adding ? (
                      <form onSubmit={(e) => quickAdd(e, { date: day, lotId: cellAdd.lotId })}>
                        <input
                          autoFocus
                          value={cellTitle}
                          onChange={(e) => setCellTitle(e.target.value)}
                          onKeyDown={(e) => e.key === "Escape" && (setCellAdd(null), setCellTitle(""))}
                          onBlur={() => !cellTitle.trim() && setCellAdd(null)}
                          placeholder="Titre + Entree"
                          className="w-full text-[11px] border border-brand-300 rounded px-1 py-0.5"
                        />
                      </form>
                    ) : (
                      <button
                        onClick={() => (setCellAdd({ key: `d${day.getTime()}` }), setCellTitle(""))}
                        className="w-full text-[11px] text-slate-300 hover:text-brand-600 rounded border border-dashed border-transparent hover:border-brand-300"
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // =====================================================================
  // VUE SEMAINES : lookahead 4 semaines x lots
  // =====================================================================
  function WeeksView() {
    const weeks = [0, 1, 2, 3].map((i) => {
      const start = addDays(mondayOf(today), (weekOffset + i) * 7);
      return { start, end: addDays(start, 6), iso: isoWeek(start) };
    });
    const isCurrentWeek = (w) => mondayOf(today).getTime() === w.start.getTime();
    const visibleLots = [...lots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).filter((l) => filterLot === "ALL" || filterLot === l.id);
    const rows = [
      ...visibleLots.map((l) => ({ key: l.id, lotId: l.id, label: l.code, title: l.name })),
      ...(filterLot === "ALL" || filterLot === "" ? [{ key: "none", lotId: null, label: "—", title: "Sans lot" }] : []),
    ];
    const tasksInWeek = (lotId, w) =>
      tasksWithDates
        .filter((t) => (t.lotId || null) === lotId && taskStart(t) <= w.end && taskEnd(t) >= w.start)
        .sort((a, b) => taskStart(a) - taskStart(b));
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4 overflow-x-auto">
        <div className="min-w-[760px] grid gap-1.5" style={{ gridTemplateColumns: "110px repeat(4, 1fr)" }}>
          <div />
          {weeks.map((w) => (
            <div key={w.start.getTime()} className={`text-center text-xs py-1 rounded-md ${isCurrentWeek(w) ? "bg-brand-50 text-brand-700 font-semibold" : "text-slate-500"}`}>
              <div>Semaine {w.iso}{isCurrentWeek(w) ? " · en cours" : ""}</div>
              <div className="text-[10px] text-slate-400">
                {w.start.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – {w.end.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
              </div>
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
                const adding = cellAdd && cellAdd.key === `w${row.key}-${w.start.getTime()}`;
                return (
                  <div
                    key={row.key + w.start.getTime()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onDropDay(e, w.start, row.lotId)}
                    className={`rounded-md border p-1 min-h-[52px] space-y-1 ${isCurrentWeek(w) ? "border-brand-200 bg-brand-50/40" : "border-slate-100 bg-slate-50/60"}`}
                  >
                    {cellTasks.map((t) => (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={(e) => onDragStartChip(e, t, mondayOf(taskStart(t)))}
                        onClick={() => (linkSource ? linkTasks(linkSource.id, t.id) : openEditor(t))}
                        className={`text-[11px] leading-tight border rounded px-1.5 py-1 cursor-grab active:cursor-grabbing ${chipColor(t)} ${conflictsOf(t).length ? "ring-1 ring-red-500" : ""}`}
                        title={`${t.title}\n${shortDate(t.startDate)} → ${shortDate(t.dueDate)} — glisse vers une autre semaine, clic pour editer`}
                      >
                        {conflictsOf(t).length > 0 ? "⛓ " : ""}
                        {t.title}
                      </div>
                    ))}
                    {adding ? (
                      <form onSubmit={(e) => quickAdd(e, { date: w.start, endDate: addDays(w.start, 4), lotId: row.lotId })}>
                        <input
                          autoFocus
                          value={cellTitle}
                          onChange={(e) => setCellTitle(e.target.value)}
                          onKeyDown={(e) => e.key === "Escape" && (setCellAdd(null), setCellTitle(""))}
                          onBlur={() => !cellTitle.trim() && setCellAdd(null)}
                          placeholder="Titre + Entree"
                          className="w-full text-[11px] border border-brand-300 rounded px-1 py-0.5"
                        />
                      </form>
                    ) : (
                      <button
                        onClick={() => (setCellAdd({ key: `w${row.key}-${w.start.getTime()}`, lotId: row.lotId }), setCellTitle(""))}
                        className="w-full text-[11px] text-slate-300 hover:text-brand-600 text-center rounded border border-dashed border-transparent hover:border-brand-300"
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
    );
  }

  // =====================================================================
  // VUE GANTT : echelle jours exacte + fleches de dependances
  // =====================================================================
  const LABEL_W = 192; // px de la colonne des titres
  const ROW_H = 26;
  const HEAD_H = 30;

  function GanttView() {
    const { rangeStart, totalDays, rows, arrows, monthTicks, weekTicks } = useMemo(() => {
      const dates = [today];
      visibleTasks.forEach((t) => {
        dates.push(taskStart(t), taskEnd(t));
      });
      (project.milestones || []).forEach((m) => dates.push(toDay(m.date)));
      let start = addDays(new Date(Math.min(...dates.map((d) => d.getTime()))), -4);
      let end = addDays(new Date(Math.max(...dates.map((d) => d.getTime()))), 10);
      const total = diffDays(end, start) + 1;

      // lignes : entetes de groupe + taches, index de ligne continu pour les fleches
      const byLot = {};
      for (const t of visibleTasks) (byLot[t.lotId || "none"] = byLot[t.lotId || "none"] || []).push(t);
      const rws = [];
      const sorted = (arr) => arr.sort((a, b) => taskStart(a) - taskStart(b));
      for (const lot of [...lots].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
        if (byLot[lot.id]) {
          rws.push({ type: "group", label: `${lot.code} — ${lot.name}` });
          sorted(byLot[lot.id]).forEach((t) => rws.push({ type: "task", t }));
        }
      }
      if (byLot.none) {
        rws.push({ type: "group", label: "Sans lot" });
        sorted(byLot.none).forEach((t) => rws.push({ type: "task", t }));
      }
      const rowIndexByTask = {};
      rws.forEach((r, i) => {
        if (r.type === "task") rowIndexByTask[r.t.id] = i;
      });

      // fleches : dep -> tache (les deux visibles)
      const arr = [];
      for (const r of rws) {
        if (r.type !== "task") continue;
        for (const depId of r.t.dependsOnIds || []) {
          if (rowIndexByTask[depId] === undefined) continue;
          const dep = taskById[depId];
          arr.push({
            fromX: diffDays(taskEnd(dep), start) + 1,
            fromY: rowIndexByTask[depId] + 0.5,
            toX: diffDays(taskStart(r.t), start),
            toY: rowIndexByTask[r.t.id] + 0.5,
            taskId: r.t.id,
            depId,
            conflict: conflictsOf(r.t).some((d) => d.id === depId),
          });
        }
      }

      // graduations exactes, generees UNIQUEMENT dans la plage (fini les etiquettes ecrasees a gauche)
      const months = [];
      for (let i = 0; i < total; i++) {
        const d = addDays(start, i);
        if (d.getDate() === 1 || i === 0) months.push({ idx: i, label: d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }) });
      }
      const weeks = [];
      for (let i = 0; i < total; i++) {
        const d = addDays(start, i);
        if (d.getDay() === 1 && i > 0) weeks.push({ idx: i, iso: isoWeek(d) });
      }
      return { rangeStart: start, totalDays: total, rows: rws, arrows: arr, monthTicks: months, weekTicks: weeks };
    }, [visibleTasks, project.milestones, filterLot]);

    const x = (dayIdx) => (dayIdx / totalDays) * 100;
    const todayIdx = diffDays(today, rangeStart);

    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4 overflow-x-auto">
        <div className="relative" style={{ minWidth: 760 }}>
          {/* entete : mois + semaines + aujourd'hui */}
          <div className="relative" style={{ marginLeft: LABEL_W, height: HEAD_H }}>
            {monthTicks.map((m) => (
              <div key={m.idx} className="absolute top-0 h-full border-l border-slate-300 pl-1 text-[10px] text-slate-500 font-medium" style={{ left: `${x(m.idx)}%` }}>
                {m.label}
              </div>
            ))}
            {weekTicks.map((w) => (
              <div key={w.idx} className="absolute bottom-0 h-3 border-l border-slate-200 pl-0.5 text-[8px] text-slate-300" style={{ left: `${x(w.idx)}%` }}>
                {w.iso}
              </div>
            ))}
            {(project.milestones || []).map((m) => {
              const idx = diffDays(toDay(m.date), rangeStart);
              if (idx < 0 || idx > totalDays) return null;
              return (
                <div key={m.id} className="absolute bottom-0 -translate-x-1/2 text-purple-600" style={{ left: `${x(idx)}%` }} title={`${m.name} — ${shortDate(m.date)}${m.done ? " (fait)" : ""}`}>
                  ◆
                </div>
              );
            })}
          </div>

          {/* corps : lignes + barres */}
          <div className="relative">
            {rows.map((r, i) =>
              r.type === "group" ? (
                <div key={i} className="flex items-center text-xs font-semibold text-slate-500 uppercase tracking-wide" style={{ height: ROW_H }}>
                  {r.label}
                </div>
              ) : (
                <div key={r.t.id} className="flex items-center group/row" style={{ height: ROW_H }}>
                  <div className="flex items-center gap-1 flex-shrink-0 pr-2" style={{ width: LABEL_W }}>
                    <button
                      onClick={() => setLinkSource(linkSource?.id === r.t.id ? null : r.t)}
                      title={linkSource?.id === r.t.id ? "Annuler la liaison" : "Lier : clique ensuite sur la tache qui doit ATTENDRE celle-ci"}
                      className={`text-[11px] flex-shrink-0 ${linkSource?.id === r.t.id ? "text-brand-600 font-bold" : "text-slate-300 opacity-0 group-hover/row:opacity-100 hover:text-brand-600"}`}
                    >
                      ⛓
                    </button>
                    <button
                      onClick={() => (linkSource ? linkTasks(linkSource.id, r.t.id) : openEditor(r.t))}
                      className={`text-xs truncate text-left hover:text-brand-600 ${linkSource && linkSource.id !== r.t.id ? "text-brand-700 underline" : ""}`}
                      title={t2title(r.t)}
                    >
                      {r.t.title}
                    </button>
                  </div>
                  <div className="relative flex-1 h-full">
                    <GanttBar t={r.t} />
                  </div>
                  <div className={`w-24 flex-shrink-0 text-[10px] text-right ${isLate(r.t) ? "text-red-600 font-medium" : "text-slate-400"}`}>
                    {shortDate(r.t.startDate)} → {shortDate(r.t.dueDate)}
                  </div>
                </div>
              )
            )}

            {/* grille + aujourd'hui + fleches en surcouche (coordonnees jours x lignes) */}
            <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: LABEL_W, right: 96 }}>
              {weekTicks.map((w) => (
                <div key={w.idx} className="absolute top-0 bottom-0 border-l border-slate-100" style={{ left: `${x(w.idx)}%` }} />
              ))}
              {monthTicks.map((m) => (
                <div key={m.idx} className="absolute top-0 bottom-0 border-l border-slate-200" style={{ left: `${x(m.idx)}%` }} />
              ))}
              {todayIdx >= 0 && todayIdx <= totalDays && (
                <div className="absolute top-0 bottom-0 border-l-2 border-red-400" style={{ left: `${x(todayIdx)}%` }} title="Aujourd'hui" />
              )}
              <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${totalDays} ${rows.length}`} preserveAspectRatio="none">
                {arrows.map((a, i) => {
                  const midX = Math.max(a.fromX + 0.4, Math.min(a.toX - 0.4, a.fromX + 1.2));
                  return (
                    <g key={i} className="pointer-events-auto cursor-pointer" onClick={() => unlink(a.taskId, a.depId)}>
                      <polyline
                        points={`${a.fromX},${a.fromY} ${midX},${a.fromY} ${midX},${a.toY} ${a.toX},${a.toY}`}
                        fill="none"
                        stroke={a.conflict ? "#dc2626" : "#94a3b8"}
                        strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke"
                      />
                      <circle cx={a.toX} cy={a.toY} r="0.28" fill={a.conflict ? "#dc2626" : "#64748b"} />
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>
    );

    function t2title(t) {
      const deps = (t.dependsOnIds || []).map((id) => taskById[id]?.title).filter(Boolean);
      return `${t.title}\n${shortDate(t.startDate)} → ${shortDate(t.dueDate)}${deps.length ? `\nDepend de : ${deps.join(", ")}` : ""}\nClic : editer les dates · ⛓ : lier une dependance`;
    }

    function GanttBar({ t }) {
      const s = diffDays(taskStart(t), rangeStart);
      const e = diffDays(taskEnd(t), rangeStart);
      const color = isDone(t) ? "bg-green-500" : isLate(t) ? "bg-red-500" : "bg-brand-500";
      const conflict = conflictsOf(t).length > 0;
      return (
        <div
          draggable
          onDragStart={(ev) => onDragStartChip(ev, t, taskStart(t))}
          onClick={() => (linkSource ? linkTasks(linkSource.id, t.id) : openEditor(t))}
          className={`absolute rounded ${color} ${conflict ? "ring-2 ring-red-500" : ""} cursor-grab active:cursor-grabbing hover:opacity-90`}
          style={{ left: `${x(s)}%`, width: `${Math.max(((e - s + 1) / totalDays) * 100, 0.6)}%`, top: 5, bottom: 5 }}
          title={t2title(t)}
        />
      );
    }
  }

  // barre de drop pour deplacer une barre du gantt : on droppe sur l'entete des jours ?
  // (le deplacement fin se fait via la vue Jour/Semaines ou l'editeur de dates)

  const NAVIGABLE = mode === "jour" || mode === "semaines";

  return (
    <div className="space-y-6 select-none">
      {/* Barre d'actions */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-slate-300 overflow-hidden">
            {[["jour", "Jour"], ["semaines", "Semaines"], ["gantt", "Vue globale"]].map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 text-sm ${mode === m ? "bg-brand-600 text-white" : "bg-white text-slate-600"}`}>
                {label}
              </button>
            ))}
          </div>
          {NAVIGABLE && (
            <div className="flex items-center gap-1">
              <button onClick={() => setWeekOffset((o) => o - 1)} className="px-2 py-1 text-sm border border-slate-300 rounded-md hover:bg-slate-50">←</button>
              <button onClick={() => setWeekOffset(0)} className={`px-2 py-1 text-sm rounded-md ${weekOffset === 0 ? "text-slate-400" : "text-brand-600 font-medium"}`}>
                Aujourd'hui
              </button>
              <button onClick={() => setWeekOffset((o) => o + 1)} className="px-2 py-1 text-sm border border-slate-300 rounded-md hover:bg-slate-50">→</button>
            </div>
          )}
          <select value={filterLot} onChange={(e) => setFilterLot(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
            <option value="ALL">Tous les lots</option>
            <option value="">Sans lot</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>{l.code}</option>
            ))}
          </select>
          <span className="hidden md:flex items-center gap-3 text-xs text-slate-500 ml-1">
            <span className="flex items-center gap-1"><i className="inline-block w-3 h-2 rounded-sm bg-brand-500" /> en cours</span>
            <span className="flex items-center gap-1"><i className="inline-block w-3 h-2 rounded-sm bg-green-500" /> termine</span>
            <span className="flex items-center gap-1"><i className="inline-block w-3 h-2 rounded-sm bg-red-500" /> retard</span>
          </span>
        </div>
        <button
          onClick={() => setEditingTask({ id: null, title: "", startDate: toInputDate(today), dueDate: toInputDate(today), isNew: true, columnId: columns[0]?.id, lotId: "" })}
          className="bg-brand-600 text-white text-sm px-4 py-1.5 rounded-md"
        >
          + Ajouter une tache
        </button>
      </div>

      {/* Mode lier actif */}
      {linkSource && (
        <div className="bg-brand-50 border border-brand-200 rounded-lg px-4 py-2 text-sm text-brand-800 flex items-center justify-between">
          <span>
            ⛓ Liaison : clique sur la tache qui doit attendre la fin de « <span className="font-medium">{linkSource.title}</span> » (Echap pour annuler)
          </span>
          <button onClick={() => setLinkSource(null)} className="text-brand-600 underline text-xs">annuler</button>
        </div>
      )}

      {/* Conflits de dependances */}
      {allConflicts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-red-700 mb-1">⛓ {allConflicts.length} conflit(s) de dependances :</p>
          {allConflicts.slice(0, 5).map(({ t, deps }) => (
            <p key={t.id} className="text-xs text-red-600">
              « {t.title} » ({shortDate(t.startDate || t.dueDate)}) demarre avant la fin de {deps.map((d) => `« ${d.title} » (${shortDate(d.dueDate)})`).join(", ")}
            </p>
          ))}
          {allConflicts.length > 5 && <p className="text-xs text-red-400">… et {allConflicts.length - 5} autre(s)</p>}
        </div>
      )}

      {/* Editeur de tache (dates / creation) */}
      {editingTask && (
        <form
          onSubmit={
            editingTask.isNew
              ? async (e) => {
                  e.preventDefault();
                  if (!editingTask.title.trim() || !editingTask.columnId) return;
                  await client.post("/tasks", {
                    projectId: project.id,
                    columnId: editingTask.columnId,
                    title: editingTask.title.trim(),
                    lotId: editingTask.lotId || null,
                    startDate: editingTask.startDate || null,
                    dueDate: editingTask.dueDate || null,
                  });
                  setEditingTask(null);
                  onChange();
                }
              : saveEditingTask
          }
          className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-wrap gap-3 items-end"
        >
          {editingTask.isNew ? (
            <>
              <input
                autoFocus
                required
                placeholder="Titre de la tache"
                value={editingTask.title}
                onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                className="flex-1 min-w-[160px] border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
              <select value={editingTask.columnId} onChange={(e) => setEditingTask({ ...editingTask, columnId: e.target.value })} className="border border-slate-300 rounded-md px-2 py-2 text-sm">
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select value={editingTask.lotId} onChange={(e) => setEditingTask({ ...editingTask, lotId: e.target.value })} className="border border-slate-300 rounded-md px-2 py-2 text-sm">
                <option value="">Sans lot</option>
                {lots.map((l) => (
                  <option key={l.id} value={l.id}>{l.code}</option>
                ))}
              </select>
            </>
          ) : (
            <div className="text-sm font-medium flex-1 min-w-[160px]">{editingTask.title}</div>
          )}
          <label className="text-xs text-slate-500">
            Debut
            <input type="date" value={editingTask.startDate} onChange={(e) => setEditingTask({ ...editingTask, startDate: e.target.value })} className="block border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-slate-500">
            Echeance
            <input type="date" value={editingTask.dueDate} onChange={(e) => setEditingTask({ ...editingTask, dueDate: e.target.value })} className="block border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="bg-brand-600 text-white text-sm px-4 py-2 rounded-md">
            {editingTask.isNew ? "Creer" : "Enregistrer"}
          </button>
          <button type="button" onClick={() => setEditingTask(null)} className="text-sm px-3 py-2 rounded-md border border-slate-300">
            Annuler
          </button>
        </form>
      )}

      {tasksWithDates.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune tache datee. Ajoute une tache ci-dessus ou date les taches existantes.</p>
      ) : mode === "jour" ? (
        DayView()
      ) : mode === "semaines" ? (
        WeeksView()
      ) : (
        GanttView()
      )}

      {/* Taches sans dates */}
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
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!milestoneForm.name || !milestoneForm.date) return;
              await client.post("/milestones", { projectId: project.id, ...milestoneForm });
              setMilestoneForm({ name: "", date: "" });
              setShowMilestoneForm(false);
              onChange();
            }}
            className="flex gap-2 mb-4 bg-white border border-slate-200 rounded-lg p-3"
          >
            <input placeholder="Nom du jalon" value={milestoneForm.name} onChange={(e) => setMilestoneForm({ ...milestoneForm, name: e.target.value })} className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm" />
            <input type="date" value={milestoneForm.date} onChange={(e) => setMilestoneForm({ ...milestoneForm, date: e.target.value })} className="border border-slate-300 rounded-md px-3 py-2 text-sm" />
            <button type="submit" className="bg-brand-600 text-white text-sm px-4 py-2 rounded-md">Ajouter</button>
          </form>
        )}
        {(project.milestones || []).length === 0 ? (
          <p className="text-sm text-slate-500">Aucun jalon defini.</p>
        ) : (
          <ul className="space-y-2">
            {[...project.milestones]
              .sort((a, b) => new Date(a.date) - new Date(b.date))
              .map((m) => {
                const late = !m.done && toDay(m.date) < today;
                return (
                  <li key={m.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-md px-4 py-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={m.done}
                        onChange={async () => {
                          await client.put(`/milestones/${m.id}`, { done: !m.done });
                          onChange();
                        }}
                      />
                      <span className={m.done ? "line-through text-slate-400" : late ? "text-red-600 font-medium" : ""}>{m.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className={late ? "text-red-600 font-medium" : "text-slate-500"}>{toDay(m.date).toLocaleDateString("fr-FR")}</span>
                      <button
                        onClick={async () => {
                          if (!confirm("Supprimer ce jalon ?")) return;
                          await client.delete(`/milestones/${m.id}`);
                          onChange();
                        }}
                        className="text-slate-400 hover:text-red-500"
                      >
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
