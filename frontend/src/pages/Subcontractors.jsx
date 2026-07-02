import { useEffect, useState } from "react";
import client from "../api/client";

export default function Subcontractors() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", specialty: "", contactName: "", email: "", phone: "" });

  async function load() {
    setLoading(true);
    const { data } = await client.get("/subcontractors");
    setList(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    await client.post("/subcontractors", form);
    setForm({ name: "", specialty: "", contactName: "", email: "", phone: "" });
    setShowForm(false);
    load();
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer ce sous-traitant ?")) return;
    await client.delete(`/subcontractors/${id}`);
    load();
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Sous-traitants</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-brand-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-brand-700"
        >
          {showForm ? "Annuler" : "+ Ajouter un sous-traitant"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-lg p-5 mb-6 grid grid-cols-2 gap-3">
          <input
            required
            placeholder="Nom / raison sociale"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="col-span-2 border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Specialite (ex: Plomberie, Electricite, Forage)"
            value={form.specialty}
            onChange={(e) => setForm({ ...form, specialty: e.target.value })}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Contact (nom)"
            value={form.contactName}
            onChange={(e) => setForm({ ...form, contactName: e.target.value })}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Telephone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <button type="submit" className="col-span-2 bg-brand-600 text-white text-sm py-2 rounded-md">
            Ajouter
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : list.length === 0 ? (
        <p className="text-slate-500">Aucun sous-traitant enregistre.</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
          {list.map((s) => (
            <div key={s.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{s.name}</div>
                <div className="text-xs text-slate-500">
                  {[s.specialty, s.contactName, s.email, s.phone].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button onClick={() => handleDelete(s.id)} className="text-slate-400 hover:text-red-500 text-sm">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
