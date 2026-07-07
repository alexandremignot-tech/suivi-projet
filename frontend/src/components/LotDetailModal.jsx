import { useState } from "react";
import client, { fileUrl } from "../api/client";
import UnitsGrid from "./UnitsGrid";
import EAEditor from "./EAEditor";
import ContractGenerator from "./ContractGenerator";

const DOCUMENT_CATEGORIES = [
  "RFP / RFQ",
  "Analyse des offres",
  "Contrat",
  "Plans / Fiche technique",
  "Permitting",
  "Reception / DIU",
  "Livrables",
];

const STATEMENT_STATUS_LABELS = {
  DRAFT: "Brouillon",
  SUBMITTED: "Soumis",
  VALIDATED: "Valide",
  INVOICED: "Facture",
};

export default function LotDetailModal({ project, lot, subcontractors, onClose, onChange }) {
  const [form, setForm] = useState({
    code: lot.code,
    name: lot.name,
    subcontractorId: lot.subcontractorId || "",
    contractAmount: lot.contractAmount ?? "",
    notes: lot.notes || "",
  });

  const [docForm, setDocForm] = useState({ name: "", category: DOCUMENT_CATEGORIES[0], deadline: "" });
  const [docFile, setDocFile] = useState(null);
  const [showDocForm, setShowDocForm] = useState(false);

  const [statementForm, setStatementForm] = useState({ number: "", period: "", amount: "", status: "DRAFT" });
  const [statementFile, setStatementFile] = useState(null);
  const [showStatementForm, setShowStatementForm] = useState(false);
  const [eaEditor, setEaEditor] = useState(null); // { statement? } editeur d'EA detaille par postes
  const [showContract, setShowContract] = useState(false);
  const [expandedStatement, setExpandedStatement] = useState(null);

  const documents = (project.documents || []).filter((d) => d.lotId === lot.id);
  const statements = lot.progressStatements || [];
  const equipments = (project.equipments || []).filter((e) => e.lotId === lot.id);

  async function handleSaveLot(e) {
    e.preventDefault();
    await client.put(`/lots/${lot.id}`, { ...form, subcontractorId: form.subcontractorId || null });
    onChange();
  }

  async function handleDeleteLot() {
    if (!confirm("Supprimer ce lot et tous ses documents/etats d'avancement ?")) return;
    await client.delete(`/lots/${lot.id}`);
    onChange();
    onClose();
  }

  async function handleAddDocument(e) {
    e.preventDefault();
    let fileData = {};
    if (docFile) {
      const formData = new FormData();
      formData.append("file", docFile);
      const { data } = await client.post("/uploads", formData, { headers: { "Content-Type": "multipart/form-data" } });
      fileData = { fileUrl: data.fileUrl, fileName: data.fileName };
    }
    await client.post("/documents", {
      ...docForm,
      projectId: project.id,
      lotId: lot.id,
      subcontractorId: lot.subcontractorId || null,
      ...fileData,
    });
    setDocForm({ name: "", category: DOCUMENT_CATEGORIES[0], deadline: "" });
    setDocFile(null);
    setShowDocForm(false);
    onChange();
  }

  async function handleDeleteDocument(id) {
    if (!confirm("Supprimer ce document ?")) return;
    await client.delete(`/documents/${id}`);
    onChange();
  }

  async function handleAddStatement(e) {
    e.preventDefault();
    let fileData = {};
    if (statementFile) {
      const formData = new FormData();
      formData.append("file", statementFile);
      const { data } = await client.post("/uploads", formData, { headers: { "Content-Type": "multipart/form-data" } });
      fileData = { fileUrl: data.fileUrl, fileName: data.fileName };
    }
    await client.post("/progress-statements", {
      ...statementForm,
      lotId: lot.id,
      number: statementForm.number || statements.length + 1,
      ...fileData,
    });
    setStatementForm({ number: "", period: "", amount: "", status: "DRAFT" });
    setStatementFile(null);
    setShowStatementForm(false);
    onChange();
  }

  async function handleDeleteStatement(id) {
    if (!confirm("Supprimer cet etat d'avancement ?")) return;
    await client.delete(`/progress-statements/${id}`);
    onChange();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4 py-8">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-6">
          <form onSubmit={handleSaveLot} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">Lot {lot.code}</h2>
                <button
                  type="button"
                  onClick={() => setShowContract(true)}
                  className="text-xs bg-brand-50 border border-brand-200 text-brand-700 rounded-md px-2 py-1 hover:bg-brand-100"
                >
                  Generer un contrat
                </button>
              </div>
              <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="Code (ex: BB1)"
                className="border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nom du lot"
                className="border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
              <select
                value={form.subcontractorId}
                onChange={(e) => setForm({ ...form, subcontractorId: e.target.value })}
                className="border border-slate-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Sous-traitant (optionnel)</option>
                {subcontractors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                value={form.contractAmount}
                onChange={(e) => setForm({ ...form, contractAmount: e.target.value })}
                placeholder="Montant du contrat (EUR)"
                className="border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Notes"
                rows={2}
                className="col-span-2 border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-between">
              <button type="button" onClick={handleDeleteLot} className="text-sm text-red-600 underline">
                Supprimer le lot
              </button>
              <button type="submit" className="bg-brand-600 text-white text-sm px-4 py-1.5 rounded-md">
                Enregistrer
              </button>
            </div>
          </form>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-sm">Documents du lot</h3>
              <button onClick={() => setShowDocForm((v) => !v)} className="text-xs text-brand-600 font-medium">
                {showDocForm ? "Annuler" : "+ Ajouter"}
              </button>
            </div>

            {showDocForm && (
              <form onSubmit={handleAddDocument} className="bg-slate-50 rounded-md p-3 grid grid-cols-2 gap-2 mb-3">
                <input
                  required
                  placeholder="Nom du document"
                  value={docForm.name}
                  onChange={(e) => setDocForm({ ...docForm, name: e.target.value })}
                  className="col-span-2 border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                />
                <select
                  value={docForm.category}
                  onChange={(e) => setDocForm({ ...docForm, category: e.target.value })}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                >
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={docForm.deadline}
                  onChange={(e) => setDocForm({ ...docForm, deadline: e.target.value })}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                />
                <input type="file" onChange={(e) => setDocFile(e.target.files[0])} className="col-span-2 text-xs" />
                <button type="submit" className="col-span-2 bg-brand-600 text-white text-xs py-1.5 rounded-md">
                  Ajouter
                </button>
              </form>
            )}

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
              {documents.length === 0 && <p className="text-xs text-slate-400 p-3">Aucun document pour ce lot.</p>}
              {documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{d.name}</span>
                    <span className="text-xs text-slate-400 ml-2">{d.category}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">{d.status}</span>
                    {d.fileUrl && (
                      <a href={fileUrl(d.fileUrl)} target="_blank" rel="noreferrer" className="text-brand-600 underline">
                        Voir
                      </a>
                    )}
                    <button onClick={() => handleDeleteDocument(d.id)} className="text-slate-400 hover:text-red-500">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-sm">Etats d'avancement</h3>
              <div className="flex gap-3">
                <button onClick={() => setEaEditor({})} className="text-xs text-brand-600 font-medium">
                  + EA detaille (par postes)
                </button>
                <button onClick={() => setShowStatementForm((v) => !v)} className="text-xs text-slate-500 font-medium">
                  {showStatementForm ? "Annuler" : "+ Montant simple"}
                </button>
              </div>
            </div>

            {showStatementForm && (
              <form onSubmit={handleAddStatement} className="bg-slate-50 rounded-md p-3 grid grid-cols-2 gap-2 mb-3">
                <input
                  type="number"
                  placeholder={`Numero (ex: ${statements.length + 1})`}
                  value={statementForm.number}
                  onChange={(e) => setStatementForm({ ...statementForm, number: e.target.value })}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                />
                <input
                  required
                  placeholder="Periode (ex: Mars 2026)"
                  value={statementForm.period}
                  onChange={(e) => setStatementForm({ ...statementForm, period: e.target.value })}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                />
                <input
                  required
                  type="number"
                  step="0.01"
                  placeholder="Montant (EUR)"
                  value={statementForm.amount}
                  onChange={(e) => setStatementForm({ ...statementForm, amount: e.target.value })}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                />
                <select
                  value={statementForm.status}
                  onChange={(e) => setStatementForm({ ...statementForm, status: e.target.value })}
                  className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                >
                  {Object.entries(STATEMENT_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <input
                  type="file"
                  onChange={(e) => setStatementFile(e.target.files[0])}
                  className="col-span-2 text-xs"
                />
                <button type="submit" className="col-span-2 bg-brand-600 text-white text-xs py-1.5 rounded-md">
                  Ajouter
                </button>
              </form>
            )}

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
              {statements.length === 0 && <p className="text-xs text-slate-400 p-3">Aucun etat d'avancement.</p>}
              {[...statements]
                .sort((a, b) => a.number - b.number)
                .map((s) => (
                <div key={s.id} className="px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">EA{s.number}</span>
                      <span className="text-xs text-slate-400 ml-2">{s.period}</span>
                      {Array.isArray(s.lines) && s.lines.length > 0 && (
                        <button
                          onClick={() => setExpandedStatement(expandedStatement === s.id ? null : s.id)}
                          className="text-[11px] text-brand-600 underline ml-2"
                        >
                          {expandedStatement === s.id ? "masquer" : `${s.lines.length} postes`}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span>{s.amount.toLocaleString("fr-FR")} EUR</span>
                      <span className="text-slate-500">{STATEMENT_STATUS_LABELS[s.status]}</span>
                      {Array.isArray(s.lines) && s.lines.length > 0 && (
                        <button onClick={() => setEaEditor({ statement: s })} className="text-brand-600 underline">
                          Editer
                        </button>
                      )}
                      {s.fileUrl && (
                        <a href={fileUrl(s.fileUrl)} target="_blank" rel="noreferrer" className="text-brand-600 underline">
                          Voir
                        </a>
                      )}
                      <button onClick={() => handleDeleteStatement(s.id)} className="text-slate-400 hover:text-red-500">
                        ✕
                      </button>
                    </div>
                  </div>
                  {expandedStatement === s.id && Array.isArray(s.lines) && (
                    <table className="w-full text-[11px] mt-2 border border-slate-100 rounded">
                      <thead>
                        <tr className="text-left text-slate-400 bg-slate-50">
                          <th className="px-2 py-1">Poste</th>
                          <th className="px-2 py-1 text-right">Commande</th>
                          <th className="px-2 py-1 text-right">% prec.</th>
                          <th className="px-2 py-1 text-right">% cumule</th>
                          <th className="px-2 py-1 text-right">Periode (EUR)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.lines.map((l, i) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="px-2 py-1">{l.description}</td>
                            <td className="px-2 py-1 text-right">{Number(l.total).toLocaleString("fr-FR")}</td>
                            <td className="px-2 py-1 text-right">{l.prevPct} %</td>
                            <td className="px-2 py-1 text-right font-medium">{l.cumulPct} %</td>
                            <td className="px-2 py-1 text-right">
                              {(((Number(l.cumulPct) - Number(l.prevPct)) * Number(l.total)) / 100).toLocaleString("fr-FR")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          </div>

          {equipments.length > 0 && (
            <div>
              <h3 className="font-medium text-sm mb-2">Equipements de ce lot</h3>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                {equipments.map((eq) => (
                  <div key={eq.id} className="px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {eq.name}
                        {eq.quantity > 1 ? ` (x${eq.quantity})` : ""}
                      </span>
                      {eq.technicalSheetUrl && (
                        <a
                          href={fileUrl(eq.technicalSheetUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-600 text-xs underline flex-shrink-0"
                        >
                          Fiche technique
                        </a>
                      )}
                    </div>
                    {eq.specs && eq.specs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {eq.specs.map((s, i) => (
                          <span key={i} className="text-[11px] bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                            <span className="text-slate-500">{s.label}</span>
                            {s.label && s.value ? ": " : ""}
                            <span className="font-medium text-slate-700">{s.value}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Gerer/ajouter des equipements depuis l'onglet "Equipements &amp; fiches techniques".
              </p>
            </div>
          )}

          <div>
            <h3 className="font-medium text-sm mb-2">Unites repetables (ex: maisons raccordees)</h3>
            <UnitsGrid lot={lot} subcontractors={subcontractors} onChange={onChange} />
          </div>
        </div>
      </div>

      {showContract && (
        <ContractGenerator
          project={project}
          lot={lot}
          subcontractors={subcontractors}
          onClose={() => setShowContract(false)}
          onSaved={() => {
            setShowContract(false);
            onChange();
          }}
        />
      )}

      {eaEditor && (
        <EAEditor
          lot={lot}
          statements={statements}
          statement={eaEditor.statement}
          onClose={() => setEaEditor(null)}
          onSaved={() => {
            setEaEditor(null);
            onChange();
          }}
        />
      )}
    </div>
  );
}
