import { useRef, useState } from "react";
import client, { fileUrl } from "../api/client";

// Reconnaissance vocale native du navigateur (Chrome/Edge). Gratuite, sans cle API.
// Non supportee par tous les navigateurs (ex: Firefox, Safari partiellement) : on degrade proprement.
const SpeechRecognitionAPI = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

function VoiceDictationButton({ onResult }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  if (!SpeechRecognitionAPI) {
    return <p className="text-xs text-slate-400">Dictee vocale non supportee par ce navigateur (utilisez Chrome).</p>;
  }

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join(" ");
      onResult(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`text-xs px-3 py-1.5 rounded-md border ${
        listening ? "bg-red-600 text-white border-red-600" : "border-slate-300 text-slate-600"
      }`}
    >
      {listening ? "● Enregistrement... (cliquer pour arreter)" : "🎤 Dicter au micro"}
    </button>
  );
}

const TYPE_LABELS = {
  VISITE: "Visite de chantier",
  REUNION_COORDINATION: "Reunion de coordination",
  REUNION_CHANTIER: "Reunion de chantier",
};

export default function SiteReportsView({ project, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    type: "VISITE",
    lotId: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
    criticalPoints: "",
  });
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  const reports = project.siteReports || [];
  const lots = project.lots || [];

  async function handleAddPhotos(files) {
    const newPhotos = Array.from(files).map((file) => ({ file, caption: "" }));
    setPendingPhotos((p) => [...p, ...newPhotos]);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setUploading(true);
    try {
      const uploadedPhotos = [];
      for (const p of pendingPhotos) {
        const formData = new FormData();
        formData.append("file", p.file);
        const { data } = await client.post("/uploads", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        uploadedPhotos.push({ url: data.fileUrl, fileName: data.fileName, caption: p.caption });
      }

      const { data: report } = await client.post("/site-reports", {
        ...form,
        lotId: form.lotId || null,
        projectId: project.id,
        photos: uploadedPhotos,
      });

      setForm({
        title: "",
        type: "VISITE",
        lotId: "",
        date: new Date().toISOString().slice(0, 10),
        notes: "",
        criticalPoints: "",
      });
      setPendingPhotos([]);
      setShowForm(false);
      setExpandedId(report.id);
      onChange();
    } finally {
      setUploading(false);
    }
  }

  async function handleRegenerate(id) {
    await client.post(`/site-reports/${id}/regenerate-summary`);
    onChange();
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer ce rapport ?")) return;
    await client.delete(`/site-reports/${id}`);
    onChange();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Rapports de chantier</h3>
        <button onClick={() => setShowForm((v) => !v)} className="text-sm text-brand-600 font-medium">
          {showForm ? "Annuler" : "+ Nouveau rapport"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              placeholder="Titre du rapport (ex: Visite du 12/07)"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="col-span-2 border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
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
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-slate-500">Notes de chantier</label>
              <VoiceDictationButton onResult={(t) => setForm((f) => ({ ...f, notes: `${f.notes} ${t}`.trim() }))} />
            </div>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={4}
              placeholder="Notes libres, ou dictez au micro..."
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Points critiques</label>
            <textarea
              value={form.criticalPoints}
              onChange={(e) => setForm({ ...form, criticalPoints: e.target.value })}
              rows={2}
              placeholder="Risques, blocages, non-conformites constatees..."
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Photos</label>
            <input type="file" multiple accept="image/*" onChange={(e) => handleAddPhotos(e.target.files)} className="text-sm" />
            {pendingPhotos.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-2">
                {pendingPhotos.map((p, i) => (
                  <div key={i} className="space-y-1">
                    <img src={URL.createObjectURL(p.file)} alt="" className="w-full h-20 object-cover rounded-md" />
                    <input
                      placeholder="Legende"
                      value={p.caption}
                      onChange={(e) =>
                        setPendingPhotos((prev) => prev.map((pp, idx) => (idx === i ? { ...pp, caption: e.target.value } : pp)))
                      }
                      className="w-full border border-slate-300 rounded px-1 py-0.5 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="w-full bg-brand-600 text-white text-sm py-2 rounded-md disabled:opacity-50"
          >
            {uploading ? "Generation du rapport..." : "Creer et generer le rapport"}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {reports.length === 0 && <p className="text-sm text-slate-500">Aucun rapport de chantier pour ce projet.</p>}
        {reports.map((r) => {
          const expanded = expandedId === r.id;
          return (
            <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(expanded ? null : r.id)}>
                <div>
                  <span className="font-medium text-sm">{r.title}</span>
                  <span className="text-xs text-slate-400 ml-2">{TYPE_LABELS[r.type] || r.type}</span>
                  <span className="text-xs text-slate-400 ml-2">{new Date(r.date).toLocaleDateString("fr-FR")}</span>
                  {r.lotId && lots.find((l) => l.id === r.lotId) && (
                    <span className="text-xs text-slate-400 ml-2">· {lots.find((l) => l.id === r.lotId).code}</span>
                  )}
                  {r.author && <span className="text-xs text-slate-400 ml-2">· {r.author.name}</span>}
                </div>
                <span className="text-xs text-brand-600">{expanded ? "Reduire" : "Voir le rapport"}</span>
              </div>

              {expanded && (
                <div className="mt-3 space-y-3">
                  <pre className="whitespace-pre-wrap text-sm bg-slate-50 rounded-md p-3 font-sans">{r.aiSummary}</pre>

                  {r.photos?.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {r.photos.map((p) => (
                        <a key={p.id} href={fileUrl(p.url)} target="_blank" rel="noreferrer">
                          <img src={fileUrl(p.url)} alt={p.caption || ""} className="w-full h-20 object-cover rounded-md" />
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-3 text-xs">
                    <button onClick={() => handleRegenerate(r.id)} className="text-brand-600 font-medium underline">
                      Regenerer le resume
                    </button>
                    <button onClick={() => handleDelete(r.id)} className="text-red-600 font-medium underline">
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
