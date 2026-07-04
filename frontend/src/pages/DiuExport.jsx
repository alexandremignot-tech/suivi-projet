import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import client, { fileUrl } from "../api/client";

// Page DIU (Dossier d'Intervention Ulterieure) par lot :
// - trame legale + metier avec checklist de completude (OK / sans fichier / manquant)
// - inventaires automatiques (equipements, fiches logements)
// - depot en masse : glisse tous tes PDF, ils sont rattaches aux documents par leur nom
// - assemblage du DIU complet en un seul PDF cote serveur

const STATUS_STYLE = {
  OK: "bg-green-100 text-green-800 border-green-200",
  SANS_FICHIER: "bg-amber-100 text-amber-800 border-amber-200",
  MANQUANT: "bg-red-100 text-red-700 border-red-200",
};
const STATUS_LABEL = { OK: "OK", SANS_FICHIER: "Sans fichier", MANQUANT: "Manquant" };

const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]/g, "");

export default function DiuExport() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [lotId, setLotId] = useState("");
  const [diu, setDiu] = useState(null);
  const [uploadReport, setUploadReport] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    client.get(`/projects/${id}`).then(({ data }) => {
      setProject(data);
      if (data.lots?.length) setLotId((prev) => prev || data.lots[0].id);
    });
  }, [id]);

  useEffect(() => {
    if (!lotId) return;
    setDiu(null);
    client.get(`/lots/${lotId}/diu`).then(({ data }) => setDiu(data));
  }, [lotId, project]);

  async function refresh() {
    const { data } = await client.get(`/projects/${id}`);
    setProject(data);
  }

  // Depot en masse : rattache chaque fichier au document du projet dont le nom correspond.
  async function handleDrop(e) {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length || !project) return;
    setUploadBusy(true);
    const report = { attached: 0, created: 0, skipped: [] };
    try {
      const docs = project.documents || [];
      for (const file of files) {
        const key = normalize(file.name);
        // correspondance par nom : document dont le nom normalise est contenu dans le nom
        // de fichier normalise (ou inversement)
        const doc = docs.find((d) => {
          const dn = normalize(d.name);
          return dn && (key.includes(dn) || dn.includes(key));
        });
        const formData = new FormData();
        formData.append("file", file);
        const { data: up } = await client.post("/uploads", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        if (doc) {
          await client.put(`/documents/${doc.id}`, { fileUrl: up.fileUrl, fileName: up.fileName, status: "RECEIVED" });
          report.attached += 1;
        } else if (lotId) {
          // aucun document correspondant : cree une fiche dans le lot affiche
          await client.post("/documents", {
            projectId: id,
            lotId,
            name: file.name.replace(/\.[^.]+$/, ""),
            category: "Plans / Fiche technique",
            fileUrl: up.fileUrl,
            fileName: up.fileName,
          });
          report.created += 1;
        } else {
          report.skipped.push(file.name);
        }
      }
      setUploadReport(report);
      await refresh();
    } finally {
      setUploadBusy(false);
    }
  }

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await client.get(`/lots/${lotId}/diu.pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DIU-${diu.lot.code}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (!project) return <div className="p-8 text-center text-slate-500">Chargement...</div>;

  const lots = project.lots || [];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dossier d'Intervention Ulterieure (DIU)</h1>
          <p className="text-sm text-slate-500">
            {project.name} — dossier as-built par lot, base legale AR 25/01/2001.{" "}
            <Link to={`/projects/${id}`} className="text-brand-600 underline">
              Retour au projet
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={lotId} onChange={(e) => setLotId(e.target.value)} className="border border-slate-300 rounded-md px-3 py-2 text-sm">
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} - {l.name}
              </option>
            ))}
          </select>
          <button
            onClick={downloadPdf}
            disabled={!diu || downloading}
            className="bg-brand-600 text-white text-sm px-4 py-2 rounded-md disabled:opacity-50"
          >
            {downloading ? "Assemblage..." : "Telecharger le DIU assemble (PDF)"}
          </button>
        </div>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-slate-300 rounded-lg px-4 py-5 text-center text-sm text-slate-500 hover:border-brand-400"
      >
        {uploadBusy
          ? "Envoi en cours..."
          : "Glisse ici les PDF du dossier technique (en masse) : chaque fichier est rattache automatiquement au document du meme nom. Les fichiers inconnus sont ajoutes au lot affiche."}
      </div>
      {uploadReport && (
        <p className="text-xs text-slate-500 -mt-3">
          {uploadReport.attached} rattache(s) a une fiche existante, {uploadReport.created} nouvelle(s) fiche(s)
          {uploadReport.skipped.length > 0 ? `, ignores : ${uploadReport.skipped.join(", ")}` : ""}.
        </p>
      )}

      {!diu ? (
        <div className="p-8 text-center text-slate-400 text-sm">Chargement du DIU...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Completude des pieces attendues" value={diu.completeness === null ? "n/a" : `${diu.completeness} %`} danger={diu.completeness !== null && diu.completeness < 100} />
            <Metric label="Documents du lot" value={diu.sections.reduce((s, x) => s + x.docs.length, 0)} />
            <Metric label="Avec fichier joint" value={diu.sections.reduce((s, x) => s + x.docs.filter((d) => d.fileUrl).length, 0)} />
            <Metric label="Equipements inventories" value={diu.equipments.length} />
          </div>

          {diu.required.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="font-medium text-sm mb-3">Pieces attendues pour {diu.lot.code} (checklist DIU)</h3>
              <div className="space-y-1.5">
                {diu.required.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className={`text-[10px] border rounded-full px-2 py-0.5 mt-0.5 whitespace-nowrap ${STATUS_STYLE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    <div>
                      <span className={r.status === "MANQUANT" ? "text-red-700" : ""}>{r.label}</span>
                      {r.docs.length > 0 && (
                        <span className="text-xs text-slate-400"> — {r.docs.map((d) => d.name).join(" · ")}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {diu.sections.map((s) => (
              <div key={s.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-sm font-medium">
                  {s.title} <span className="text-slate-400 font-normal">({s.docs.length})</span>
                </div>
                {s.docs.length === 0 ? (
                  <p className="text-xs text-slate-400 p-3">Aucun document.</p>
                ) : (
                  <ul className="divide-y divide-slate-50">
                    {s.docs.map((d) => (
                      <li key={d.id} className="px-4 py-1.5 text-xs flex items-center justify-between gap-2">
                        <span className="truncate" title={d.name}>{d.name}</span>
                        {d.fileUrl ? (
                          <a href={fileUrl(d.fileUrl)} target="_blank" rel="noreferrer" className="text-brand-600 underline flex-shrink-0">
                            fichier
                          </a>
                        ) : (
                          <span className="text-red-500 flex-shrink-0">non joint</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {diu.equipments.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="font-medium text-sm mb-2">
                Inventaire des equipements (inclus automatiquement dans le PDF)
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {diu.equipments.map((e, i) => (
                  <span key={i} className="text-[11px] bg-slate-50 border border-slate-200 rounded px-2 py-0.5">
                    {e.name}
                    {e.quantity > 1 ? ` (x${e.quantity})` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          {diu.units.length > 0 && (
            <p className="text-xs text-slate-500">
              {diu.units.length} fiche(s) logement (modeles / numeros de serie) seront incluses dans le PDF.
            </p>
          )}
        </>
      )}
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
