import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";

// Tableau de controle du dossier as-built : completude par lot, pieces manquantes,
// depot de fichiers en masse (rattachement par nom), et telechargement du dossier
// COMPLET du projet en un seul PDF (transverses + chapitres par BB + inventaires
// + plan de maintenance + fiches logements + documents fusionnes).

const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]/g, "");

export default function AsBuiltExport() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [status, setStatus] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadReport, setUploadReport] = useState(null);
  const [expanded, setExpanded] = useState(null);

  async function load() {
    const [p, st] = await Promise.all([client.get(`/projects/${id}`), client.get(`/projects/${id}/asbuilt-status`)]);
    setProject(p.data);
    setStatus(st.data);
  }
  useEffect(() => {
    load();
  }, [id]);

  async function downloadFull() {
    setDownloading(true);
    try {
      const res = await client.get(`/projects/${id}/asbuilt.pdf`, { responseType: "blob", timeout: 300000 });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `AsBuilt-${project?.name || "projet"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  // Depot en masse : rattache chaque fichier au document du projet portant le meme nom
  async function handleDrop(e) {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length || !project) return;
    setUploadBusy(true);
    const report = { attached: 0, skipped: [] };
    try {
      const docs = project.documents || [];
      for (const file of files) {
        const key = normalize(file.name);
        const doc = docs.find((d) => {
          const dn = normalize(d.name);
          return dn && (key.includes(dn) || dn.includes(key));
        });
        if (!doc) {
          report.skipped.push(file.name);
          continue;
        }
        const formData = new FormData();
        formData.append("file", file);
        const { data: up } = await client.post("/uploads", formData, { headers: { "Content-Type": "multipart/form-data" } });
        await client.put(`/documents/${doc.id}`, { fileUrl: up.fileUrl, fileName: up.fileName, status: "RECEIVED" });
        report.attached += 1;
      }
      setUploadReport(report);
      await load();
    } finally {
      setUploadBusy(false);
    }
  }

  if (!project || !status) return <div className="p-8 text-center text-slate-500">Chargement...</div>;

  const totalMissing = status.lots.reduce((s, l) => s + l.missing.length, 0);
  const globalPct = (() => {
    const withPct = status.lots.filter((l) => l.completeness !== null);
    if (!withPct.length) return null;
    return Math.round(withPct.reduce((s, l) => s + l.completeness, 0) / withPct.length);
  })();

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dossier As-Built — {project.name}</h1>
          <p className="text-sm text-slate-500">
            Tableau de controle du dossier a remettre au client.{" "}
            <Link to={`/projects/${id}`} className="text-brand-600 underline">Retour au projet</Link>
            {" · "}
            <Link to={`/projects/${id}/diu`} className="text-brand-600 underline">DIU par lot</Link>
          </p>
        </div>
        <button
          onClick={downloadFull}
          disabled={downloading}
          className="bg-brand-600 text-white text-sm px-4 py-2 rounded-md disabled:opacity-50"
        >
          {downloading ? "Assemblage du dossier..." : "Telecharger le dossier complet (PDF)"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Completude moyenne" value={globalPct === null ? "n/a" : `${globalPct} %`} danger={globalPct !== null && globalPct < 100} />
        <Metric label="Pieces manquantes" value={totalMissing} danger={totalMissing > 0} />
        <Metric label="Documents generaux" value={`${status.transverse.withFile}/${status.transverse.total}`} />
        <Metric label="Lots" value={status.lots.length} />
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-slate-300 rounded-lg px-4 py-5 text-center text-sm text-slate-500 hover:border-brand-400"
      >
        {uploadBusy
          ? "Envoi en cours..."
          : "Glisse ici les PDF manquants (en masse) : chaque fichier est rattache automatiquement au document du meme nom, tous lots confondus."}
      </div>
      {uploadReport && (
        <p className="text-xs text-slate-500 -mt-3">
          {uploadReport.attached} fichier(s) rattache(s)
          {uploadReport.skipped.length > 0 ? ` · non reconnus : ${uploadReport.skipped.join(", ")}` : ""}.
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-sm font-medium">Completude par lot</div>
        <div className="divide-y divide-slate-50">
          {status.lots.map((l) => (
            <div key={l.lotId} className="px-4 py-2">
              <div className="flex items-center gap-3">
                <span className="font-medium w-14">{l.code}</span>
                <span className="text-sm text-slate-500 flex-1 truncate">{l.name}</span>
                <span className="text-xs text-slate-400">{l.docsWithFile}/{l.docs} fichiers</span>
                <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${l.completeness === 100 ? "bg-green-500" : "bg-amber-500"}`}
                    style={{ width: `${l.completeness ?? 0}%` }}
                  />
                </div>
                <span className={`text-sm w-12 text-right font-medium ${l.completeness === 100 ? "text-green-700" : l.completeness === null ? "text-slate-400" : "text-amber-700"}`}>
                  {l.completeness === null ? "n/a" : `${l.completeness} %`}
                </span>
                {l.missing.length > 0 ? (
                  <button onClick={() => setExpanded(expanded === l.lotId ? null : l.lotId)} className="text-xs text-red-600 underline w-24 text-right">
                    {expanded === l.lotId ? "masquer" : `${l.missing.length} manquant(s)`}
                  </button>
                ) : (
                  <span className="w-24 text-right text-xs text-green-600">complet</span>
                )}
              </div>
              {expanded === l.lotId && (
                <ul className="mt-1 ml-14 space-y-0.5">
                  {l.missing.map((m, i) => (
                    <li key={i} className="text-xs text-red-600">
                      • {m.label} <span className="text-red-400">({m.status === "MANQUANT" ? "aucune fiche" : "fiche sans fichier"})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Le PDF complet contient : page de garde, synthese de completude, documents generaux, puis un chapitre par
        lot (checklist DIU, equipements avec plan de maintenance et prochains entretiens, fiches par logement,
        documents fusionnes). Les fichiers non PDF sont listes comme « fournis separement ».
      </p>
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
