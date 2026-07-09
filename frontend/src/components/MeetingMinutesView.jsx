import { useEffect, useState } from "react";
import client from "../api/client";

const EMPTY_ATTENDEE = { company: "", name: "", role: "", email: "", tel: "", presence: "P" };
const EMPTY_OBSERVATION = { ref: "", title: "", body: "", resp: "", pourLe: "" };

// Genere le PV de chantier au format .docx KARNO (police Montserrat, couleurs et mise en page
// du template officiel), a partir d'une liste de presents et de points d'observation.
export default function MeetingMinutesView({ project }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const lots = project.lots || [];

  function emptyForm() {
    return {
      lotId: "",
      dateReunion: new Date().toISOString().slice(0, 10),
      auteur: "",
      attendees: [{ ...EMPTY_ATTENDEE }],
      observations: [{ ...EMPTY_OBSERVATION }],
    };
  }

  async function load() {
    setLoading(true);
    const { data } = await client.get("/meeting-minutes", { params: { projectId: project.id } });
    setList(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  function updateAttendee(i, field, value) {
    setForm((f) => ({
      ...f,
      attendees: f.attendees.map((a, idx) => (idx === i ? { ...a, [field]: value } : a)),
    }));
  }

  function updateObservation(i, field, value) {
    setForm((f) => ({
      ...f,
      observations: f.observations.map((o, idx) => (idx === i ? { ...o, [field]: value } : o)),
    }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        projectId: project.id,
        lotId: form.lotId || null,
        dateReunion: form.dateReunion,
        auteur: form.auteur,
        attendees: form.attendees.filter((a) => a.name.trim()),
        observations: form.observations
          .map((o, idx) => ({ ...o, ref: o.ref || `1.${idx + 1}` }))
          .filter((o) => o.title.trim() || o.body.trim()),
      };
      await client.post("/meeting-minutes", payload);
      setForm(emptyForm());
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer ce PV ?")) return;
    await client.delete(`/meeting-minutes/${id}`);
    await load();
  }

  async function handleDownload(mm) {
    setDownloadingId(mm.id);
    try {
      const res = await client.get(`/meeting-minutes/${mm.id}/docx`, { responseType: "blob" });
      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${mm.reference}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">PV de chantier</h3>
          <p className="text-xs text-slate-500">
            Genere un document .docx au format officiel KARNO (police Montserrat, couleurs et premiere page du
            modele conserves).
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="text-sm text-brand-600 font-medium">
          {showForm ? "Annuler" : "+ Nouveau PV"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <input
              type="date"
              required
              value={form.dateReunion}
              onChange={(e) => setForm({ ...form, dateReunion: e.target.value })}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <input
              required
              placeholder="Auteur du PV"
              value={form.auteur}
              onChange={(e) => setForm({ ...form, auteur: e.target.value })}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <select
              value={form.lotId}
              onChange={(e) => setForm({ ...form, lotId: e.target.value })}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Lot concerne (optionnel)</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} - {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">Presents</label>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, attendees: [...f.attendees, { ...EMPTY_ATTENDEE }] }))}
                className="text-xs text-brand-600 font-medium"
              >
                + Ajouter un present
              </button>
            </div>
            <div className="space-y-2">
              {form.attendees.map((a, i) => (
                <div key={i} className="grid grid-cols-6 gap-2 items-center">
                  <input
                    placeholder="Societe"
                    value={a.company}
                    onChange={(e) => updateAttendee(i, "company", e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                  />
                  <input
                    placeholder="Nom prenom"
                    value={a.name}
                    onChange={(e) => updateAttendee(i, "name", e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                  />
                  <input
                    placeholder="Role"
                    value={a.role}
                    onChange={(e) => updateAttendee(i, "role", e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                  />
                  <input
                    placeholder="Email"
                    value={a.email}
                    onChange={(e) => updateAttendee(i, "email", e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                  />
                  <input
                    placeholder="Tel"
                    value={a.tel}
                    onChange={(e) => updateAttendee(i, "tel", e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                  />
                  <select
                    value={a.presence}
                    onChange={(e) => updateAttendee(i, "presence", e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                  >
                    <option value="P">P (present)</option>
                    <option value="D">D (diffusion)</option>
                    <option value="P/D">P/D</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">Observations / points de reunion</label>
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, observations: [...f.observations, { ...EMPTY_OBSERVATION }] }))
                }
                className="text-xs text-brand-600 font-medium"
              >
                + Ajouter un point
              </button>
            </div>
            <div className="space-y-2">
              {form.observations.map((o, i) => (
                <div key={i} className="border border-slate-200 rounded-md p-2 space-y-1.5">
                  <div className="grid grid-cols-4 gap-2">
                    <input
                      placeholder="Ref (ex: 1.1)"
                      value={o.ref}
                      onChange={(e) => updateObservation(i, "ref", e.target.value)}
                      className="border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                    />
                    <input
                      placeholder="Titre"
                      value={o.title}
                      onChange={(e) => updateObservation(i, "title", e.target.value)}
                      className="col-span-1 border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                    />
                    <input
                      placeholder="Responsable"
                      value={o.resp}
                      onChange={(e) => updateObservation(i, "resp", e.target.value)}
                      className="border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                    />
                    <input
                      placeholder="Pour le (date)"
                      value={o.pourLe}
                      onChange={(e) => updateObservation(i, "pourLe", e.target.value)}
                      className="border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                    />
                  </div>
                  <textarea
                    placeholder="Description du point"
                    rows={2}
                    value={o.body}
                    onChange={(e) => updateObservation(i, "body", e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-brand-600 text-white text-sm py-2 rounded-md disabled:opacity-50"
          >
            {saving ? "Enregistrement..." : "Creer le PV"}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {loading && <p className="text-sm text-slate-500">Chargement...</p>}
        {!loading && list.length === 0 && <p className="text-sm text-slate-500">Aucun PV de chantier pour ce projet.</p>}
        {list.map((mm) => {
          const expanded = expandedId === mm.id;
          const lot = lots.find((l) => l.id === mm.lotId);
          return (
            <div key={mm.id} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(expanded ? null : mm.id)}>
                <div>
                  <span className="font-medium text-sm">PV n°{mm.numero}</span>
                  <span className="text-xs text-slate-400 ml-2">{new Date(mm.dateReunion).toLocaleDateString("fr-FR")}</span>
                  {lot && <span className="text-xs text-slate-400 ml-2">· {lot.code}</span>}
                  <span className="text-xs text-slate-400 ml-2">· {mm.auteur}</span>
                </div>
                <span className="text-xs text-brand-600">{expanded ? "Reduire" : "Voir le detail"}</span>
              </div>

              {expanded && (
                <div className="mt-3 space-y-3 text-sm">
                  <p className="text-xs text-slate-400">Reference : {mm.reference}</p>
                  <div>
                    <p className="text-xs font-medium text-slate-600 mb-1">Presents ({(mm.attendees || []).length})</p>
                    <ul className="text-xs text-slate-600 space-y-0.5">
                      {(mm.attendees || []).map((a, i) => (
                        <li key={i}>
                          {a.company ? `${a.company} - ` : ""}
                          {a.name} ({a.role}) {a.presence ? `[${a.presence}]` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-600 mb-1">Observations ({(mm.observations || []).length})</p>
                    <ul className="text-xs text-slate-600 space-y-1">
                      {(mm.observations || []).map((o, i) => (
                        <li key={i}>
                          <span className="font-medium">{o.ref} {o.title}</span> — {o.body}{" "}
                          {o.resp && <span className="text-slate-400">(Resp: {o.resp}, pour le {o.pourLe})</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex gap-3 text-xs pt-2">
                    <button
                      onClick={() => handleDownload(mm)}
                      disabled={downloadingId === mm.id}
                      className="text-brand-600 font-medium underline disabled:opacity-50"
                    >
                      {downloadingId === mm.id ? "Generation..." : "Telecharger le .docx"}
                    </button>
                    <button onClick={() => handleDelete(mm.id)} className="text-red-600 font-medium underline">
                      Supprimer
                    </button>
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
