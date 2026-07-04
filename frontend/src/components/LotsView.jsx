import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import client from "../api/client";
import LotDetailModal from "./LotDetailModal";

const PHASES = [
  { key: "RFP_RFQ", label: "RFP / RFQ" },
  { key: "BID_ANALYSIS", label: "Analyse des offres" },
  { key: "CONTRACT", label: "Contrat" },
  { key: "FOLLOW_UP", label: "Suivi" },
  { key: "RECEPTION_DIU", label: "Reception / DIU" },
  { key: "DONE", label: "Termine" },
];

export default function LotsView({ project, onChange }) {
  const [subcontractors, setSubcontractors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", subcontractorId: "" });
  const [selectedLot, setSelectedLot] = useState(null);

  useEffect(() => {
    client.get("/subcontractors").then(({ data }) => setSubcontractors(data));
  }, []);

  const lots = project.lots || [];
  const lotsByPhase = {};
  for (const p of PHASES) lotsByPhase[p.key] = lots.filter((l) => l.phase === p.key);

  async function handleCreate(e) {
    e.preventDefault();
    await client.post("/lots", { ...form, projectId: project.id, subcontractorId: form.subcontractorId || null });
    setForm({ code: "", name: "", subcontractorId: "" });
    setShowForm(false);
    onChange();
  }

  async function handleDragEnd(result) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId) return;
    await client.patch(`/lots/${draggableId}/phase`, { phase: destination.droppableId });
    onChange();
  }

  const subcontractorById = Object.fromEntries(subcontractors.map((s) => [s.id, s]));

  // Recharge le lot selectionne a partir des donnees fraiches du projet (apres modification)
  const currentSelectedLot = selectedLot ? lots.find((l) => l.id === selectedLot.id) : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          Chaque lot suit le parcours RFP/RFQ &rarr; Analyse &rarr; Contrat &rarr; Suivi &rarr; Reception/DIU.
        </p>
        <button onClick={() => setShowForm((v) => !v)} className="text-sm text-brand-600 font-medium">
          {showForm ? "Annuler" : "+ Ajouter un lot"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-3 gap-3 mb-4">
          <input
            required
            placeholder="Code (ex: BB1)"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Nom du lot"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="col-span-2 border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <select
            value={form.subcontractorId}
            onChange={(e) => setForm({ ...form, subcontractorId: e.target.value })}
            className="col-span-2 border border-slate-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Sous-traitant (optionnel)</option>
            {subcontractors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="submit" className="bg-brand-600 text-white text-sm rounded-md">
            Ajouter
          </button>
        </form>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PHASES.map((phase) => (
            <div key={phase.key} className="w-64 flex-shrink-0 bg-slate-100 rounded-lg p-3">
              <h3 className="font-medium text-sm mb-3">
                {phase.label} <span className="text-slate-400">({lotsByPhase[phase.key].length})</span>
              </h3>
              <Droppable droppableId={phase.key}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 min-h-[10px]">
                    {lotsByPhase[phase.key].map((lot, index) => (
                      <Draggable key={lot.id} draggableId={lot.id} index={index}>
                        {(dragProvided) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            onClick={() => setSelectedLot(lot)}
                            className="bg-white rounded-md p-3 shadow-sm border border-slate-200 cursor-pointer"
                          >
                            <p className="text-sm font-medium">
                              {lot.code} - {lot.name}
                            </p>
                            {lot.subcontractorId && subcontractorById[lot.subcontractorId] && (
                              <p className="text-xs text-slate-500 mt-1">{subcontractorById[lot.subcontractorId].name}</p>
                            )}
                            {lot.contractAmount != null && (
                              <p className="text-xs text-slate-400 mt-1">
                                {Number(lot.contractAmount).toLocaleString("fr-FR")} EUR
                              </p>
                            )}
                            {(lot.units || []).length > 0 && (
                              <p className="text-xs text-slate-400 mt-1">
                                {lot.units.filter((u) => (u.steps || []).every((s) => s.status === "DONE")).length}/
                                {lot.units.length} unites terminees
                              </p>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>

      {currentSelectedLot && (
        <LotDetailModal
          project={project}
          lot={currentSelectedLot}
          subcontractors={subcontractors}
          onClose={() => setSelectedLot(null)}
          onChange={onChange}
        />
      )}
    </div>
  );
}
