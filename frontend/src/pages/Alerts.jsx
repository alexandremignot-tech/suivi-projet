import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";

export default function Alerts() {
  const [data, setData] = useState(null);

  useEffect(() => {
    client.get("/dashboard/alerts").then(({ data }) => setData(data));
  }, []);

  if (!data) return <div className="p-8 text-center text-slate-500">Chargement...</div>;

  const { missingDocuments, overdueDocuments, maintenanceDue, pendingStatements, upcomingMilestones } = data;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Alertes</h1>
        <p className="text-sm text-slate-500">Vue transverse a tous les projets : ce qui necessite une action.</p>
      </div>

      <Section
        title={`Documents en retard (${overdueDocuments.length})`}
        empty="Aucun document en retard."
        highlight="red"
      >
        {overdueDocuments.map((d) => (
          <Row key={d.id}>
            <Link to={`/projects/${d.project.id}`} className="font-medium hover:underline">
              {d.name}
            </Link>
            <span className="text-slate-400">
              {d.project.name}
              {d.lot && ` · ${d.lot.code}`}
            </span>
            <span className="text-red-600 text-xs">
              Echeance depassee : {new Date(d.deadline).toLocaleDateString("fr-FR")}
            </span>
          </Row>
        ))}
      </Section>

      <Section
        title={`Documents manquants (${missingDocuments.length})`}
        empty="Aucun document manquant."
      >
        {missingDocuments.slice(0, 20).map((d) => (
          <Row key={d.id}>
            <Link to={`/projects/${d.project.id}`} className="font-medium hover:underline">
              {d.name}
            </Link>
            <span className="text-slate-400">
              {d.project.name}
              {d.lot && ` · ${d.lot.code}`}
              {d.subcontractor && ` · ${d.subcontractor.name}`}
            </span>
            <span className="text-xs text-slate-400">
              {d.deadline ? `Echeance ${new Date(d.deadline).toLocaleDateString("fr-FR")}` : "Sans echeance"}
            </span>
          </Row>
        ))}
        {missingDocuments.length > 20 && (
          <p className="text-xs text-slate-400 mt-2">+ {missingDocuments.length - 20} autre(s), voir dans chaque projet.</p>
        )}
      </Section>

      <Section
        title={`Maintenance d'equipements due (${maintenanceDue.length})`}
        empty="Aucune maintenance en retard."
        highlight="orange"
      >
        {maintenanceDue.map((eq) => (
          <Row key={eq.id}>
            <Link to={`/projects/${eq.project.id}`} className="font-medium hover:underline">
              {eq.name}
            </Link>
            <span className="text-slate-400">{eq.project.name}</span>
            <span className="text-orange-600 text-xs">
              Prevue le {new Date(eq.nextMaintenance).toLocaleDateString("fr-FR")}
            </span>
          </Row>
        ))}
      </Section>

      <Section
        title={`Etats d'avancement en attente de validation (${pendingStatements.length})`}
        empty="Aucun etat d'avancement en attente."
      >
        {pendingStatements.map((s) => (
          <Row key={s.id}>
            <Link to={`/projects/${s.lot.project.id}`} className="font-medium hover:underline">
              EA{s.number} - {s.lot.code}
            </Link>
            <span className="text-slate-400">
              {s.lot.project.name}
              {s.subcontractor && ` · ${s.subcontractor.name}`}
            </span>
            <span className="text-xs text-slate-500">
              {s.period} · {s.amount.toLocaleString("fr-FR")} EUR
            </span>
          </Row>
        ))}
      </Section>

      <Section
        title={`Jalons a venir sous 30 jours (${upcomingMilestones.length})`}
        empty="Aucun jalon dans les 30 prochains jours."
      >
        {upcomingMilestones.map((m) => (
          <Row key={m.id}>
            <Link to={`/projects/${m.project.id}`} className="font-medium hover:underline">
              {m.name}
            </Link>
            <span className="text-slate-400">{m.project.name}</span>
            <span className="text-xs text-slate-500">{new Date(m.date).toLocaleDateString("fr-FR")}</span>
          </Row>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, empty, children, highlight }) {
  const hasItems = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <h2 className={`px-4 py-3 font-medium border-b border-slate-100 ${highlight === "red" ? "text-red-700" : highlight === "orange" ? "text-orange-700" : ""}`}>
        {title}
      </h2>
      <div className="divide-y divide-slate-100">
        {hasItems ? children : <p className="text-sm text-slate-400 p-4">{empty}</p>}
      </div>
    </div>
  );
}

function Row({ children }) {
  return <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">{children}</div>;
}
