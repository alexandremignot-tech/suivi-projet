import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import client, { fileUrl } from "../api/client";

const DOC_STATUS_LABELS = {
  MISSING: "MANQUANT",
  RECEIVED: "Recu",
  VALIDATED: "Valide",
  REJECTED: "Rejete",
};

function isOverdue(doc) {
  return doc.status === "MISSING" && doc.deadline && new Date(doc.deadline) < new Date();
}

// Vue imprimable du dossier As-built : liste tous les documents du projet (transverses + par lot)
// avec leur statut, pour remise au client final (l'operateur). Utiliser Cmd+P / le bouton pour exporter en PDF.
export default function AsBuiltExport() {
  const { id } = useParams();
  const [project, setProject] = useState(null);

  useEffect(() => {
    client.get(`/projects/${id}`).then(({ data }) => setProject(data));
  }, [id]);

  if (!project) return <div className="p-8 text-center text-slate-500">Chargement...</div>;

  const transverseDocs = (project.documents || []).filter((d) => !d.lotId);
  const allDocs = [...transverseDocs, ...project.lots.flatMap((l) => l.documents || [])];
  const missingCount = allDocs.filter((d) => d.status === "MISSING").length;
  const overdueCount = allDocs.filter(isOverdue).length;

  return (
    <div className="max-w-4xl mx-auto px-8 py-10 print:px-0 print:py-0">
      <div className="flex items-center justify-between mb-8 print:hidden">
        <p className="text-sm text-slate-500">Apercu du dossier As-built - utilisez l'impression du navigateur (Cmd/Ctrl+P) pour exporter en PDF.</p>
        <button onClick={() => window.print()} className="bg-brand-600 text-white text-sm px-4 py-2 rounded-md">
          Imprimer / Exporter en PDF
        </button>
      </div>

      <div className="border-b border-slate-300 pb-4 mb-6">
        <h1 className="text-2xl font-bold">Dossier As-built</h1>
        <h2 className="text-lg text-slate-700">{project.name}</h2>
        <p className="text-sm text-slate-500 mt-1">{project.description}</p>
        <p className="text-xs text-slate-400 mt-2">Genere le {new Date().toLocaleDateString("fr-FR")}</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8 text-sm">
        <div className="border border-slate-200 rounded-md p-3">
          <div className="text-xs text-slate-400">Documents au total</div>
          <div className="text-xl font-semibold">{allDocs.length}</div>
        </div>
        <div className="border border-slate-200 rounded-md p-3">
          <div className="text-xs text-slate-400">Manquants</div>
          <div className={`text-xl font-semibold ${missingCount > 0 ? "text-red-600" : ""}`}>{missingCount}</div>
        </div>
        <div className="border border-slate-200 rounded-md p-3">
          <div className="text-xs text-slate-400">En retard</div>
          <div className={`text-xl font-semibold ${overdueCount > 0 ? "text-red-600" : ""}`}>{overdueCount}</div>
        </div>
      </div>

      {transverseDocs.length > 0 && (
        <section className="mb-8 break-inside-avoid">
          <h3 className="text-base font-semibold border-b border-slate-200 pb-1 mb-2">Documents generaux du projet</h3>
          <DocTable docs={transverseDocs} />
        </section>
      )}

      {project.lots.map((lot) => (
        <section key={lot.id} className="mb-8 break-inside-avoid">
          <h3 className="text-base font-semibold border-b border-slate-200 pb-1 mb-2">
            {lot.code} - {lot.name}
            {lot.subcontractor && <span className="text-slate-400 font-normal"> ({lot.subcontractor.name})</span>}
          </h3>
          {(lot.documents || []).length === 0 ? (
            <p className="text-sm text-slate-400">Aucun document pour ce lot.</p>
          ) : (
            <DocTable docs={lot.documents} />
          )}
        </section>
      ))}

      <p className="text-xs text-slate-400 mt-10 print:mt-6">
        Document genere automatiquement par l'application de suivi de projet. Les fichiers "Voir" ne sont accessibles
        qu'en ligne, pas dans la version imprimee.
      </p>
    </div>
  );
}

function DocTable({ docs }) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
          <th className="py-1.5 pr-2">Document</th>
          <th className="py-1.5 pr-2">Categorie</th>
          <th className="py-1.5 pr-2">Statut</th>
          <th className="py-1.5 pr-2">Echeance</th>
        </tr>
      </thead>
      <tbody>
        {docs.map((d) => (
          <tr key={d.id} className="border-b border-slate-100">
            <td className="py-1.5 pr-2">{d.name}</td>
            <td className="py-1.5 pr-2 text-slate-500">{d.category}</td>
            <td className={`py-1.5 pr-2 ${d.status === "MISSING" ? "text-red-600 font-medium" : "text-slate-600"}`}>
              {DOC_STATUS_LABELS[d.status] || d.status}
            </td>
            <td className="py-1.5 pr-2 text-slate-500">
              {d.deadline ? new Date(d.deadline).toLocaleDateString("fr-FR") : "-"}
              {d.fileUrl && (
                <a href={fileUrl(d.fileUrl)} target="_blank" rel="noreferrer" className="text-brand-600 underline ml-2 print:hidden">
                  Voir
                </a>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
