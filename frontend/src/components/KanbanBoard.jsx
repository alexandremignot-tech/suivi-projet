import { useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import client from "../api/client";
import TaskModal from "./TaskModal";

const PRIORITY_COLORS = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

const DONE_COLUMN_RE = /termin|fini|done|recept|reçu|clôtur|clotur/i;

export default function KanbanBoard({ project, members, onChange }) {
  const [modalState, setModalState] = useState(null); // { columnId } or { task }
  const [newColumnName, setNewColumnName] = useState("");
  const [addingColumn, setAddingColumn] = useState(false);
  const [quickAddColumn, setQuickAddColumn] = useState(null); // columnId de la colonne en ajout rapide
  const [quickTitle, setQuickTitle] = useState("");

  async function handleQuickAdd(e, columnId) {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    await client.post("/tasks", { projectId: project.id, columnId, title: quickTitle.trim() });
    setQuickTitle("");
    onChange(); // reste en mode ajout rapide pour enchainer les taches
  }

  const tasksByColumn = {};
  for (const col of project.columns) {
    tasksByColumn[col.id] = project.tasks
      .filter((t) => t.columnId === col.id)
      .sort((a, b) => a.order - b.order);
  }

  async function handleDragEnd(result) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    await client.patch(`/tasks/${draggableId}/move`, {
      columnId: destination.droppableId,
      order: destination.index,
    });
    onChange();
  }

  async function handleAddColumn(e) {
    e.preventDefault();
    if (!newColumnName.trim()) return;
    await client.post("/columns", { projectId: project.id, name: newColumnName });
    setNewColumnName("");
    setAddingColumn(false);
    onChange();
  }

  async function handleDeleteColumn(columnId) {
    if (!confirm("Supprimer cette colonne et ses taches ?")) return;
    await client.delete(`/columns/${columnId}`);
    onChange();
  }

  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
  const lotById = Object.fromEntries((project.lots || []).map((l) => [l.id, l]));
  const taskById = Object.fromEntries(project.tasks.map((t) => [t.id, t]));
  const columnById = Object.fromEntries(project.columns.map((c) => [c.id, c]));
  const isTaskDone = (t) => {
    const col = columnById[t.columnId];
    return col ? DONE_COLUMN_RE.test(col.name) : false;
  };
  // Dependances non terminees d'une tache -> la tache est "bloquee"
  const blockingDeps = (t) =>
    (t.dependsOnIds || [])
      .map((id) => taskById[id])
      .filter((dep) => dep && !isTaskDone(dep));

  return (
    <div>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {project.columns.map((col) => (
            <div key={col.id} className="w-72 flex-shrink-0 bg-slate-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-sm">
                  {col.name} <span className="text-slate-400">({tasksByColumn[col.id].length})</span>
                </h3>
                <button
                  onClick={() => handleDeleteColumn(col.id)}
                  className="text-slate-400 hover:text-red-500 text-xs"
                  title="Supprimer la colonne"
                >
                  ✕
                </button>
              </div>

              <Droppable droppableId={col.id}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 min-h-[10px]">
                    {tasksByColumn[col.id].map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(dragProvided, snapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            onClick={() => setModalState({ task })}
                            className={`bg-white rounded-md p-3 shadow-sm border border-slate-200 cursor-pointer ${
                              snapshot.isDragging ? "shadow-lg" : ""
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium">{task.title}</p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${PRIORITY_COLORS[task.priority]}`}>
                                {task.priority}
                              </span>
                            </div>
                            {(task.startDate || task.dueDate) && (() => {
                              const fmt = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "?");
                              const late = task.dueDate && new Date(task.dueDate) < new Date() && !DONE_COLUMN_RE.test(col.name);
                              return (
                                <p className={`text-xs mt-1 ${late ? "text-red-600 font-medium" : "text-slate-400"}`}>
                                  {fmt(task.startDate)} → {fmt(task.dueDate)}
                                  {late ? " · en retard" : ""}
                                </p>
                              );
                            })()}
                            {task.assigneeId && memberById[task.assigneeId] && (
                              <p className="text-xs text-slate-500 mt-1">{memberById[task.assigneeId].name}</p>
                            )}
                            {task.lotId && lotById[task.lotId] && (
                              <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 mt-1">
                                {lotById[task.lotId].code}
                              </span>
                            )}
                            {(task.dependsOnIds || []).length > 0 && (() => {
                              const blocking = blockingDeps(task);
                              const blocked = blocking.length > 0 && !DONE_COLUMN_RE.test(col.name);
                              return (
                                <p
                                  className={`text-[10px] mt-1 ${blocked ? "text-red-600 font-medium" : "text-slate-400"}`}
                                  title={
                                    blocked
                                      ? `En attente de : ${blocking.map((d) => d.title).join(", ")}`
                                      : "Toutes les dependances sont terminees"
                                  }
                                >
                                  {blocked
                                    ? `⛓ bloquee par : ${blocking
                                        .map((d) => d.title)
                                        .join(", ")
                                        .slice(0, 60)}${blocking.map((d) => d.title).join(", ").length > 60 ? "..." : ""}`
                                    : `⛓ ${task.dependsOnIds.length} dependance(s) OK`}
                                </p>
                              );
                            })()}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>

              {quickAddColumn === col.id ? (
                <form onSubmit={(e) => handleQuickAdd(e, col.id)} className="mt-3">
                  <input
                    autoFocus
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setQuickAddColumn(null);
                        setQuickTitle("");
                      }
                    }}
                    placeholder="Titre + Entree"
                    className="w-full border border-brand-300 rounded-md px-2 py-1.5 text-sm"
                  />
                  <div className="flex justify-between mt-1 text-xs">
                    <button type="button" onClick={() => setModalState({ columnId: col.id })} className="text-slate-400 hover:text-brand-600">
                      + détails (dates, lot...)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddColumn(null);
                        setQuickTitle("");
                      }}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      fermer
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => {
                    setQuickAddColumn(col.id);
                    setQuickTitle("");
                  }}
                  className="mt-3 w-full text-sm text-slate-500 hover:text-brand-600 text-left"
                >
                  + Ajouter une tache
                </button>
              )}
            </div>
          ))}

          <div className="w-64 flex-shrink-0">
            {addingColumn ? (
              <form onSubmit={handleAddColumn} className="bg-slate-100 rounded-lg p-3">
                <input
                  autoFocus
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  placeholder="Nom de la colonne"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm mb-2"
                />
                <div className="flex gap-2">
                  <button type="submit" className="bg-brand-600 text-white text-sm px-3 py-1.5 rounded-md">
                    Ajouter
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingColumn(false)}
                    className="text-sm px-3 py-1.5 rounded-md border border-slate-300"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setAddingColumn(true)}
                className="w-full h-11 rounded-lg border-2 border-dashed border-slate-300 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-600"
              >
                + Ajouter une colonne
              </button>
            )}
          </div>
        </div>
      </DragDropContext>

      {modalState && (
        <TaskModal
          project={project}
          members={members}
          columnId={modalState.columnId}
          task={modalState.task}
          onClose={() => setModalState(null)}
          onSaved={() => {
            setModalState(null);
            onChange();
          }}
        />
      )}
    </div>
  );
}
