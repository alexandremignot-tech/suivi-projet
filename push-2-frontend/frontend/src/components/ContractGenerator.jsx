import { useState } from "react";
import client from "../api/client";

// Generateur de contrat de sous-traitance v2 — template "Contrat ponctuel de Sous-Entreprise"
// KARNO (V4). Tout est modulable par cases a cocher : variante metier, prestations de l'objet,
// sections juridiques optionnelles, garanties, annexes, criteres de reception, jalons de paiement.
// Sortie : un fichier Word (.docx) fidele au template, editable avant signature.

const PRESTATIONS = {
  HYDRO: [
    "La réalisation des études d'exécution et des vérifications techniques nécessaires à la bonne exécution des travaux",
    "La fourniture, la préfabrication, la soudure, la manutention, la pose et le raccordement de l'ensemble des tuyauteries, supports, vannes, accessoires, instruments et équipements",
    "Tous les équipements nécessaires à la sécurité, à la purge, à la stabilité et au bon fonctionnement hydraulique (purgeurs, soupapes, vases d'expansion...)",
    "La fourniture, la mise en place, le raccordement et la mise en service des équipements actifs (pompes à chaleur, échangeurs, pompes, ballons, adoucisseur...)",
    "Les opérations préalables à la mise en service : rinçage, nettoyage, purge, remplissage, mise en conformité de la qualité d'eau avec analyse initiale",
    "Les essais et la mise en service complète : étanchéité, fonctionnement, équilibrage hydraulique, mesures de débits et pressions",
    "L'assistance aux essais des automatismes, régulation et interfaces GTC des autres lots (max 4 jours ouvrables inclus)",
    "La garantie d'un fonctionnement sans cavitation, vibrations anormales ni contraintes, et le respect des exigences acoustiques",
    "La coordination avec les autres lots techniques (électricité, régulation/GTC, instrumentation, calorifuge, condensats)",
    "La fourniture du dossier technique complet (as-built, schémas, fiches techniques, PV de tests, certificats, notices, plan d'entretien, BIM si requis)",
  ],
  RET: [
    "La revue des plans, profils en long, limites d'entreprise, prescriptions fabricants et contraintes de site avant remise de prix",
    "Le devoir d'alerte immédiat en cas d'incohérence, erreur, omission, impossibilité technique ou défaut de sécurité",
    "La coordination avec le MO, l'AMO, le bureau d'étude, les gestionnaires de voirie, concessionnaires, entrepreneurs voisins, riverains et autorités",
    "La fourniture des documents préalables : planning, dossier d'exécution, PPSS, plans de circulation/signalisation/stockage/phasage, analyses de risques, procédures de pose, soudage et essais",
    "Les démarches impétrants KLIM-CICC / POWALCO et l'adaptation des méthodes",
    "Le terrassement, fouilles, blindages, talutage, accès sécurisé, pompage et gestion des eaux de fouille",
    "Le lit de pose, matériaux d'enrobage, remblais par couches, compactage et essais de compactage",
    "La pose et la soudure des conduites pré-isolées, le manchonnage et le raccordement du système de détection de fuite",
    "Les essais de pression et d'étanchéité, les contrôles non destructifs des soudures et la remise des PV",
    "La gestion des terres excavées, déchets, eaux pompées et matériaux pollués",
    "La réfection des voiries, trottoirs, accotements, dalles, bordures, marquages, pelouses et abords",
    "La remise en pristin état des lieux, au moins équivalente à l'état initial constaté",
    "La fourniture du dossier technique complet (plans as-built du tracé, rapports d'essais, certificats soudeurs, documentation détection de fuite)",
  ],
  GENERIQUE: [],
};

const RE1_DEFAULTS = {
  HYDRO: [
    "Tous les travaux décrits à l'objet sont exécutés dans leur intégralité",
    "Tests d'étanchéité EN 14336 réalisés et validés avec les PV signés",
    "Installation mise en eau, purgée, équilibrée et fonctionnelle conformément aux essais de mise en service",
    "Tous les équipements actifs opérationnels et testés",
    "Débits hydrauliques mesurés conformes aux documents d'exécution approuvés",
    "PPSS remis et approuvé par Karno avant démarrage",
    "Chantier propre et tous les déchets évacués",
    "Certificats de conformité et de garantie de toutes les machines, pièces, vannes et accessoires",
    "Notice d'utilisation de l'installation et plan d'entretien préventif détaillé",
    "Procès-verbaux de mise en service, d'équilibrage hydraulique et des essais fonctionnels remis et validés",
    "Dossier as-built complet : schémas hydrauliques, plans, documents de mise en service, note explicative",
  ],
  RET: [
    "Tous les travaux décrits à l'objet sont exécutés dans leur intégralité",
    "Essais de pression et d'étanchéité réalisés et validés avec les PV signés",
    "Contrôles non destructifs des soudures réalisés et conformes",
    "Système de détection de fuite raccordé, testé et documenté",
    "Essais de compactage réalisés et conformes",
    "Voiries, trottoirs et abords remis en pristin état",
    "PPSS remis et approuvé par Karno avant démarrage",
    "Chantier propre et tous les déchets évacués",
    "Certificats soudeurs et certificats de conformité des matériaux remis",
    "Dossier as-built complet : plan du tracé, profils, rapports d'essais, note explicative",
  ],
  GENERIQUE: [
    "Tous les travaux décrits à l'objet sont exécutés dans leur intégralité",
    "PPSS remis et approuvé par Karno avant démarrage",
    "Chantier propre et tous les déchets évacués",
    "Certificats de conformité et de garantie remis",
    "Dossier as-built complet remis",
  ],
};

const ANNEXES_DEFAULTS = [
  "Le Cahier Spécial des Charges",
  "Les Conditions Administratives Générales de Karno",
  "Le bon de commande de Karno",
  "Le document limites d'entreprise de Karno",
  "Les documents propres au chantier (planning directeur, contraintes d'organisation, plan HSE...)",
  "Les spécifications techniques et le bordereau de l'offre du Sous-traitant",
];

const OPTIONAL_SECTIONS = [
  ["revision", "Révision de prix (formule 0,20 + 0,40 S/S0 + 0,40 M/M0)", false],
  ["repercussion", "Répercussion des obligations du marché principal", true],
  ["hseq", "Santé, sécurité, environnement et qualité (HSEQ)", true],
  ["assuranceTRC", "Assurance tous risques chantier", true],
  ["confidentialite", "Confidentialité (10 ans)", true],
  ["cautionnement", "Cautionnement de bonne fin (10 %)", true],
  ["reunions", "Réunions de chantier", true],
  ["propriete", "Propriété des données et documents", true],
  ["publicite", "Publicité et référence commerciale (interdiction)", true],
  ["rgpd", "Traitement des données à caractère personnel (RGPD)", true],
  ["gestionAdmin", "Gestion documentaire avant réception définitive", true],
];

const GARANTIES = [
  ["machinesActives", "Machines actives (24 mois dès mise en service)", true],
  ["passifs", "Pièces, tuyauteries et éléments passifs (12 mois dès RE2)", true],
  ["perfHydraulique", "Performance hydraulique", true],
  ["qualiteEau", "Qualité d'eau initiale", true],
  ["acoustique", "Acoustique et vibratoire", true],
];

export default function ContractGenerator({ project, lot, subcontractors, onClose, onSaved }) {
  const lotSub = subcontractors.find((s) => s.id === lot.subcontractorId);
  const purchaseOrders = (project.budgetItems || []).filter(
    (i) => i.type === "expense" && ["PURCHASE_ORDER", "AMENDMENT"].includes(i.entryType) && i.lotId === lot.id
  );
  const guessVariant = /BB3|BB4|reseau|réseau|RET/i.test(`${lot.code} ${lot.name}`) ? "RET" : /BB2|BB5|BB8|chauff|hydrau|PAC|HIU/i.test(`${lot.code} ${lot.name}`) ? "HYDRO" : "GENERIQUE";

  const [step, setStep] = useState(0);
  const [variant, setVariant] = useState(guessVariant);
  const [sub, setSub] = useState({
    stNom: lotSub?.name || "",
    stForme: "SRL",
    stBce: lotSub?.vatNumber || "",
    stSiege: lotSub?.address || "",
    stRep: lotSub?.representative || "",
    stSpecialite: lotSub?.specialty || "",
  });
  const [stContact, setStContact] = useState({ nom: lotSub?.contactName || "", role: "", email: lotSub?.email || "", gsm: lotSub?.phone || "" });
  const [chantier, setChantier] = useState({
    chantierRef: `${project.name} — ${lot.code}`,
    chantierAdresse: "",
    amoNom: "",
    pidRef: "",
    objetResume: "",
    checkinAtWork: true,
  });
  const [prestations, setPrestations] = useState(() => new Set(PRESTATIONS[guessVariant].map((_, i) => i)));
  const [prestationsExtra, setPrestationsExtra] = useState("");
  const [prix, setPrix] = useState({ marcheType: "FORFAIT", montant: purchaseOrders[0]?.amount ?? lot.contractAmount ?? "", prixSourceId: purchaseOrders[0]?.id || "" });
  const [delais, setDelais] = useState({ dateDebut: "", dateFin: "", penaliteJour: "300", penalitePlafond: "10" });
  const [sections, setSections] = useState(() => Object.fromEntries(OPTIONAL_SECTIONS.map(([id, , def]) => [id, def])));
  const [garanties, setGaranties] = useState(() => Object.fromEntries(GARANTIES.map(([id, , def]) => [id, def])));
  const [criteresRE1, setCriteresRE1] = useState(() => new Set(RE1_DEFAULTS[guessVariant].map((_, i) => i)));
  const [annexes, setAnnexes] = useState(() => new Set(ANNEXES_DEFAULTS.map((_, i) => i)));
  const [annexesExtra, setAnnexesExtra] = useState("");
  const [jalons, setJalons] = useState([
    { pct: "30", label: "Acompte à la commande" },
    { pct: "30", label: "Livraison des équipements et matériaux sur site" },
    { pct: "30", label: "Fin de montage et mise en service" },
    { pct: "10", label: "Réception provisoire (RE1)" },
  ]);
  const [useJalons, setUseJalons] = useState(false); // sinon : EA mensuels
  const [equipeKarno, setEquipeKarno] = useState([
    { nom: "Gregory Meys", role: "Administrateur / CEO", email: "gregory.meys@karno.energy", gsm: "+32 475 40 35 38" },
    { nom: "Alexandre Mignot", role: "Project manager – Build", email: "alexandre.mignot@karno.energy", gsm: "+32 492 90 41 55" },
  ]);
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);

  const priceSource = purchaseOrders.find((x) => x.id === prix.prixSourceId);
  const jalonsTotal = jalons.reduce((s, j) => s + (Number(j.pct) || 0), 0);

  function changeVariant(v) {
    setVariant(v);
    setPrestations(new Set(PRESTATIONS[v].map((_, i) => i)));
    setCriteresRE1(new Set(RE1_DEFAULTS[v].map((_, i) => i)));
  }
  const toggleSet = (set, setter, i) => {
    const n = new Set(set);
    n.has(i) ? n.delete(i) : n.add(i);
    setter(n);
  };

  async function generate() {
    setBusy(true);
    try {
      const config = {
        variant,
        contratTitre: `${lot.name} — ${project.name}`,
        chantierRef: chantier.chantierRef,
        chantierAdresse: chantier.chantierAdresse,
        amoNom: chantier.amoNom || null,
        pidRef: chantier.pidRef,
        objetResume: chantier.objetResume,
        checkinAtWork: chantier.checkinAtWork,
        ...sub,
        stNomCourt: sub.stNom.split(" ")[0],
        stContact,
        contactPrincipal: equipeKarno[1] || equipeKarno[0],
        prestations: [
          ...PRESTATIONS[variant].filter((_, i) => prestations.has(i)),
          ...prestationsExtra.split("\n").map((l) => l.trim()).filter(Boolean),
        ],
        normes: [],
        ...delais,
        ...prix,
        montant: prix.montant,
        prixSource: priceSource ? `${priceSource.label} (${Number(priceSource.amount).toLocaleString("fr-FR")} € HTVA)` : null,
        revisionPrix: sections.revision,
        annexes: [
          ...ANNEXES_DEFAULTS.filter((_, i) => annexes.has(i)),
          ...annexesExtra.split("\n").map((l) => l.trim()).filter(Boolean),
        ],
        criteresRE1: RE1_DEFAULTS[variant].filter((_, i) => criteresRE1.has(i)),
        garanties,
        sections,
        paiementJalons: useJalons ? jalons.filter((j) => Number(j.pct) > 0) : null,
        equipeKarno,
        equipeAmo: [],
        equipeSt: [stContact].filter((x) => x.nom),
        lieuSignature: "Bruxelles",
        dateSignature: new Date().toLocaleDateString("fr-FR"),
        save,
      };
      const res = await client.post(`/lots/${lot.id}/contract.docx`, config, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Contrat-${lot.code}-${sub.stNom || "ST"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      if (lotSub && (sub.stBce || sub.stSiege || sub.stRep)) {
        await client
          .put(`/subcontractors/${lotSub.id}`, { vatNumber: sub.stBce, address: sub.stSiege, representative: sub.stRep })
          .catch(() => {});
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm";
  const STEPS = ["Chantier & parties", "Objet (checklist)", "Prix & délais", "Clauses & garanties", "Paiement & annexes"];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4 py-6">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[92vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Contrat de sous-traitance — {lot.code} {lot.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="flex gap-1 flex-wrap">
          {STEPS.map((s, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`text-xs px-3 py-1.5 rounded-full ${step === i ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {i + 1}. {s}
            </button>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {[["HYDRO", "Hydraulique / chaufferie"], ["RET", "Réseau enterré (RET)"], ["GENERIQUE", "Générique"]].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => changeVariant(v)}
                  className={`flex-1 text-sm border rounded-md px-3 py-2 ${variant === v ? "border-brand-500 bg-brand-50 text-brand-700 font-medium" : "border-slate-200 text-slate-600"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className={input} placeholder="Référence chantier" value={chantier.chantierRef} onChange={(e) => setChantier({ ...chantier, chantierRef: e.target.value })} />
              <input className={input} placeholder="Adresse du chantier" value={chantier.chantierAdresse} onChange={(e) => setChantier({ ...chantier, chantierAdresse: e.target.value })} />
              <input className={input} placeholder="AMO (ex: Resolia — vide si aucun)" value={chantier.amoNom} onChange={(e) => setChantier({ ...chantier, amoNom: e.target.value })} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={chantier.checkinAtWork} onChange={(e) => setChantier({ ...chantier, checkinAtWork: e.target.checked })} />
                Check-in At Work obligatoire
              </label>
            </div>
            <fieldset className="border border-slate-200 rounded-md p-3 grid grid-cols-2 gap-2">
              <legend className="text-xs font-semibold text-slate-500 px-1">Sous-traitant</legend>
              <input className={input} placeholder="Nom" value={sub.stNom} onChange={(e) => setSub({ ...sub, stNom: e.target.value })} />
              <select className={input} value={sub.stForme} onChange={(e) => setSub({ ...sub, stForme: e.target.value })}>
                {["SRL", "SA", "SPRL", "SNC", "indépendant", ""].map((f) => <option key={f} value={f}>{f || "—"}</option>)}
              </select>
              <input className={input} placeholder="N° BCE" value={sub.stBce} onChange={(e) => setSub({ ...sub, stBce: e.target.value })} />
              <input className={input} placeholder="Siège social" value={sub.stSiege} onChange={(e) => setSub({ ...sub, stSiege: e.target.value })} />
              <input className={input} placeholder="Représenté par" value={sub.stRep} onChange={(e) => setSub({ ...sub, stRep: e.target.value })} />
              <input className={input} placeholder="Spécialité" value={sub.stSpecialite} onChange={(e) => setSub({ ...sub, stSpecialite: e.target.value })} />
              <input className={input} placeholder="Contact — nom" value={stContact.nom} onChange={(e) => setStContact({ ...stContact, nom: e.target.value })} />
              <input className={input} placeholder="Contact — email / GSM" value={stContact.email} onChange={(e) => setStContact({ ...stContact, email: e.target.value })} />
            </fieldset>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-2">
            <input className={input} placeholder={variant === "RET" ? "Résumé de l'objet (ex: du réseau de chaleur enterré tronçon T2)" : "Résumé de l'objet (ex: de l'installation hydraulique de la chaufferie)"} value={chantier.objetResume} onChange={(e) => setChantier({ ...chantier, objetResume: e.target.value })} />
            {variant === "HYDRO" && <input className={input} placeholder="Référence P&ID (ex: K-0044-P&ID)" value={chantier.pidRef} onChange={(e) => setChantier({ ...chantier, pidRef: e.target.value })} />}
            <p className="text-xs text-slate-500">Prestations incluses ({prestations.size}/{PRESTATIONS[variant].length}) — décoche ce qui ne s'applique pas :</p>
            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-50">
              {PRESTATIONS[variant].map((x, i) => (
                <label key={i} className="flex items-start gap-2 text-xs px-3 py-1.5 cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" checked={prestations.has(i)} onChange={() => toggleSet(prestations, setPrestations, i)} className="mt-0.5" />
                  <span>{x}</span>
                </label>
              ))}
            </div>
            <textarea className={input} rows={2} placeholder="Prestations supplémentaires (une par ligne)" value={prestationsExtra} onChange={(e) => setPrestationsExtra(e.target.value)} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <select className={input} value={prix.marcheType} onChange={(e) => setPrix({ ...prix, marcheType: e.target.value })}>
                <option value="FORFAIT">Marché à Forfait Absolu</option>
                <option value="BORDEREAU">Marché à bordereau de prix unitaires</option>
                <option value="REGIE">Marché en régie</option>
              </select>
              <input className={input} type="number" step="0.01" placeholder="Montant HTVA" value={prix.montant} onChange={(e) => setPrix({ ...prix, montant: e.target.value })} />
              <select
                className={`${input} col-span-2`}
                value={prix.prixSourceId}
                onChange={(e) => {
                  const po = purchaseOrders.find((x) => x.id === e.target.value);
                  setPrix({ ...prix, prixSourceId: e.target.value, montant: po ? po.amount : prix.montant });
                }}
              >
                <option value="">Devis / BC de référence du registre (annexe)...</option>
                {purchaseOrders.map((x) => (
                  <option key={x.id} value={x.id}>{x.label} — {Number(x.amount).toLocaleString("fr-FR")} €</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">Début des travaux<input type="date" className={input} value={delais.dateDebut} onChange={(e) => setDelais({ ...delais, dateDebut: e.target.value })} /></label>
              <label className="text-xs text-slate-500">Fin des travaux<input type="date" className={input} value={delais.dateFin} onChange={(e) => setDelais({ ...delais, dateFin: e.target.value })} /></label>
              <label className="text-xs text-slate-500">Pénalité € / jour ouvrable<input className={input} value={delais.penaliteJour} onChange={(e) => setDelais({ ...delais, penaliteJour: e.target.value })} /></label>
              <label className="text-xs text-slate-500">Plafond pénalités (% du marché)<input className={input} value={delais.penalitePlafond} onChange={(e) => setDelais({ ...delais, penalitePlafond: e.target.value })} /></label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <fieldset className="border border-slate-200 rounded-md p-3">
              <legend className="text-xs font-semibold text-slate-500 px-1">Sections optionnelles du contrat</legend>
              <div className="grid grid-cols-2 gap-1">
                {OPTIONAL_SECTIONS.map(([id, label]) => (
                  <label key={id} className="flex items-start gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={sections[id]} onChange={(e) => setSections({ ...sections, [id]: e.target.checked })} className="mt-0.5" />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="border border-slate-200 rounded-md p-3">
              <legend className="text-xs font-semibold text-slate-500 px-1">Garanties spécifiques (la garantie générale est toujours incluse)</legend>
              <div className="grid grid-cols-2 gap-1">
                {GARANTIES.map(([id, label]) => (
                  <label key={id} className="flex items-start gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={garanties[id]} onChange={(e) => setGaranties({ ...garanties, [id]: e.target.checked })} className="mt-0.5" />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="border border-slate-200 rounded-md p-3">
              <legend className="text-xs font-semibold text-slate-500 px-1">Critères de réception provisoire (RE1)</legend>
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {RE1_DEFAULTS[variant].map((x, i) => (
                  <label key={i} className="flex items-start gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={criteresRE1.has(i)} onChange={() => toggleSet(criteresRE1, setCriteresRE1, i)} className="mt-0.5" />
                    <span>{x}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <fieldset className="border border-slate-200 rounded-md p-3 space-y-2">
              <legend className="text-xs font-semibold text-slate-500 px-1">Calendrier des paiements</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={!useJalons} onChange={() => setUseJalons(false)} />
                États d'avancement mensuels validés par Karno
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={useJalons} onChange={() => setUseJalons(true)} />
                Jalons de paiement ({jalonsTotal} % — doit faire 100)
              </label>
              {useJalons &&
                jalons.map((j, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="w-16 border border-slate-300 rounded-md px-2 py-1 text-sm text-right" value={j.pct} onChange={(e) => setJalons(jalons.map((x, k) => (k === i ? { ...x, pct: e.target.value } : x)))} />
                    <input className="flex-1 border border-slate-300 rounded-md px-2 py-1 text-sm" value={j.label} onChange={(e) => setJalons(jalons.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
                  </div>
                ))}
            </fieldset>
            <fieldset className="border border-slate-200 rounded-md p-3">
              <legend className="text-xs font-semibold text-slate-500 px-1">Annexes</legend>
              {variant === "HYDRO" && <p className="text-[11px] text-slate-400 mb-1">Le P&ID est ajouté automatiquement en annexe 1 si renseigné à l'étape 2.</p>}
              <div className="space-y-0.5">
                {ANNEXES_DEFAULTS.map((x, i) => (
                  <label key={i} className="flex items-start gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={annexes.has(i)} onChange={() => toggleSet(annexes, setAnnexes, i)} className="mt-0.5" />
                    <span>{x}</span>
                  </label>
                ))}
              </div>
              <textarea className={`${input} mt-2`} rows={2} placeholder="Annexes supplémentaires (une par ligne, ex: le P&ID K-0044)" value={annexesExtra} onChange={(e) => setAnnexesExtra(e.target.value)} />
            </fieldset>
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
            Enregistrer comme document « Contrat » du lot
          </label>
          <div className="flex gap-2">
            {step > 0 && <button onClick={() => setStep(step - 1)} className="text-sm px-3 py-2 rounded-md border border-slate-300">← Précédent</button>}
            {step < STEPS.length - 1 ? (
              <button onClick={() => setStep(step + 1)} className="bg-slate-800 text-white text-sm px-4 py-2 rounded-md">Suivant →</button>
            ) : (
              <button onClick={generate} disabled={busy || !sub.stNom || (useJalons && jalonsTotal !== 100)} className="bg-brand-600 text-white text-sm px-4 py-2 rounded-md disabled:opacity-50">
                {busy ? "Génération..." : "Générer le contrat (Word)"}
              </button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Document généré depuis ton template V4 « contrat ponctuel de sous-entreprise » : relis-le dans Word avant
          signature — je ne suis pas juriste, et une clause propre au marché peut manquer.
        </p>
      </div>
    </div>
  );
}
