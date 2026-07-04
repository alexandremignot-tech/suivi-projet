import { useEffect, useState } from "react";
import client from "../api/client";

// Points ouverts (Comment tracker) : remarques a suivre jusqu'a cloture.
// Reprend la logique de l'onglet "Comment tracker" Excel : n°, statut, topic, sujet,
// commentaire, echeance, action, assigne, reponse/suivi.

const STATUS_LABELS = { OPEN: "Ouvert", IN_PROGRESS: "En cours", CLOSED: "Clos" };
const STATUS_COLORS = {
  OPEN: "bg-red-100 text-red-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  CLOSED: "bg-green-100 text-green-700",
};

const emptyForm = {
  title: "",
  topic: "",
  description: "",
  action: "",
  assignee: "",
  dueDate: "",
  lotId: "",
  status: "OPEN",
};

export default function IssuesView({ project, onChange }) {
  const [issues, setIssues] = useState(null);
  const [filterStatus, setFilterStatus] = useState("ACTIVE"); // ACTIVE = ouvert + en cours
  const [filterTopic, setFilterTopic] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null); // issue en cours d'edition

  const lots = project.lots || [];

  async function load() {
    const { data } = await client.get(`/issues?projectId=${project.id}`);
    setIssues(data);
  }
  useEffect(() => {
    load();
  }, [project.id]);

  const topics = [...new Set((issues || []).map((i) => i.topic).filter(Boolean))].sort();

  const filtered = (issues || []).filter((i) => {
    if (filterStatus === "ACTIVE" && i.status === "CLOSED") return false;
    if (["OPEN", "IN_PROGRESS", "CLOSED"].includes(filterStatus) && i.status !== filterStatus) return false;
    if (filterTopic !== "ALL" && i.topic !== filterTopic) return false;
    if (search) {
      const t = `${i.title} ${i.description || ""} ${i.assignee || ""} ${i.action || ""} ${i.response || ""}`.toLowerCase();
      if (!t.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const openCount = (issues || []).filter((i) => i.status === "OPEN").length;
  const inProgressCount = (issues || []).filter((i) => i.status === "IN_PROGRESS").length;
  const lateCount = (issues || []).filter((i) => i.status !== "CLOSED" && i.dueDate && new Date(i.dueDate) < new Date()).length;

  async function handleSubmit(e) {
    e.preventDefault();
    if (editing) {
      await client.put(`/issues/${editing.id}`, { ...form, lotId: form.lotId || null, dueDate: form.dueDate || null });
    } else {
      await client.post("/issues", { ...form, projectId: project.id, lotId: form.lotId || null, dueDate: form.dueDate || null });
    }
    setForm(emptyForm);
    setEditing(null);
    setShowForm(false);
    load();
  }

  function startEdit(issue) {
    setEditing(issue);
    setForm({
      title: issue.title,
      topic: issue.topic || "",
      description: issue.description || "",
      action: issue.action || "",
      assignee: issue.assignee || "",
      dueDate: issue.dueDate ? issue.dueDate.slice(0, 10) : "",
      lotId: issue.lotId || "",
      status: issue.status,
    });
    setShowForm(true);
  }

  async function handleStatus(issue, status) {
    await client.put(`/issues/${issue.id}`, { status });
    load();
  }

  async function handleResponse(issue) {
    const response = prompt(`Reponse / suivi pour "${issue.title}" :`, issue.response || "");
    if (response === null) return;
    await client.put(`/issues/${issue.id}`, { response });
    load();
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer ce point ?")) return;
    await client.delete(`/issues/${id}`);
    load();
  }

  if (!issues) return <p className="text-sm text-slate-400">Chargement des points ouverts...</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Ouverts" value={openCount} danger={openCount > 0} />
        <Metric label="En cours" value={inProgressCount} />
        <Metric label="En retard (echeance depassee)" value={lateCount} danger={lateCount > 0} />
      </div>

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-2">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
            <option value="ACTIVE">Ouverts + en cours</option>
            <option value="OPEN">Ouverts</option>
            <option value="IN_PROGRESS">En cours</option>
            <option value="CLOSED">Clos</option>
            <option value="ALL">Tous</option>
          </select>
          <select value={filterTopic} onChange={(e) => setFilterTopic(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
            <option value="ALL">Tous les topics</option>
            {topics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setForm(emptyForm);
            setShowForm((v) => !v);
          }}
          className="bg-brand-600 text-white text-sm px-4 py-1.5 rounded-md"
        >
          {showForm ? "Annuler" : "+ Nouveau point"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-2 gap-3">
          <input required placeholder="Sujet" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="col-span-2 border border-slate-300 rounded-md px-3 py-2 text-sm" />
          <textarea placeholder="Commentaire / detail (optionnel)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="col-span-2 border border-slate-300 rounded-md px-3 py-2 text-sm" rows={2} />
          <input placeholder="Topic (Build, Commissioning, Design...)" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} className="border border-slate-300 rounded-md px-3 py-2 text-sm" list="topics" />
          <datalist id="topics">
            {["Build", "Commissioning", "Design"].concat(topics).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <input placeholder="Action (ex: Gerer avec Matexi)" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} className="border border-slate-300 rounded-md px-3 py-2 text-sm" />
          <input placeholder="Assigne a" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} className="border border-slate-300 rounded-md px-3 py-2 text-sm" />
          <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="border border-slate-300 rounded-md px-3 py-2 text-sm" />
          <select value={form.lotId} onChange={(e) => setForm({ ...form, lotId: e.target.value })} className="border border-slate-300 rounded-md px-3 py-2 text-sm">
            <option value="">Sans lot</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </select>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="border border-slate-300 rounded-md px-3 py-2 text-sm">
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button type="submit" className="col-span-2 bg-brand-600 text-white text-sm py-2 rounded-md">
            {editing ? "Enregistrer les modifications" : "Ajouter le point"}
          </button>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
              <th className="px-3 py-2 w-10">N°</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Topic</th>
              <th className="px-3 py-2">Sujet</th>
              <th className="px-3 py-2">Action / assigne</th>
              <th className="px-3 py-2">Echeance</th>
              <th className="px-3 py-2">Reponse / suivi</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  Aucun point pour ce filtre.
                </td>
              </tr>
            )}
            {filtered.map((i) => {
              const late = i.status !== "CLOSED" && i.dueDate && new Date(i.dueDate) < new Date();
              return (
                <tr key={i.id} className="border-b border-slate-50 align-top">
                  <td className="px-3 py-2 text-xs text-slate-400">{i.number}</td>
                  <td className="px-3 py-2">
                    <select
                      value={i.status}
                      onChange={(e) => handleStatus(i, e.target.value)}
                      className={`text-xs rounded-full px-2 py-1 border-0 ${STATUS_COLORS[i.status]}`}
                    >
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {i.topic || "-"}
                    {i.lot ? <div className="text-[10px] text-slate-400">{i.lot.code}</div> : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{i.title}</div>
                    {i.description && <div className="text-xs text-slate-400 max-w-[260px]">{i.description}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 max-w-[160px]">
                    {i.action && <div>{i.action}</div>}
                    {i.assignee && <div className="font-medium text-slate-600">{i.assignee}</div>}
                  </td>
                  <td className={`px-3 py-2 text-xs ${late ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                    {i.dueDate ? new Date(i.dueDate).toLocaleDateString("fr-FR") : "-"}
                    {late ? " !" : ""}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 max-w-[220px]">
                    <button onClick={() => handleResponse(i)} className="text-left hover:text-brand-600" title="Cliquer pour modifier la reponse">
                      {i.response || <span className="text-slate-300 underline">ajouter une reponse</span>}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {i.status !== "CLOSED" && (
                      <button onClick={() => handleStatus(i, "CLOSED")} className="text-xs text-green-700 underline mr-2" title="Cloturer">
                        clore
                      </button>
                    )}
                    <button onClick={() => startEdit(i)} className="text-xs text-brand-600 underline mr-2">
                      editer
                    </button>
                    <button onClick={() => handleDelete(i.id)} className="text-slate-300 hover:text-red-500">
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value, danger }) {
  return (
    <div className="bg-slate-100 rounded-md p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-medium ${danger ? "text-red-600" : ""}`}>{value}</div>
    </div>
  );
}
