import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { useAuth } from "../context/AuthContext";

const TYPE_LABELS = {
  RESEAU_CHALEUR: "Reseau de chaleur",
  GEOTHERMIE: "Geothermie",
  CHAUFFERIE: "Chaufferie",
  SOUS_STATION: "Sous-station",
  AUTRE: "Autre",
};

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    startDate: "",
    endDate: "",
    budgetTotal: "",
    type: "AUTRE",
  });
  const { organization } = useAuth();

  async function loadProjects() {
    setLoading(true);
    const { data } = await client.get("/projects");
    setProjects(data);
    setLoading(false);
  }

  useEffect(() => {
    loadProjects();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    await client.post("/projects", form);
    setForm({ name: "", description: "", startDate: "", endDate: "", budgetTotal: "", type: "AUTRE" });
    setShowForm(false);
    loadProjects();
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Projets</h1>
          <p className="text-sm text-slate-500">Organisation : {organization?.name}</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-brand-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-brand-700"
        >
          {showForm ? "Annuler" : "+ Nouveau projet"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-lg p-5 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Nom du projet</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                rows={2}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Type de projet</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="RESEAU_CHALEUR">Reseau de chaleur</option>
                <option value="GEOTHERMIE">Geothermie</option>
                <option value="CHAUFFERIE">Chaufferie industrielle</option>
                <option value="SOUS_STATION">Sous-station (chez le client)</option>
                <option value="AUTRE">Autre</option>
              </select>
              <p className="text-xs text-slate-400 mt-1">
                Une checklist de taches et de documents adaptee sera creee automatiquement.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date de debut</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date de fin</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Budget total (EUR)</label>
              <input
                type="number"
                step="0.01"
                value={form.budgetTotal}
                onChange={(e) => setForm({ ...form, budgetTotal: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button type="submit" className="bg-brand-600 text-white px-4 py-2 rounded-md text-sm font-medium">
            Creer le projet
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : projects.length === 0 ? (
        <p className="text-slate-500">Aucun projet pour le moment. Cree ton premier projet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="bg-white border border-slate-200 rounded-lg p-5 hover:shadow-md transition"
            >
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold">{p.name}</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 capitalize">
                  {p.status}
                </span>
              </div>
              <p className="text-sm text-slate-500 line-clamp-2 mb-3">{p.description || "Pas de description"}</p>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{p._count?.tasks ?? 0} tache(s)</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100">{TYPE_LABELS[p.type] || p.type}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
