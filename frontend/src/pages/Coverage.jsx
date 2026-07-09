import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";

// Onglet "Couverture" : permet de designer un collegue pour surveiller ses taches/jalons pendant
// une absence (vacances, etc.), et pour ce collegue de consulter/telecharger la todo generee.
export default function Coverage() {
  const [data, setData] = useState(null);
  const [members, setMembers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ delegateId: "", startDate: "", endDate: "", note: "" });
  const [expandedId, setExpandedId] = useState(null);
  const [todos, setTodos] = useState({}); // backupId -> todo data
  const [downloadingId, setDownloadingId] = useState(null);

  async function load() {
    const { data: rows } = await client.get("/backups");
    setData(rows);
  }

  useEffect(() => {
    load();
    client.get("/organizations/members").then(({ data }) => setMembers(data));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await client.post("/backups", form);
      setForm({ delegateId: "", startDate: "", endDate: "", note: "" });
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer ce backup ?")) return;
    await client.delete(`/backups/${id}`);
    await load();
  }

  async function toggleExpand(id) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!todos[id]) {
      const { data: todo } = await client.get(`/backups/${id}/todo`);
      setTodos((t) => ({ ...t, [id]: todo }));
    }
  }

  async function handleDownloadPdf(id) {
    setDownloadingId(id);
    try {
      const res = await client.get(`/backups/${id}/pdf`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "backup.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  }

  if (!data) return <div className="p-8 text-center text-slate-500">Chargement...</div>;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Couverture</h1>
          <p className="text-sm text-slate-500">
            Partez en vacances l&apos;esprit tranquille : designez un collegue, il recevra automatiquement la todo
            (taches et jalons a surveiller pendant votre absence).
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="bg-brand-600 text-white text-sm px-4 py-2 rounded-md">
          {showForm ? "Annuler" : "+ Backup (departs en vacances)"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Du</label>
              <input
                type="date"
                required
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Au</label>
              <input
                type="date"
                required
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Collegue qui prend le relais</label>
            <select
              required
              value={form.delegateId}
              onChange={(e) => setForm({ ...form, delegateId: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Choisir un collegue...</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Consignes (optionnel)</label>
            <textarea
              rows={3}
              placeholder="Priorites, contacts utiles, points de vigilance..."
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-brand-600 text-white text-sm py-2 rounded-md disabled:opacity-50"
          >
            {saving ? "Creation..." : "Creer le backup"}
          </button>
        </form>
      )}

      <BackupSection
        title={`Mes backups programmes (${data.asOwner.length})`}
        empty="Aucun backup programme."
        backups={data.asOwner}
        role="owner"
        expandedId={expandedId}
        todos={todos}
        onToggle={toggleExpand}
        onDelete={handleDelete}
        onDownload={handleDownloadPdf}
        downloadingId={downloadingId}
      />

      <BackupSection
        title={`Je couvre pour (${data.asDelegate.length})`}
        empty="Vous ne couvrez actuellement personne."
        backups={data.asDelegate}
        role="delegate"
        expandedId={expandedId}
        todos={todos}
        onToggle={toggleExpand}
        onDownload={handleDownloadPdf}
        downloadingId={downloadingId}
      />
    </div>
  );
}

function BackupSection({ title, empty, backups, role, expandedId, todos, onToggle, onDelete, onDownload, downloadingId }) {
  const now = new Date();
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <h2 className="px-4 py-3 font-medium border-b border-slate-100">{title}</h2>
      <div className="divide-y divide-slate-100">
        {backups.length === 0 && <p className="text-sm text-slate-400 p-4">{empty}</p>}
        {backups.map((b) => {
          const expanded = expandedId === b.id;
          const active = new Date(b.startDate) <= now && now <= new Date(b.endDate);
          const todo = todos[b.id];
          return (
            <div key={b.id}>
              <div className="px-4 py-3 flex items-center justify-between cursor-pointer" onClick={() => onToggle(b.id)}>
                <div className="text-sm">
                  <span className="font-medium">
                    {role === "owner" ? b.delegate.name : b.owner.name}
                  </span>
                  <span className="text-slate-400 ml-2">
                    {role === "owner" ? "couvre pour vous" : "vous designe"}
                  </span>
                  <span className="text-slate-400 ml-2">
                    du {new Date(b.startDate).toLocaleDateString("fr-FR")} au {new Date(b.endDate).toLocaleDateString("fr-FR")}
                  </span>
                  {active && <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">En cours</span>}
                </div>
                <span className="text-xs text-brand-600">{expanded ? "Reduire" : "Voir la todo"}</span>
              </div>

              {expanded && (
                <div className="px-4 pb-4 space-y-3">
                  {b.note && (
                    <p className="text-xs bg-slate-50 border border-slate-200 rounded-md p-2 text-slate-600">
                      <span className="font-medium">Consignes : </span>
                      {b.note}
                    </p>
                  )}
                  {!todo && <p className="text-xs text-slate-400">Chargement de la todo...</p>}
                  {todo && (
                    <>
                      <TodoGroup title="Taches en retard" items={todo.overdueTasks} color="red" render={taskLine} />
                      <TodoGroup title="Taches a echeance pendant l'absence" items={todo.upcomingTasks} render={taskLine} />
                      <TodoGroup title="Jalons deja depasses" items={todo.overdueMilestones} color="red" render={milestoneLine} />
                      <TodoGroup title="Jalons a venir pendant l'absence" items={todo.upcomingMilestones} render={milestoneLine} />
                    </>
                  )}
                  <div className="flex gap-3 text-xs pt-1">
                    <button
                      onClick={() => onDownload(b.id)}
                      disabled={downloadingId === b.id}
                      className="text-brand-600 font-medium underline disabled:opacity-50"
                    >
                      {downloadingId === b.id ? "Generation..." : "Telecharger en PDF (pour envoyer par mail)"}
                    </button>
                    {role === "owner" && onDelete && (
                      <button onClick={() => onDelete(b.id)} className="text-red-600 font-medium underline">
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function taskLine(t) {
  return (
    <>
      <Link to={`/projects/${t.project.id}`} className="font-medium hover:underline">
        {t.title}
      </Link>
      <span className="text-slate-400 ml-2">
        {t.project.name}
        {t.lot && ` · ${t.lot.code}`}
      </span>
      <span className="text-xs text-slate-500 ml-2">echeance {t.dueDate ? new Date(t.dueDate).toLocaleDateString("fr-FR") : "-"}</span>
    </>
  );
}

function milestoneLine(m) {
  return (
    <>
      <Link to={`/projects/${m.project.id}`} className="font-medium hover:underline">
        {m.name}
      </Link>
      <span className="text-slate-400 ml-2">{m.project.name}</span>
      <span className="text-xs text-slate-500 ml-2">{new Date(m.date).toLocaleDateString("fr-FR")}</span>
    </>
  );
}

function TodoGroup({ title, items, color, render }) {
  return (
    <div>
      <p className={`text-xs font-medium mb-1 ${color === "red" ? "text-red-700" : "text-slate-600"}`}>
        {title} ({items.length})
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">Rien a signaler.</p>
      ) : (
        <div className="space-y-1">
          {items.map((it) => (
            <div key={it.id} className="text-sm">
              {render(it)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
