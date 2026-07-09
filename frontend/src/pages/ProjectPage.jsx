import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import KanbanBoard from "../components/KanbanBoard";
import PlanningView from "../components/PlanningView";
import FinanceView from "../components/FinanceView";
import DocumentsView from "../components/DocumentsView";
import EquipmentsView from "../components/EquipmentsView";
import SiteReportsView from "../components/SiteReportsView";
import IssuesView from "../components/IssuesView";
import IntegrationsView from "../components/IntegrationsView";
import LotsView from "../components/LotsView";
import OverviewView from "../components/OverviewView";
import MeetingMinutesView from "../components/MeetingMinutesView";
import ContractsView from "../components/ContractsView";
import ProjectAssistant from "../components/ProjectAssistant";

const TABS = [
  { key: "overview", label: "Vue d'ensemble" },
  { key: "lots", label: "Lots" },
  { key: "kanban", label: "Tableau Kanban" },
  { key: "planning", label: "Planning" },
  { key: "budget", label: "Finances" },
  { key: "documents", label: "Documents transverses" },
  { key: "equipments", label: "Equipements & Maintenance" },
  { key: "chantier", label: "Suivi de chantier" },
  { key: "pv", label: "PV de chantier" },
  { key: "contrats", label: "Contrats" },
  { key: "points", label: "Points ouverts" },
  { key: "integrations", label: "Integrations" },
];

export default function ProjectPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  const loadProject = useCallback(async () => {
    const { data } = await client.get(`/projects/${id}`);
    setProject(data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadProject();
    client.get("/organizations/members").then(({ data }) => setMembers(data));
  }, [loadProject]);

  if (loading) return <div className="p-8 text-center text-slate-500">Chargement...</div>;
  if (!project) return <div className="p-8 text-center text-slate-500">Projet introuvable</div>;

  const totalSpent = project.budgetItems
    .filter((b) => b.type === "expense")
    .reduce((sum, b) => sum + b.amount, 0);
  const totalTasks = project.tasks.length;
  const doneColumn = project.columns[project.columns.length - 1];
  const doneCount = doneColumn ? project.tasks.filter((t) => t.columnId === doneColumn.id).length : 0;
  const progress = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0;
  const missingDocs = (project.documents || []).filter((d) => d.status === "MISSING").length;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <Link to="/" className="text-sm text-brand-600 mb-4 inline-block">
        &larr; Tous les projets
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="text-sm text-slate-500 max-w-xl">{project.description}</p>
          <div className="flex gap-4 mt-1">
            <Link
              to={`/projects/${project.id}/diu`}
              className="text-xs text-brand-600 font-medium underline inline-block"
            >
              Dossier DIU / as-built par lot (assemblage PDF)
            </Link>
            <Link
              to={`/projects/${project.id}/as-built`}
              target="_blank"
              className="text-xs text-slate-500 font-medium underline inline-block"
            >
              Index des documents (imprimable)
            </Link>
          </div>
        </div>
        <div className="flex gap-6 text-sm">
          <Stat label="Avancement" value={`${progress}%`} />
          <Stat label="Taches" value={`${doneCount}/${totalTasks}`} />
          <Stat
            label="Budget"
            value={`${totalSpent.toLocaleString("fr-FR")} / ${project.budgetTotal.toLocaleString("fr-FR")} EUR`}
          />
          <Stat label="Documents manquants" value={missingDocs} />
        </div>
      </div>

      <div className="flex border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t.key ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewView project={project} />}
      {tab === "lots" && <LotsView project={project} onChange={loadProject} />}
      {tab === "kanban" && <KanbanBoard project={project} members={members} onChange={loadProject} />}
      {tab === "planning" && <PlanningView project={project} onChange={loadProject} />}
      {tab === "budget" && <FinanceView project={project} onChange={loadProject} />}
      {tab === "documents" && <DocumentsView project={project} onChange={loadProject} />}
      {tab === "equipments" && <EquipmentsView project={project} onChange={loadProject} />}
      {tab === "chantier" && <SiteReportsView project={project} onChange={loadProject} />}
      {tab === "pv" && <MeetingMinutesView project={project} onChange={loadProject} />}
      {tab === "contrats" && <ContractsView project={project} onChange={loadProject} />}
      {tab === "points" && <IssuesView project={project} onChange={loadProject} />}
      {tab === "integrations" && <IntegrationsView project={project} onChange={loadProject} />}

      <ProjectAssistant project={project} onChange={loadProject} />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="text-right">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
