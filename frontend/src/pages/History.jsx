import { useEffect, useState } from "react";
import client from "../api/client";

// Historique des modifications : qui a cree/modifie/supprime quoi, et quand.
// Alimente automatiquement par le serveur a chaque ecriture (audit log).

const METHOD_LABELS = {
  POST: { label: "Creation", cls: "bg-green-100 text-green-800" },
  PUT: { label: "Modification", cls: "bg-blue-100 text-blue-700" },
  PATCH: { label: "Modification", cls: "bg-blue-100 text-blue-700" },
  DELETE: { label: "Suppression", cls: "bg-red-100 text-red-700" },
};

export default function History() {
  const [logs, setLogs] = useState(null);
  const [projects, setProjects] = useState([]);
  const [filterProject, setFilterProject] = useState("");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    client.get("/projects").then(({ data }) => setProjects(data));
  }, []);

  useEffect(() => {
    setLogs(null);
    client
      .get(`/audit?limit=300${filterProject ? `&projectId=${filterProject}` : ""}`)
      .then(({ data }) => setLogs(data));
  }, [filterProject]);

  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));

  // Groupe par jour pour la lisibilite
  const byDay = {};
  for (const log of logs || []) {
    const day = new Date(log.createdAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    (byDay[day] = byDay[day] || []).push(log);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Historique des modifications</h1>
          <p className="text-sm text-slate-500">
            Chaque creation, modification ou suppression est journalisee avec son auteur — utile pour
            retrouver l'origine d'une erreur.
          </p>
        </div>
        <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="border border-slate-300 rounded-md px-3 py-2 text-sm">
          <option value="">Tous les projets</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {!logs ? (
        <p className="text-sm text-slate-400">Chargement...</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-slate-400">
          Aucune modification journalisee pour l'instant (le journal demarre au deploiement de cette version).
        </p>
      ) : (
        Object.entries(byDay).map(([day, dayLogs]) => (
          <div key={day}>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{day}</h3>
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-50">
              {dayLogs.map((log) => {
                const m = METHOD_LABELS[log.method] || { label: log.method, cls: "bg-slate-100 text-slate-600" };
                return (
                  <div key={log.id} className="px-4 py-2 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-400 w-12">
                        {new Date(log.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="font-medium">{log.userName}</span>
                      <span className={`text-[10px] rounded-full px-2 py-0.5 ${m.cls}`}>{m.label}</span>
                      <span className="text-slate-600">{log.entity}</span>
                      {log.projectId && projectById[log.projectId] && (
                        <span className="text-xs text-slate-400">· {projectById[log.projectId].name}</span>
                      )}
                      {log.summary && (
                        <button
                          onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                          className="text-xs text-brand-600 underline ml-auto"
                        >
                          {expanded === log.id ? "masquer" : "detail"}
                        </button>
                      )}
                    </div>
                    {expanded === log.id && log.summary && (
                      <pre className="mt-1 text-[11px] text-slate-500 bg-slate-50 rounded p-2 whitespace-pre-wrap break-all">
                        {log.path}
                        {"\n"}
                        {log.summary}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
