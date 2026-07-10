import { useEffect, useState } from "react";
import client from "../api/client";

// Genere le Contrat de sous-traitance au format .docx officiel KARNO : reprend la forme du
// contrat complet fourni par l'utilisateur (30 articles, sommaire, definitions legales,
// annexes...), avec le logo/branding et couleurs KARNO conserves (page de garde, entetes/pieds
// de page). Tous les champs variables du contrat sont regroupes ci-dessous par section.
function emptyData() {
  return {
    PROJET: "",
    PROJET_DESCRIPTION: "",
    CONTACT_NOM: "",
    CONTACT_FONCTION: "",
    CONTACT_EMAIL: "",
    CONTACT_TEL: "",
    KARNO_DIR_NOM: "",
    KARNO_DIR_EMAIL: "",
    KARNO_DIR_TEL: "",
    KARNO_CONTACT2_NOM: "",
    KARNO_CONTACT2_EMAIL: "",
    KARNO_CONTACT2_TEL: "",
    KARNO_PM_NOM: "",
    KARNO_PM_EMAIL: "",
    KARNO_PM_TEL: "",
    ST_NOM: "",
    ST_ADRESSE: "",
    ST_BCE: "",
    ST_SPECIALITE: "",
    ST_CEO_NOM: "",
    ST_CONTACT1_NOM: "",
    ST_CONTACT1_EMAIL: "",
    ST_CONTACT1_TEL: "",
    REFERENCE_CHANTIER: "",
    ADRESSE_CHANTIER: "",
    MAITRE_OUVRAGE: "",
    CHECKINWORK: "",
    DATE_DEBUT: "",
    DUREE_PREVISIONNELLE: "",
    DATE_FIN: "",
    MONTANT_FORFAIT: "",
    MONTANT_GARANTIE: "",
    SEUIL_EQUIPEMENT: "",
    ENTREPRISE_GENERALE: "",
    RESOLIA_ENG_NOM: "",
    RESOLIA_ENG_EMAIL: "",
    RESOLIA_ENG_TEL: "",
    LIEU_SIGNATURE: "",
    DATE_SIGNATURE: "",
  };
}

const FIELD_GROUPS = [
  {
    title: "Reference et contact principal (page de garde)",
    fields: [
      ["PROJET", "Reference projet (ex: K-0055 Chaufferie Wavre)"],
      ["PROJET_DESCRIPTION", "Intitule descriptif (ex: Chaufferie collective au bois)"],
      ["CONTACT_NOM", "Nom du contact"],
      ["CONTACT_FONCTION", "Fonction"],
      ["CONTACT_EMAIL", "Email"],
      ["CONTACT_TEL", "Telephone"],
    ],
  },
  {
    title: "KARNO - Administrateur (partie ENTRE)",
    fields: [["KARNO_DIR_NOM", "Nom de l'administrateur representant Karno"]],
  },
  {
    title: "KARNO - Contact 1 (partie ENTRE)",
    fields: [
      ["KARNO_CONTACT2_NOM", "Nom"],
      ["KARNO_CONTACT2_EMAIL", "Email"],
      ["KARNO_CONTACT2_TEL", "GSM"],
    ],
  },
  {
    title: "KARNO - Contact 2 / Project manager Build (partie ENTRE)",
    fields: [
      ["KARNO_PM_NOM", "Nom"],
      ["KARNO_PM_EMAIL", "Email (non affiche dans cette section du contrat)"],
      ["KARNO_PM_TEL", "GSM"],
    ],
  },
  {
    title: "Sous-traitant - Identification",
    fields: [
      ["ST_NOM", "Nom de l'entreprise"],
      ["ST_ADRESSE", "Adresse legale"],
      ["ST_BCE", "Numero BCE"],
      ["ST_SPECIALITE", "Specialite"],
      ["ST_CEO_NOM", "Nom du CEO / Administrateur"],
    ],
  },
  {
    title: "Sous-traitant - Contact 1 (Administrateur/CEO)",
    fields: [
      ["ST_CONTACT1_NOM", "Nom"],
      ["ST_CONTACT1_EMAIL", "Email"],
      ["ST_CONTACT1_TEL", "GSM (avec indicatif, ex: +32 471 00 00 00)"],
    ],
  },
  {
    title: "Chantier",
    fields: [
      ["REFERENCE_CHANTIER", "Reference Karno du chantier (ex: K-0055-BB2)"],
      ["ADRESSE_CHANTIER", "Adresse du chantier"],
      ["MAITRE_OUVRAGE", "Maitre d'Ouvrage (MOA)"],
      ["CHECKINWORK", "Numero checkin@work"],
      ["ENTREPRISE_GENERALE", "Entreprise generale du projet (eau/electricite/sanitaires)"],
    ],
  },
  {
    title: "Dates et montants",
    fields: [
      ["DATE_DEBUT", "Date(s) de debut des travaux"],
      ["DUREE_PREVISIONNELLE", "Duree previsionnelle des travaux"],
      ["DATE_FIN", "Date de fin des travaux"],
      ["MONTANT_FORFAIT", "Montant forfaitaire HTVA (€)", "number"],
      ["MONTANT_GARANTIE", "Retenue de garantie HTVA (€, 10% par defaut)", "number"],
      ["SEUIL_EQUIPEMENT", "Seuil de valorisation equipement HTVA (€, 5% par defaut)", "number"],
      ["LIEU_SIGNATURE", "Lieu de signature"],
      ["DATE_SIGNATURE", "Date de signature"],
    ],
  },
  {
    title: "Resolia (Assistant maitrise d'ouvrage)",
    fields: [
      ["RESOLIA_ENG_NOM", "Nom de l'ingenieur"],
      ["RESOLIA_ENG_EMAIL", "Email"],
      ["RESOLIA_ENG_TEL", "GSM"],
    ],
  },
];

export default function ContractsView({ project }) {
  const [list, setList] = useState([]);
  const [subcontractors, setSubcontractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [title, setTitle] = useState("");
  const [lotId, setLotId] = useState("");
  const [subcontractorId, setSubcontractorId] = useState("");
  const [data, setData] = useState(emptyData());

  // Type de contrat (modele docx) : complet (30 articles) ou leger par metier (15 articles,
  // petits marches). Determine le fichier .docx genere et les champs pertinents ci-dessous.
  const [contractTemplates, setContractTemplates] = useState([]);
  const [contractTemplateKey, setContractTemplateKey] = useState("COMPLET");
  const [scope, setScope] = useState([]); // checklist du contrat en cours (editable)
  const [lotTemplate, setLotTemplate] = useState([]); // "contrat type" du lot selectionne (LotScopeItem)
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);

  // Bases pre-remplies par famille de lot (BB1 geothermie, BB2 energy center, BB3/BB4 distribution
  // avec choix de materiau, BB4 skid/techniques speciales, BB5 sous-stations HIU...)
  const [scopeTemplates, setScopeTemplates] = useState([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("");
  const [material, setMaterial] = useState("PEX");
  const [insulationClass, setInsulationClass] = useState("");

  const lots = project.lots || [];

  async function load() {
    setLoading(true);
    const { data: rows } = await client.get("/contracts", { params: { projectId: project.id } });
    setList(rows);
    setLoading(false);
  }

  useEffect(() => {
    load();
    client.get("/subcontractors").then(({ data: subs }) => setSubcontractors(subs));
    client.get("/lots/scope-templates").then(({ data: templates }) => {
      setScopeTemplates(templates);
      if (templates.length > 0) setSelectedTemplateKey(templates[0].key);
    });
    client.get("/contracts/templates").then(({ data: templates }) => setContractTemplates(templates));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const selectedContractTemplate = contractTemplates.find((t) => t.key === contractTemplateKey);
  const visibleFieldGroups = FIELD_GROUPS.map((g) => ({
    ...g,
    fields: g.fields.filter(([key]) => !selectedContractTemplate || selectedContractTemplate.fieldKeys.includes(key)),
  })).filter((g) => g.fields.length > 0);

  async function loadLotTemplate(id) {
    if (!id) {
      setLotTemplate([]);
      return;
    }
    const { data: items } = await client.get(`/lots/${id}/scope-items`);
    setLotTemplate(items);
    setScope(items.map((i) => ({ label: i.label, commentaire: i.commentaire || "", inclus: true })));
  }

  function handleLotSelect(id) {
    setLotId(id);
    loadLotTemplate(id);
  }

  async function handleLoadStandardTemplate() {
    if (!lotId || !selectedTemplateKey) return;
    setTemplateSaving(true);
    try {
      await client.post(`/lots/${lotId}/scope-items/standard`, {
        templateKey: selectedTemplateKey,
        material,
        insulationClass,
      });
      await loadLotTemplate(lotId);
    } finally {
      setTemplateSaving(false);
    }
  }

  const selectedTemplate = scopeTemplates.find((t) => t.key === selectedTemplateKey);

  async function handleAddTemplateItem() {
    if (!lotId) return;
    setTemplateSaving(true);
    try {
      await client.post(`/lots/${lotId}/scope-items`, { label: "Nouveau poste", commentaire: "" });
      await loadLotTemplate(lotId);
    } finally {
      setTemplateSaving(false);
    }
  }

  async function handleUpdateTemplateItem(itemId, fields) {
    await client.put(`/lots/scope-items/${itemId}`, fields);
    await loadLotTemplate(lotId);
  }

  async function handleDeleteTemplateItem(itemId) {
    await client.delete(`/lots/scope-items/${itemId}`);
    await loadLotTemplate(lotId);
  }

  function toggleScopeInclus(i) {
    setScope((s) => s.map((item, idx) => (idx === i ? { ...item, inclus: !item.inclus } : item)));
  }

  function updateScopeCommentaire(i, value) {
    setScope((s) => s.map((item, idx) => (idx === i ? { ...item, commentaire: value } : item)));
  }

  function addAdHocScopeLine() {
    setScope((s) => [...s, { label: "", commentaire: "", inclus: true }]);
  }

  function updateScopeLabel(i, value) {
    setScope((s) => s.map((item, idx) => (idx === i ? { ...item, label: value } : item)));
  }

  function removeScopeLine(i) {
    setScope((s) => s.filter((_, idx) => idx !== i));
  }

  function updateField(key, value) {
    setData((d) => {
      const next = { ...d, [key]: value };
      if (key === "MONTANT_FORFAIT" && value) {
        const n = Number(value);
        if (!Number.isNaN(n)) {
          next.MONTANT_GARANTIE = next.MONTANT_GARANTIE || String(Math.round(n * 0.1 * 100) / 100);
          next.SEUIL_EQUIPEMENT = next.SEUIL_EQUIPEMENT || String(Math.round(n * 0.05 * 100) / 100);
        }
      }
      return next;
    });
  }

  function handleSubcontractorSelect(id) {
    setSubcontractorId(id);
    const sub = subcontractors.find((s) => s.id === id);
    if (sub) {
      setData((d) => ({
        ...d,
        ST_NOM: d.ST_NOM || sub.name || "",
        ST_SPECIALITE: d.ST_SPECIALITE || sub.specialty || "",
        ST_CONTACT1_NOM: d.ST_CONTACT1_NOM || sub.contactName || "",
        ST_CONTACT1_EMAIL: d.ST_CONTACT1_EMAIL || sub.email || "",
        ST_CONTACT1_TEL: d.ST_CONTACT1_TEL || sub.phone || "",
      }));
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await client.post("/contracts", {
        projectId: project.id,
        lotId: lotId || null,
        subcontractorId: subcontractorId || null,
        title,
        templateKey: contractTemplateKey,
        data: { ...data, SCOPE: scope },
      });
      setTitle("");
      setLotId("");
      setSubcontractorId("");
      setData(emptyData());
      setScope([]);
      setLotTemplate([]);
      setContractTemplateKey("COMPLET");
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer ce contrat ?")) return;
    await client.delete(`/contracts/${id}`);
    await load();
  }

  async function handleDownload(c, format) {
    setDownloadingId(`${c.id}-${format}`);
    try {
      const res = await client.get(`/contracts/${c.id}/${format}`, { responseType: "blob" });
      const mime =
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const blob = new Blob([res.data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${c.title}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message =
        err?.response?.data instanceof Blob
          ? await err.response.data.text().then((t) => {
              try {
                return JSON.parse(t).error;
              } catch {
                return null;
              }
            })
          : err?.response?.data?.error;
      alert(message || `Erreur lors de la generation du ${format}.`);
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Contrats de sous-traitance</h3>
          <p className="text-xs text-slate-500">
            Genere un document .docx au format officiel KARNO (logo, couleurs et police conserves) — au
            choix, contrat complet (30 articles) ou contrat leger (15 articles, petits marches).
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="text-sm text-brand-600 font-medium">
          {showForm ? "Annuler" : "+ Nouveau contrat"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <input
              required
              placeholder="Libelle du contrat (ex: Chauffage Wallon - Chaufferie Wavre)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="col-span-3 border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <select
              value={lotId}
              onChange={(e) => handleLotSelect(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Lot concerne (optionnel)</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} - {l.name}
                </option>
              ))}
            </select>
            <select
              value={subcontractorId}
              onChange={(e) => handleSubcontractorSelect(e.target.value)}
              className="col-span-2 border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Pre-remplir depuis un sous-traitant existant (optionnel)</option>
              {subcontractors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-600 mb-1">Type de contrat</p>
            <div className="grid grid-cols-3 gap-2">
              {contractTemplates.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setContractTemplateKey(t.key)}
                  className={`text-left border rounded-md px-3 py-2 text-xs ${
                    contractTemplateKey === t.key ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-600"
                  }`}
                >
                  <div className="font-medium">{t.label}</div>
                  <div className="text-slate-400 mt-0.5">{t.description}</div>
                </button>
              ))}
            </div>
          </div>

          {lotId && selectedContractTemplate?.hasScope !== false && (
            <div className="border border-slate-200 rounded-md p-3 bg-slate-50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-600">
                  Perimetre contractuel (checklist) — repris du "contrat type" du lot, modulable pour ce contrat
                </p>
                <button
                  type="button"
                  onClick={() => setShowTemplateManager((v) => !v)}
                  className="text-xs text-brand-600 font-medium"
                >
                  {showTemplateManager ? "Fermer la gestion du contrat type" : "Gerer le contrat type de ce lot"}
                </button>
              </div>

              {showTemplateManager && (
                <div className="mb-3 bg-white border border-slate-200 rounded-md p-3 space-y-2">
                  <p className="text-xs text-slate-500">
                    Ces postes sont reutilises comme point de depart pour chaque nouveau contrat de ce lot (BB).
                  </p>
                  {lotTemplate.length === 0 && (
                    <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-md p-2">
                      <p className="text-xs text-slate-500">
                        Choisis une base pre-remplie selon la nature de ce lot (independant du numero de BB) :
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={selectedTemplateKey}
                          onChange={(e) => setSelectedTemplateKey(e.target.value)}
                          className="col-span-3 border border-slate-300 rounded-md px-2 py-1 text-xs"
                        >
                          {scopeTemplates.map((t) => (
                            <option key={t.key} value={t.key}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        {selectedTemplate?.hasMaterial && (
                          <>
                            <select
                              value={material}
                              onChange={(e) => setMaterial(e.target.value)}
                              className="border border-slate-300 rounded-md px-2 py-1 text-xs"
                            >
                              <option value="PEX">PEX</option>
                              <option value="Terrendis">Terrendis</option>
                              <option value="Acier">Acier</option>
                            </select>
                            <input
                              value={insulationClass}
                              onChange={(e) => setInsulationClass(e.target.value)}
                              placeholder="Classe d'isolation (optionnel)"
                              className="col-span-2 border border-slate-300 rounded-md px-2 py-1 text-xs"
                            />
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={templateSaving || !selectedTemplateKey}
                        onClick={handleLoadStandardTemplate}
                        className="text-xs text-brand-600 font-medium underline disabled:opacity-50"
                      >
                        {templateSaving ? "Chargement..." : "Charger cette base"}
                      </button>
                    </div>
                  )}
                  {lotTemplate.map((item) => (
                    <div key={item.id} className="grid grid-cols-5 gap-2 items-start">
                      <input
                        value={item.label}
                        onChange={(e) => handleUpdateTemplateItem(item.id, { label: e.target.value })}
                        className="border border-slate-300 rounded-md px-2 py-1 text-xs"
                      />
                      <input
                        value={item.commentaire || ""}
                        onChange={(e) => handleUpdateTemplateItem(item.id, { commentaire: e.target.value })}
                        placeholder="Description type du perimetre"
                        className="col-span-3 border border-slate-300 rounded-md px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplateItem(item.id)}
                        className="text-xs text-red-600 underline"
                      >
                        Supprimer
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddTemplateItem}
                    disabled={templateSaving}
                    className="text-xs text-brand-600 font-medium"
                  >
                    + Ajouter un poste au contrat type
                  </button>
                </div>
              )}

              <div className="space-y-1.5">
                {scope.length === 0 && (
                  <p className="text-xs text-slate-400">
                    Aucun poste dans la checklist. Chargez le contrat type ci-dessus ou ajoutez une ligne ponctuelle.
                  </p>
                )}
                {scope.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 bg-white border border-slate-200 rounded-md p-2">
                    <input
                      type="checkbox"
                      checked={item.inclus}
                      onChange={() => toggleScopeInclus(i)}
                      className="mt-1"
                      title="Inclus dans ce contrat"
                    />
                    <input
                      value={item.label}
                      onChange={(e) => updateScopeLabel(i, e.target.value)}
                      placeholder="Poste (ex: Hydraulique)"
                      className="w-40 border border-slate-300 rounded-md px-2 py-1 text-xs"
                    />
                    <input
                      value={item.commentaire}
                      onChange={(e) => updateScopeCommentaire(i, e.target.value)}
                      placeholder="Commentaire"
                      className="flex-1 border border-slate-300 rounded-md px-2 py-1 text-xs"
                    />
                    <span className={`text-xs font-medium mt-1 ${item.inclus ? "text-green-600" : "text-slate-400"}`}>
                      {item.inclus ? "Inclus" : "Non inclus"}
                    </span>
                    <button type="button" onClick={() => removeScopeLine(i)} className="text-xs text-red-600 underline mt-1">
                      x
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addAdHocScopeLine} className="text-xs text-brand-600 font-medium">
                  + Ajouter une ligne ponctuelle (pour ce contrat uniquement)
                </button>
              </div>
            </div>
          )}

          {visibleFieldGroups.map((group) => (
            <div key={group.title}>
              <p className="text-xs font-medium text-slate-600 mb-2">{group.title}</p>
              <div className="grid grid-cols-3 gap-2">
                {group.fields.map(([key, label, type]) => (
                  <input
                    key={key}
                    type={type === "number" ? "number" : "text"}
                    step={type === "number" ? "0.01" : undefined}
                    placeholder={label}
                    value={data[key]}
                    onChange={(e) => updateField(key, e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                  />
                ))}
              </div>
            </div>
          ))}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-brand-600 text-white text-sm py-2 rounded-md disabled:opacity-50"
          >
            {saving ? "Enregistrement..." : "Creer le contrat"}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {loading && <p className="text-sm text-slate-500">Chargement...</p>}
        {!loading && list.length === 0 && <p className="text-sm text-slate-500">Aucun contrat pour ce projet.</p>}
        {list.map((c) => {
          const expanded = expandedId === c.id;
          return (
            <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(expanded ? null : c.id)}>
                <div>
                  <span className="font-medium text-sm">{c.title}</span>
                  {c.lot && <span className="text-xs text-slate-400 ml-2">· {c.lot.code}</span>}
                  {c.subcontractor && <span className="text-xs text-slate-400 ml-2">· {c.subcontractor.name}</span>}
                  {c.templateKey && c.templateKey !== "COMPLET" && (
                    <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 ml-2">
                      {contractTemplates.find((t) => t.key === c.templateKey)?.label || c.templateKey}
                    </span>
                  )}
                  <span className="text-xs text-slate-400 ml-2">{new Date(c.createdAt).toLocaleDateString("fr-FR")}</span>
                </div>
                <span className="text-xs text-brand-600">{expanded ? "Reduire" : "Voir le detail"}</span>
              </div>

              {expanded && (
                <div className="mt-3 space-y-2 text-xs text-slate-600">
                  <p>Reference : {c.data?.PROJET || "—"}</p>
                  <p>Sous-traitant : {c.data?.ST_NOM || "—"}</p>
                  <p>Montant forfaitaire : {c.data?.MONTANT_FORFAIT ? `${c.data.MONTANT_FORFAIT} € HTVA` : "—"}</p>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => handleDownload(c, "docx")}
                      disabled={downloadingId === `${c.id}-docx`}
                      className="text-brand-600 font-medium underline disabled:opacity-50"
                    >
                      {downloadingId === `${c.id}-docx` ? "Generation..." : "Telecharger le .docx"}
                    </button>
                    <button
                      onClick={() => handleDownload(c, "pdf")}
                      disabled={downloadingId === `${c.id}-pdf`}
                      className="text-brand-600 font-medium underline disabled:opacity-50"
                      title="Conversion fidele au Word via LibreOffice"
                    >
                      {downloadingId === `${c.id}-pdf` ? "Conversion..." : "Telecharger le .pdf"}
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="text-red-600 font-medium underline">
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
