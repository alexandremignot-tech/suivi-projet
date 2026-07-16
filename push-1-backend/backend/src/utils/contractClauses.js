// Bibliotheque de clauses du contrat de sous-traitance KARNO.
// Texte repris VERBATIM du template maitre "V4 K-0054" (contrat ponctuel de sous-entreprise),
// complete par la variante RET (K-0167 MontLegia) et le modele chaufferie (K-xxxx).
// Chaque section rend une liste de blocs { type: "h1"|"h2"|"h3"|"p"|"li", text } a partir de la
// configuration envoyee par le generateur. Les sections optionnelles sont cochables dans l'UI.

function money(n) {
  return Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const h2 = (text) => ({ type: "h2", text });
const h3 = (text) => ({ type: "h3", text });
const p = (text) => ({ type: "p", text });
const li = (text) => ({ type: "li", text });

// ---------------------------------------------------------------------------
// Variantes metier : texte d'objet et referentiels normatifs
// ---------------------------------------------------------------------------
const VARIANTS = {
  HYDRO: {
    label: "Hydraulique / chaufferie / local technique",
    objetIntro: (c) =>
      `Le présent marché porte, sur base des documents d'exécution approuvés (notamment le P&ID « ${c.pidRef || c.chantierRef + "-P&ID"} », les plans, notes de calcul, schémas d'équilibrage et documents de régulation), sur les études d'exécution, la fourniture, l'installation et la mise en service complète ${c.objetResume || "de l'installation hydraulique du local technique"}.`,
    prestations: [
      "La réalisation des études d'exécution et des vérifications techniques nécessaires à la bonne exécution des travaux (vérification de cohérence hydraulique, pertes de charge, débits et équilibrage hydraulique) ; toute modification, adaptation ou solution alternative proposée ou implémentée par le Sous-traitant — même après validation préalable de Karno et de son AMO — relève de la responsabilité exclusive du Sous-traitant",
      "La fourniture, la préfabrication, la soudure, la manutention, la pose et le raccordement de l'ensemble des tuyauteries, supports, vannes, accessoires, instruments et équipements nécessaires au bon fonctionnement de l'installation",
      "Tous les équipements nécessaires à la sécurité, à la purge, à la stabilité et au bon fonctionnement hydraulique de l'installation, notamment les purgeurs automatiques, soupapes, vases d'expansion et accessoires liés aux pressions de service prévues dans les documents d'exécution",
      "La fourniture, la manutention, la mise en place, le raccordement, l'installation et la mise en service de l'ensemble des équipements actifs du local technique, notamment pompes à chaleur, échangeurs, pompes, ballons, adoucisseur et équipements associés",
      "Les opérations préalables à la mise en service : rinçage, nettoyage, purge et remplissage des réseaux, ainsi que la mise en conformité de la qualité d'eau conformément aux prescriptions des fabricants ; une analyse initiale de l'eau sera fournie et soumise à validation de la Maîtrise d'Ouvrage et de son AMO avant mise en service définitive",
      "La réalisation des essais et de la mise en service complète de l'installation : tests d'étanchéité, essais de fonctionnement des équipements, équilibrage hydraulique des réseaux, mesure et vérification des débits et pressions différentielles aux points caractéristiques, essais fonctionnels des équipements hydrauliques",
      "L'assistance aux essais des automatismes, sécurités, régulation et interfaces GTC réalisés par les autres lots techniques (limitée à un maximum de 4 jours ouvrables inclus dans le forfait)",
      "La garantie d'un fonctionnement conforme des équipements et réseaux hydrauliques, sans cavitation, vibrations anormales ni contraintes susceptibles de dégrader prématurément les installations, ainsi que le respect des exigences acoustiques applicables au projet",
      "La coordination avec les autres lots techniques pour toutes les interfaces nécessaires (alimentation électrique, régulation/GTC, instrumentation, calorifuge, évacuation des condensats)",
      "La fourniture du dossier technique complet : plans as-built, schémas hydrauliques mis à jour, fiches techniques, rapports de tests (pression et étanchéité), certificats de conformité et de garantie, notices d'exploitation, réglages réalisés et plan d'entretien ; lorsque requis, un modèle BIM mis à jour",
    ],
    normes: [
      "la norme EN 13480 relative aux tuyauteries industrielles",
      "la norme EN 14336 relative à l'installation et à la mise en service des systèmes hydrauliques de chauffage et de refroidissement",
      "la norme EN 806-4 relative aux installations d'eau destinée à la consommation humaine, si applicable",
      "les normes belges NBN applicables",
      "les codes de bonne pratique publiés par l'IBN et le CSTC (Buildwise)",
      "les prescriptions des fabricants des équipements installés",
    ],
  },
  RET: {
    label: "Réseau de chaleur enterré (RET)",
    objetIntro: (c) =>
      `Le Maître d'Ouvrage charge le Sous-traitant, qui accepte, d'exécuter les prestations nécessaires, lorsque applicable, à la préparation, la fabrication, la fourniture, le transport, le stockage, la manutention, la pose, la soudure, le raccordement, le manchonnage, les essais, le remblai, la réfection et la documentation ${c.objetResume || "du réseau de chaleur enterré"} repris au présent contrat.`,
    prestations: [
      "La revue des plans, profils en long, limites d'entreprise, prescriptions fabricants et contraintes de site avant remise de prix",
      "Le devoir d'alerte immédiat en cas d'incohérence, erreur, omission, impossibilité technique, défaut de sécurité ou risque pour les performances du réseau",
      "La coordination avec le Maître d'Ouvrage, son AMO, son bureau d'étude, les gestionnaires de voirie, les concessionnaires, les entrepreneurs voisins, les riverains et les autorités",
      "La fourniture, avant tout démarrage, des documents préalables : planning, dossier d'exécution, PPSS, plan de circulation, plan de signalisation, plan de stockage, plan de phasage, analyse de risques, fiches techniques, procédures de pose, procédures de soudage, notes de calcul, calculs de dilatation, notes de supportage et procédures d'essais",
      "Les démarches impétrants KLIM-CICC / POWALCO et l'adaptation des méthodes, lorsque cette mission est confiée",
      "Le terrassement, les fouilles, blindages, talutage, accès sécurisé, pompage et gestion des eaux de fouille",
      "La mise en oeuvre du lit de pose, des matériaux d'enrobage, les remblais par couches, le compactage et les essais de compactage",
      "La pose et la soudure des conduites pré-isolées, le manchonnage, le raccordement du système de détection de fuite et les contrôles associés",
      "Les essais de pression et d'étanchéité, les contrôles non destructifs des soudures et la remise des PV correspondants",
      "La gestion des terres excavées, déchets, eaux pompées et matériaux pollués conformément aux obligations applicables",
      "La réfection des voiries, trottoirs, accotements, dalles, bordures, marquages, pelouses et abords",
      "La remise en pristin état des lieux, au moins équivalente à l'état initial constaté",
      "La fourniture du dossier technique complet : plans as-built du tracé, rapports d'essais et de contrôles, certificats soudeurs, fiches techniques et documentation du système de détection de fuite",
    ],
    normes: [
      "systèmes de canalisations pré-isolées : EN 253, EN 448, EN 488, EN 489 et normes équivalentes applicables",
      "conception et installation des réseaux enterrés : EN 13941-1 et EN 13941-2, incluant les exigences de programme d'assurance qualité",
      "systèmes de surveillance et détection de fuite : EN 14419 ou équivalent, si applicable",
      "tuyauteries industrielles métalliques : EN 13480, si applicable",
      "procédés de soudage : EN ISO 15614, EN ISO 9606-1, EN ISO 3834, EN ISO 14732 ou normes équivalentes applicables",
      "NBN EN 13067 (qualification des soudeurs d'assemblages thermoplastiques), lorsque des conduites ou accessoires thermoplastiques sont mis en oeuvre",
      "contrôles non destructifs : EN ISO 9712 pour les opérateurs CND ou norme équivalente applicable",
      "CCT Qualiroutes, lorsque les travaux concernent une voirie ou un domaine soumis à ce référentiel",
      "les prescriptions du fabricant des conduites, accessoires, manchons et systèmes de détection",
      "les prescriptions des autorités, gestionnaires de voirie, gestionnaires d'impétrants, propriétaires privés et coordinateurs sécurité",
    ],
  },
  GENERIQUE: {
    label: "Générique (autre corps d'état)",
    objetIntro: (c) =>
      `Le Maître d'Ouvrage charge le Sous-traitant, qui accepte, d'exécuter ${c.objetResume || "les travaux décrits ci-dessous"}, sur base des documents d'exécution approuvés.`,
    prestations: [],
    normes: [
      "les normes belges NBN applicables aux travaux concernés",
      "les codes de bonne pratique publiés par Buildwise (CSTC)",
      "les prescriptions des fabricants des équipements et matériaux mis en oeuvre",
    ],
  },
};

// ---------------------------------------------------------------------------
// Sections du contrat (ordre du template V4)
// ---------------------------------------------------------------------------
const SECTIONS = [
  {
    id: "chantier",
    title: "Informations générales du chantier",
    core: true,
    render: (c) => [
      p("Le chantier est identifié comme suit :"),
      li(c.chantierRef),
      li(`Adresse du chantier : ${c.chantierAdresse}`),
      ...(c.checkinAtWork ? [li("Déclaration Check-in At Work obligatoire avant tout accès au chantier")] : []),
      ...(c.amoNom
        ? [p(`Pour ce chantier, Karno a décidé de s'adjoindre les services du bureau d'étude ${c.amoNom} comme Assistant maîtrise d'ouvrage (AMO). ${c.amoNom} sera ci-après dénommé l'AMO.`)]
        : []),
    ],
  },
  {
    id: "objet",
    title: "Objet",
    core: true,
    render: (c) => {
      const v = VARIANTS[c.variant] || VARIANTS.GENERIQUE;
      return [
        p(v.objetIntro(c)),
        ...(c.prestations.length ? [p("Les prestations comprennent notamment :")] : []),
        ...c.prestations.map((x) => li(x)),
      ];
    },
  },
  {
    id: "normes",
    title: "Normes et référentiels applicables",
    core: true,
    render: (c) => {
      const v = VARIANTS[c.variant] || VARIANTS.GENERIQUE;
      return [
        p("Les travaux seront exécutés conformément aux règles de l'art et aux normes en vigueur, et notamment :"),
        ...(c.normes.length ? c.normes : v.normes).map((x) => li(x)),
        p("Le Sous-traitant respecte également toute autre norme, directive, exigence réglementaire ou prescription technique applicable aux équipements et travaux réalisés, même lorsqu'elle n'est pas expressément citée."),
        p("Tous les équipements, matériaux et accessoires fournis devront être neufs, adaptés à l'usage prévu et conformes aux réglementations européennes applicables. Ils devront notamment disposer des certifications, marquages et attestations requis, incluant le marquage CE, la conformité PED lorsque applicable, ainsi que toute certification spécifique exigée par les normes applicables ou les fabricants des équipements."),
      p("En cas de contradiction entre plusieurs documents contractuels ou référentiels techniques, l'ordre de priorité suivant s'applique : (1) les instructions écrites de Karno ; (2) les validations et prescriptions de l'AMO ; (3) les plans et schémas d'exécution approuvés ; (4) le présent contrat et les clauses techniques ; (5) les notes de calcul approuvées ; (6) les normes et réglementations applicables ; (7) les prescriptions des fabricants ; (8) les règles de l'art."),
        p("Le Sous-traitant est réputé connaître l'ensemble des prescriptions réglementaires et normatives applicables à ses travaux et en assurer la pleine conformité."),
      ];
    },
  },
  {
    id: "delais",
    title: "Programme et délais d'exécution",
    core: true,
    render: (c) => [
      p("Les travaux sous-traités sont programmés comme suit :"),
      li(`Date de début des travaux : le ${c.dateDebut || "..............."}`),
      li(`Date de fin des travaux : le ${c.dateFin || "..............."}`),
      p("Ces dates sont indicatives et peuvent évoluer en fonction de la réalité des évènements sur chantier."),
      p("La date de la réunion de kick-off sera communiquée par Karno par écrit au plus tard 10 jours ouvrables avant le démarrage effectif du chantier. Le Sous-traitant s'engage impérativement à fournir, dans les 5 jours ouvrables suivant cette réunion de kick-off, un planning détaillé du chantier reprenant les différentes phases d'exécution des travaux sous-traités et leurs durées, en tenant compte des contraintes de phasage imposées pour garantir la parfaite coordination avec les prestations des tiers."),
      p("Karno se réserve le droit de modifier les dates de début et de fin des phases en fonction de l'état d'avancement général du chantier, sans que cela puisse modifier le montant global du chantier. Toutefois, tout retard ou décalage de planning indépendant de la volonté et de la responsabilité du Sous-traitant ouvrira droit de plein droit à une prolongation proportionnelle des délais d'exécution et au report de la date de fin des travaux, sans application de pénalités. Le Sous-traitant s'engage néanmoins à mettre en oeuvre tous les moyens raisonnables pour minimiser l'impact de ce décalage sur le planning final."),
      p("En cas de retard imputable au Sous-traitant, celui-ci supporte, de plein droit et sans mise en demeure préalable :"),
      li(`Une indemnité forfaitaire de ${c.penaliteJour || "300"} € par jour ouvrable de retard`),
      li("Les coûts directs et indirects de désorganisation qui en résultent pour Karno"),
      li("La part proportionnelle de toute pénalité de retard mise à charge de Karno par son client final, dès lors que ce retard est causé par le Sous-traitant"),
      p(`Le montant cumulé des pénalités forfaitaires de retard est plafonné à ${c.penalitePlafond || "10"} % du montant HTVA du marché, sans préjudice du droit de Karno de réclamer l'indemnisation des dommages réels non couverts par ces pénalités.`),
      p("Aucune pénalité ou indemnité ne sera due par le Sous-traitant si le retard est imputable, directement ou indirectement, à Karno, à ses autres sous-traitants ou à son client final. Dans ce cas, le Sous-traitant bénéficiera de plein droit d'une prolongation des délais d'exécution équivalente au retard constaté."),
      p("Le Sous-traitant ne peut en aucun cas invoquer pour justifier un retard : les intempéries raisonnablement prévisibles pour la saison et le type de travaux, les difficultés d'approvisionnement ou d'organisation interne, la charge de travail ou l'indisponibilité de son personnel ou de ses propres sous-traitants, ni tout autre élément relevant de sa propre responsabilité ou de la gestion normale d'un chantier."),
    ],
  },
  {
    id: "prix",
    title: "Marché et prix",
    core: true,
    render: (c) => {
      const type = {
        FORFAIT: `Les travaux sont exécutés dans le cadre d'un Marché à Forfait Absolu pour le prix de ${money(c.montant)} € HTVA, TVA en sus au taux légal. Ce prix couvre l'intégralité des prestations, en ce compris tous frais, fournitures, moyens humains et techniques, transports, manutentions, consommables, sujétions normales d'exécution, nettoyages, essais, replis et documents de fin de chantier.`,
        BORDEREAU: `Les travaux sont exécutés dans le cadre d'un marché à bordereau de prix unitaires, pour un montant présumé de ${money(c.montant)} € HTVA, TVA en sus au taux légal. Les quantités sont présumées et seront revues selon les quantités réellement exécutées, mesurées contradictoirement sur base du bordereau en annexe.`,
        REGIE: `Les travaux sont exécutés en régie, aux taux horaires et prix unitaires du bordereau en annexe, pour un budget indicatif de ${money(c.montant)} € HTVA, TVA en sus au taux légal.`,
      }[c.marcheType || "FORFAIT"];
      return [
        p(type),
        ...(c.prixSource ? [p(`Ce montant est établi sur base de : ${c.prixSource}, joint(e) en annexe.`)] : []),
        ...(c.revisionPrix
          ? []
          : [p("Les prix sont fermes et non révisables pour toute la durée du chantier. Le Sous-traitant ne pourra en aucun cas invoquer une hausse des matériaux, des salaires, de l'énergie ou de tout autre facteur pour réclamer une révision du forfait.")]),
      ];
    },
  },
  {
    id: "revision",
    title: "Révision de prix",
    optional: true,
    default: false,
    render: (c) => [
      p("Le prix fixé au présent contrat est établi sur la base des conditions économiques (coût des matériaux, de la main-d'oeuvre et de l'énergie) en vigueur à la date de signature."),
      p(`Dans l'hypothèse où la durée d'exécution des travaux excède ${c.revisionSeuilMois || "3"} mois à compter de la date de début, le prix pourra faire l'objet d'une révision, à la hausse comme à la baisse, selon la formule suivante :`),
      p("P = P0 × (0,20 + 0,40 × (S/S0) + 0,40 × (M/M0))"),
      p("où P0 est le prix initial, S0/S l'indice de référence des salaires du secteur de la construction à la date de signature et à la date de révision, et M0/M l'indice de référence des matériaux concernés aux mêmes dates."),
      p("Cette révision ne s'applique qu'à la partie des travaux restant à exécuter à la date de calcul ; elle ne peut être invoquée rétroactivement sur les états d'avancement déjà validés et payés. Toute demande de révision est formulée par écrit, accompagnée des justificatifs d'indices officiels. Le présent article ne s'applique pas aux travaux supplémentaires ou modifications."),
    ],
  },
  {
    id: "travauxSupp",
    title: "Travaux supplémentaires, modifications et imprévus",
    core: true,
    render: () => [
      p("Toute modification du périmètre des travaux confiés doit faire l'objet d'un accord écrit préalable de Karno. Le Sous-traitant ne peut exécuter aucun travail supplémentaire de sa propre initiative s'il entend en réclamer le paiement. Sauf accord écrit contraire, les travaux exécutés sans ordre écrit préalable de Karno sont réputés inclus dans le prix du marché."),
      p("En cas de difficulté imprévue majeure ou de modification substantielle impactant le chemin critique des travaux, le Sous-traitant en informe immédiatement Karno par écrit, détaille de manière circonstanciée les causes et conséquences, et soumet des propositions techniques ainsi qu'un chiffrage de l'impact (coût et délai)."),
      p("Le Sous-traitant suspend, si nécessaire, la partie concernée dans l'attente des instructions écrites de Karno. Si cette suspension affecte directement et de manière démontrable l'avancement général du chantier, les parties se rapprocheront sous 3 jours pour convenir d'un éventuel avenant de prorogation de délai."),
    ],
  },
  {
    id: "forceMajeure",
    title: "Force majeure",
    core: true,
    render: () => [
      p("Aucune Partie n'est responsable d'un retard résultant directement d'un cas de force majeure au sens du droit belge, à condition d'en avertir l'autre Partie sans délai et de prendre toutes mesures raisonnables pour en limiter les effets."),
      p("Ne constituent pas des cas de force majeure dans le chef du Sous-traitant : la panne d'engins, machines ou véhicules ; le défaut ou l'insuffisance de personnel ou d'organisation ; l'indisponibilité de fournisseurs ou sous-traitants ; la mauvaise appréciation des contraintes normales du chantier ; les difficultés financières ou de trésorerie ; les intempéries raisonnablement prévisibles pour la saison et le type de travaux concernés."),
    ],
  },
  {
    id: "repercussion",
    title: "Répercussion des obligations du marché principal",
    optional: true,
    default: true,
    render: () => [
      p("Le Sous-traitant reconnaît que ses prestations s'inscrivent dans le cadre d'un marché exécuté par Karno pour le compte de son client final. Le présent contrat est conclu selon un principe de répercussion des obligations du marché principal à charge du Sous-traitant."),
      p("Toute faute, retard, omission, non-conformité ou manquement imputable au Sous-traitant ayant pour conséquence, dans le chef de Karno, une pénalité, un refus, une reprise, un coût supplémentaire, une réclamation, une perte d'exploitation ou un dommage quelconque, pourra être répercuté à charge du Sous-traitant, à due concurrence du préjudice réellement subi par Karno, en ce compris les coûts internes raisonnables de gestion et de coordination."),
    ],
  },
  {
    id: "annexes",
    title: "Annexes - documents régissant la sous-entreprise",
    core: true,
    render: (c) => [
      p("Les documents de référence énumérés ci-après font partie intégrante de la présente convention et des Documents Contractuels. Ils en constituent les annexes, se complètent et, le cas échéant, prévalent sur les autres documents régissant la sous-entreprise."),
      ...c.annexes.map((a, i) => li(`Annexe n° ${i + 1} : ${a}`)),
    ],
  },
  {
    id: "reception",
    title: "Réception provisoire (RE1) et définitive (RE2)",
    core: true,
    render: (c) => [
      h3("Critères de la réception provisoire (RE1)"),
      p("La réception provisoire est accordée lorsque toutes les conditions suivantes sont réunies :"),
      ...c.criteresRE1.map((x) => li(x)),
      p(`En cas de non-remise d'un ou plusieurs éléments ci-dessus, Karno est en droit de refuser la RE1, de retenir le solde correspondant (${c.retenueRE1 || "10"} %) et d'appliquer une pénalité de ${c.penaliteRE1 || "150"} € par jour calendrier de retard.`),
      h3("Réception définitive (RE2)"),
      p(`La réception définitive est prononcée ${c.delaiRE2Mois || "12"} mois après la date de la RE1, sous réserve que les deux conditions cumulatives suivantes soient remplies : toutes les réserves formulées lors de la RE1 ont été levées et acceptées par Karno ; toutes les remarques et défauts apparus durant la première année d'utilisation ont été levés et acceptés par Karno.`),
      p("Le Sous-traitant intervient, dans un délai raisonnable adapté à la criticité du défaut, dans les 10 jours ouvrables suivant toute notification écrite de Karno signalant un défaut. Le délai de la RE2 est suspendu pour toute période durant laquelle le Sous-traitant n'a pas levé une réserve dans le délai imparti."),
    ],
  },
  {
    id: "garanties",
    title: "Garanties et fonctionnement",
    core: true,
    render: (c) => {
      const g = c.garanties || {};
      const out = [
        h3("Garantie générale"),
        p("Le Sous-traitant garantit que l'installation livrée est complète, conforme aux documents d'exécution approuvés, aux normes applicables, aux règles de l'art et apte à fonctionner dans les conditions prévues au présent contrat."),
        p("Cette garantie couvre notamment les défauts de fourniture, de fabrication, de montage, de soudure, de raccordement, de supportage, de dilatation, de réglage, d'équilibrage hydraulique, de rinçage, de qualité d'eau initiale et de mise en service relevant du périmètre du Sous-traitant. Les limitations, exclusions ou refus de prise en charge des garanties fabricants ne limitent en aucun cas les obligations contractuelles de garantie du Sous-traitant envers Karno."),
      ];
      if (g.machinesActives)
        out.push(
          h3("Garanties sur les machines actives"),
          p(`La garantie de base sur les machines actives prend cours à la date de mise en service validée par Karno ou son AMO et est de ${c.garantieMachinesMois || "24"} mois à compter de cette date. Par machines actives sont notamment entendues : les pompes à chaleur, pompes, vannes motorisées, échangeurs, adoucisseur et tout équipement nécessitant une alimentation, un réglage, une commande ou une maintenance spécifique. Les garanties fabricants relatives aux machines actives sont transmises à Karno ; lorsqu'elles sont plus favorables que la garantie de base, elles s'appliquent au bénéfice de Karno.`)
        );
      if (g.passifs)
        out.push(
          h3("Garanties sur les pièces, tuyauteries et éléments passifs"),
          p(`La garantie de base sur les pièces, tuyauteries et éléments passifs est de ${c.garantiePassifsMois || "12"} mois à compter de la date de réception définitive. Sont notamment entendus : tuyauteries, soudures, supports, fixations, manchons, raccords, brides, joints, vannes manuelles, clapets, purgeurs, filtres, ballons, calorifugeage et accessoires. Cette garantie couvre notamment les défauts d'étanchéité, de soudure, d'assemblage, de supportage, de dilatation, de raccordement, de tenue mécanique du calorifuge, de condensation anormale ou de dégradation prématurée.`)
        );
      if (g.perfHydraulique)
        out.push(
          h3("Garantie de performance hydraulique"),
          p("La garantie couvre également les défauts résultant d'un mauvais équilibrage hydraulique, d'un mauvais réglage, d'un défaut de mise en service ou d'une mauvaise préparation initiale des réseaux. La responsabilité finale de la conception et du dimensionnement théorique incombe à l'AMO via l'approbation des documents d'exécution.")
        );
      if (g.qualiteEau)
        out.push(
          h3("Garantie sur la qualité d'eau initiale"),
          p("Le Sous-traitant garantit que les opérations de rinçage, nettoyage, purge, remplissage et mise en qualité initiale de l'eau ont été réalisées conformément aux prescriptions des fabricants, aux normes applicables et aux exigences validées par Karno ou son AMO. Il reste responsable des désordres résultant d'une mauvaise préparation, d'un mauvais rinçage, d'un défaut de purge ou d'une mauvaise mise en qualité initiale des réseaux.")
        );
      if (g.acoustique)
        out.push(
          h3("Garantie acoustique et vibratoire"),
          p("Le Sous-traitant garantit que les équipements et réseaux relevant de son périmètre ne génèrent pas de bruit, vibration, cavitation ou contrainte anormale susceptible de dégrader l'installation ou de dépasser les exigences acoustiques applicables au projet.")
        );
      out.push(
        h3("Interventions sous garantie"),
        p(`Tout défaut notifié par écrit par Karno pendant la période de garantie doit faire l'objet d'une intervention du Sous-traitant dans un délai maximal de ${c.delaiInterventionJours || "15"} jours ouvrables. En cas d'urgence, de fuite, de risque de dégradation des équipements, d'arrêt de production ou d'interruption significative du service, le Sous-traitant intervient dans un délai maximal de ${c.delaiUrgence || "48 heures"} suivant la notification de Karno.`),
        p("Toute intervention sous garantie inclut les opérations nécessaires au rétablissement complet des conditions normales de fonctionnement, notamment purges, remplissages, réglages, équilibrages, contrôles et remises en service. Les pièces remplacées ou réparées dans le cadre de la garantie bénéficient d'une nouvelle garantie de 12 mois."),
        h3("Interfaces avec les autres lots"),
        p("Le Sous-traitant ne peut être exonéré de ses obligations de garantie qu'en cas de démonstration claire que le défaut provient exclusivement d'un autre lot, d'une intervention extérieure non autorisée ou d'une cause indépendante de son périmètre. L'intervention d'un autre lot ne limite pas les obligations de garantie du Sous-traitant sur les équipements, raccordements, réglages et performances relevant de son périmètre."),
        h3("Exclusions de garantie"),
        p("La garantie ne couvre pas les défauts résultant exclusivement : d'une mauvaise utilisation de l'installation par Karno ou un tiers ; d'une intervention non autorisée ; d'un défaut d'entretien lorsque celui-ci n'est pas confié au Sous-traitant ; d'une cause extérieure indépendante de l'installation ; d'une modification de l'installation réalisée sans validation préalable de Karno. Ces exclusions ne sont applicables que si le Sous-traitant démontre que le défaut provient exclusivement de l'une de ces causes."),
        h3("Fonctionnement de l'installation"),
        p("Le Sous-traitant fournit une installation complète, réglée, équilibrée et apte à fonctionner conformément aux performances définies dans les documents contractuels approuvés. Il remet à Karno les recommandations d'exploitation et le plan d'entretien préventif nécessaires à assurer la pérennité, la sécurité et la longévité des installations.")
      );
      return out;
    },
  },
  {
    id: "hseq",
    title: "Santé, sécurité, environnement et qualité (HSEQ)",
    optional: true,
    default: true,
    render: () => [
      p("La politique HSEQ de KARNO implique, vis-à-vis de ses fournisseurs et sous-traitants, le respect strict des exigences légales et réglementaires en la matière ainsi que des exigences propres à KARNO :"),
      li("Le Sous-traitant veillera à ce qu'il y ait en permanence sur chantier, pendant ses interventions, au moins une personne capable de s'exprimer et de comprendre une discussion en langue française"),
      li("Conformément à la réglementation en matière de bien-être des travailleurs (loi du 4 août 1996 et AR du 7 avril 2023 fixant une formation de base en sécurité sur les chantiers temporaires et mobiles), le Sous-traitant déclare et garantit que toutes les personnes auxquelles il fait appel disposent de la formation de base en sécurité ; KARNO peut en réclamer la preuve à tout moment et écarter du chantier toute personne non conforme"),
      li("Le Sous-traitant met en oeuvre les Équipements de Protection Individuelle nécessaires (chaussures de sécurité, gants, casque...) et respecte les Équipements de Protection Collective en place"),
      li("Avant le démarrage de ses travaux, le Sous-traitant communique son Plan Particulier de Sécurité et Santé (PPSS) à KARNO, au plus tard 5 jours ouvrables avant le démarrage ; aucun travail ne peut commencer avant approbation écrite du PPSS par Karno et l'AMO, et aucun état d'avancement ne pourra être payé sans celui-ci"),
      li("En cas de manquement à la sécurité, KARNO prendra les dispositions nécessaires par une tierce entreprise, sans préavis et aux frais du Sous-traitant"),
      li("Le Sous-traitant effectue le nettoyage quotidien de ses zones de travail ; à défaut, KARNO le fera exécuter par un tiers, sans préavis et aux frais du Sous-traitant"),
      li("Tout déchet qui quitte le chantier devient la propriété du Sous-traitant, qui le gère dans le respect des exigences légales, de l'environnement et de la prévention de toute pollution"),
      li("Tout véhicule ou machine sur chantier est en bon état général, contrôlé, assuré et conforme, de manière à prévenir toute pollution"),
      p("Les aspects Sécurité, Environnement et Qualité entrent en ligne de compte dans l'évaluation du Sous-traitant et sont pris en considération pour toute collaboration future. En cas de non-respect, la responsabilité finale incombe au Sous-traitant et KARNO se réserve le droit de lui répercuter tout impact financier."),
    ],
  },
  {
    id: "assuranceTRC",
    title: "Assurance tous risques chantier",
    optional: true,
    default: true,
    render: () => [
      p("Le Sous-traitant souscrit, à ses frais, une assurance Tous Risques Chantier couvrant l'ensemble de ses prestations, fournitures, équipements, travaux préparatoires, manutentions, essais et mises en service réalisés dans le cadre du présent contrat."),
      p("Cette assurance couvre notamment : les dommages matériels aux ouvrages en cours d'exécution ; les dommages causés aux équipements, matériels et installations présents sur le chantier ; les risques liés aux essais, mises en eau, mises sous pression et mises en service ; les dommages causés aux tiers dans le cadre de l'exécution des travaux."),
      p("Le Sous-traitant fournit à Karno, avant tout démarrage des travaux : une attestation d'assurance valide, les montants assurés, les franchises applicables et la période de validité couvrant toute la durée du chantier et de la période de garantie. La fourniture d'une attestation valide est une condition suspensive à l'accès au chantier et à tout paiement ; à défaut, Karno est en droit de refuser l'accès au chantier et de résilier le contrat aux torts exclusifs du Sous-traitant."),
    ],
  },
  {
    id: "confidentialite",
    title: "Confidentialité",
    optional: true,
    default: true,
    render: () => [
      p("Sont considérées comme « Informations Confidentielles » toutes les informations échangées ou rendues accessibles dans le cadre du contrat (cahier des charges, dessins, données techniques et opérationnelles, savoir-faire, informations financières ou commerciales, sous quelque forme que ce soit) qui ne sont pas connues du public. Chaque Partie garde confidentielles les Informations Confidentielles et ne les divulgue à aucun tiers, sauf à ses conseillers et sociétés affiliées tenus à la même confidentialité, ou lorsque la divulgation est requise par le droit applicable ou une décision contraignante."),
      p("Les obligations de confidentialité restent en vigueur pendant dix (10) ans après la fin du contrat."),
    ],
  },
  {
    id: "cautionnement",
    title: "Cautionnement",
    optional: true,
    default: true,
    render: (c) => [
      p(`Le Sous-traitant constitue, en faveur de KARNO, une caution de bonne fin des travaux dont le taux est égal à ${c.cautionPct || "10"} % du montant initial du contrat de sous-entreprise. La caution est libérée, sur demande du Sous-traitant, par moitiés pour autant qu'aucune objection ne soit soulevée tant par l'AMO que par KARNO : la première moitié à la réception provisoire et la seconde à la réception définitive.`),
    ],
  },
  {
    id: "paiements",
    title: "Paiements",
    core: true,
    render: (c) => [
      h3("Calendrier des paiements"),
      ...(c.paiementJalons && c.paiementJalons.length
        ? [
            p("Les paiements interviennent selon le calendrier suivant, totalisant 100 % de la valeur du marché. Aucune valorisation n'est admise sans le justificatif validé par Karno :"),
            ...c.paiementJalons.map((j) => li(`${j.pct} % — ${j.label}`)),
          ]
        : [p("La facturation se fait mensuellement sur base d'états d'avancement soumis à l'approbation de Karno avant facturation. Aucune valorisation n'est admise sans le justificatif validé par Karno.")]),
      h3("Délai de paiement"),
      p(`Les factures sont payables dans un délai de ${c.delaiPaiement || "30 jours fin de mois"} à compter de la réception de la facture régulière et complète, conformément à la loi belge du 2 août 2002. Toute facture incomplète pourra être refusée jusqu'à régularisation, sans que cela ne constitue un retard de paiement imputable à Karno.`),
      h3("Retenue et compensation"),
      p("Karno peut retenir tout ou partie des sommes dues en cas de réserves non levées, retard, documents manquants, créance, dommage ou pénalité imputable au Sous-traitant, ou retenue obligatoire imposée par la législation sociale ou fiscale. Les Parties conviennent expressément de la possibilité de compensation entre les sommes dues par Karno au Sous-traitant et toute somme due par le Sous-traitant à Karno."),
      h3("Gestion des factures et états d'avancement"),
      p(`La facture du Sous-traitant, dûment accompagnée des pièces justificatives (bon de livraison, bon de commande, état d'avancement validé...), est adressée à KARNO par voie électronique à finance@karno.energy en portant la référence « ${c.chantierRef} ». Sur simple demande de KARNO, le Sous-traitant produit tous les justificatifs et compléments d'information concernant les quantités facturées. Toutes les quantités reprises dans les propositions d'états d'avancement devront être accompagnées du justificatif adéquat, à faire valider par KARNO.`),
    ],
  },
  {
    id: "suspension",
    title: "Suspension et résiliation",
    core: true,
    render: () => [
      h3("Suspension temporaire"),
      p("Karno peut suspendre tout ou partie des travaux avec effet immédiat en cas de manquement de sécurité, non-conformité, absence de documents obligatoires, retard critique ou nécessité de chantier. Sauf faute de Karno, une suspension temporaire n'ouvre pas droit à indemnité autre que le paiement des prestations déjà correctement exécutées et acceptées."),
      h3("Résiliation pour faute"),
      p("Karno est en droit de résilier le présent contrat de plein droit, sans intervention judiciaire préalable, en cas de manquement grave, notamment : non-constitution du cautionnement ou non-fourniture de l'attestation d'assurance ; non-respect répété ou grave des normes de sécurité ; retard de plus de 30 jours ouvrables sur le planning validé, sauf force majeure ; non-conformité persistante non corrigée dans un délai de 10 jours ouvrables suivant mise en demeure ; sous-traitance non autorisée ou violation de l'anti-contournement ; violation des obligations de confidentialité ou de propriété des données ; procédure d'insolvabilité, liquidation ou faillite du Sous-traitant."),
      p("En cas de résiliation imputable au Sous-traitant, Karno peut faire achever les travaux par un tiers aux frais et risques du Sous-traitant, appeler la caution, et compenser tous surcoûts et dommages avec les sommes encore dues."),
      h3("Résiliation pour convenance"),
      p("Karno peut résilier le contrat pour convenance moyennant un préavis écrit de 30 jours calendrier. Dans ce cas, Karno indemnise le Sous-traitant pour les travaux réellement exécutés et les frais engagés dûment justifiés, sans autre indemnité."),
    ],
  },
  {
    id: "soustraitance",
    title: "Sous-traitance, cession et anti-contournement",
    core: true,
    render: () => [
      p("Le Sous-traitant ne peut sous-traiter tout ou partie des travaux sans l'accord préalable écrit de Karno (15 jours ouvrables minimum avant démarrage). En cas d'autorisation, il demeure seul et entièrement responsable et impose à tout sous-traitant autorisé des obligations au moins équivalentes. En cas de sous-traitance non autorisée : arrêt immédiat, pénalité forfaitaire de 5.000 € par infraction, et droit pour Karno de résilier pour faute."),
      p("La cession du contrat est interdite sans accord écrit de Karno. En cas de changement de contrôle (acquisition, fusion, cession de parts majoritaires), le Sous-traitant informe Karno dans les 10 jours ouvrables ; Karno se réserve le droit de résilier sans indemnité dans les 30 jours suivants."),
      p("Sauf accord écrit préalable de Karno, le Sous-traitant s'interdit strictement : de traiter directement avec le maître d'ouvrage final ou toute autre partie liée au projet ; de prendre un engagement en leur nom ou à leur égard ; d'accepter de leur part toute instruction ayant une incidence sur les travaux confiés ; de contourner Karno pour proposer ses services sur le chantier concerné ou tout chantier lié. Toute violation constitue un motif de résiliation pour faute."),
    ],
  },
  {
    id: "reunions",
    title: "Réunions de chantier",
    optional: true,
    default: true,
    render: (c) => [
      p(`Le Sous-traitant s'engage à assister aux réunions de chantier ou à s'y faire représenter par un délégué dûment mandaté pendant l'exécution des travaux confiés. Cette obligation s'applique aux réunions concernant les travaux de ${c.stNomCourt || "du Sous-traitant"} ; pour les réunions ne les concernant pas directement ou indirectement, le Sous-traitant en est dispensé, sauf demande écrite et motivée de Karno au moins 2 jours avant ladite réunion.`),
      p("Le Sous-traitant peut demander la mise à l'agenda de points spécifiques à ses travaux ou sa participation à une réunion de chantier, moyennant une demande écrite et motivée adressée à Karno au moins 5 jours à l'avance."),
    ],
  },
  {
    id: "propriete",
    title: "Propriété des données et documents",
    optional: true,
    default: true,
    render: () => [
      p("Toutes les données, relevés, rapports, plans annotés, photographies, documents techniques et fichiers établis par le Sous-traitant dans le cadre du présent contrat appartiennent exclusivement à Karno. Le Sous-traitant cède à Karno, au fur et à mesure de leur création, tous les droits nécessaires à leur utilisation, reproduction, archivage et transmission. À première demande de Karno ou à la fin du contrat, le Sous-traitant restitue sans délai tous les documents et données reçus ou établis."),
    ],
  },
  {
    id: "publicite",
    title: "Publicité et référence commerciale",
    optional: true,
    default: true,
    render: () => [
      p("Sauf accord écrit préalable de Karno, le Sous-traitant s'interdit : de faire état du présent chantier comme référence commerciale ; de citer Karno, le maître d'ouvrage final ou tout autre intervenant dans ses communications ; de publier ou diffuser toute photographie, vidéo ou communication relative au chantier ; d'utiliser le chantier ou les relations commerciales à des fins commerciales, promotionnelles ou publicitaires ; d'installer sur le chantier des panneaux, bâches, marquages ou affiches à son nom."),
    ],
  },
  {
    id: "preuve",
    title: "Preuve et notifications",
    core: true,
    render: () => [
      p("Les échanges par e-mail entre les personnes de contact désignées constituent un mode de preuve valable entre les Parties. Peuvent notamment servir de preuve : les e-mails, comptes rendus de chantier, rapports journaliers, états d'avancement, photos horodatées, accusés de réception et documents signés par voie électronique. Toute notification officielle (réserves, mises en demeure, refus, suspension, résiliation) peut être faite par e-mail, sans préjudice du droit d'utiliser un envoi recommandé."),
    ],
  },
  {
    id: "equipe",
    title: "Équipe de projet",
    core: true,
    render: (c) => {
      const bloc = (titre, contacts) => [
        h3(titre),
        ...contacts.filter((x) => x.nom).map((x) => li(`${x.nom}${x.role ? ` — ${x.role}` : ""}${x.email ? ` — ${x.email}` : ""}${x.gsm ? ` — GSM : ${x.gsm}` : ""}`)),
      ];
      return [
        ...bloc("Karno (Maître d'ouvrage)", c.equipeKarno || []),
        ...(c.amoNom && (c.equipeAmo || []).some((x) => x.nom) ? bloc(`${c.amoNom} (Assistant Maître d'ouvrage)`, c.equipeAmo) : []),
        ...bloc(`${c.stNom} (Sous-traitant)`, c.equipeSt || []),
      ];
    },
  },
  {
    id: "rgpd",
    title: "Traitement des données à caractère personnel",
    optional: true,
    default: true,
    render: () => [
      p("Les Parties traitent les données à caractère personnel qui leur sont transmises conformément au RGPD (Règlement (UE) 2016/679) et à toute autre réglementation en vigueur. Le Sous-traitant prévoit des mesures techniques et organisationnelles assurant un niveau de protection adéquat, limite l'accès aux seules personnes dont la connaissance est requise, ne conserve les données que la durée nécessaire à l'exécution du contrat et de ses suites, et informe KARNO immédiatement en cas de fuite de données ainsi que des mesures prises pour y remédier."),
      p("Les finalités des traitements sont l'exécution de la convention, la gestion des fournitures et la tenue de la comptabilité. En cas de manquement persistant, KARNO a le droit de prendre les mesures nécessaires aux frais du Sous-traitant ou de résilier la convention de plein droit sans indemnité."),
    ],
  },
  {
    id: "gestionAdmin",
    title: "Gestion administrative Karno — gestion documentaire avant la réception définitive",
    optional: true,
    default: true,
    render: (c) => [
      p("Un certain nombre de documents sont à remettre à Karno avant la réception définitive :"),
      li("Les certificats de conformité de toutes les machines, pièces, vannes et accessoires"),
      li("Les certificats de garantie de toutes les machines, pièces, vannes et accessoires"),
      li("L'analyse fonctionnelle via le lot d'automation (notices des équipements individuels fournis)"),
      li("Un certificat as-built reprenant le plan général de l'installation, ainsi qu'une note explicative de l'installation"),
      p(`Ces documents sont à envoyer par e-mail à l'adresse suivante pour archivage dans les dossiers de Karno : ${c.adminEmail || "info@karno.energy"}.`),
    ],
  },
  {
    id: "dispositionsFinales",
    title: "Dispositions finales",
    core: true,
    render: (c) => [
      h3("Intégralité de l'accord"),
      p("Le présent contrat et ses annexes constituent l'intégralité des accords entre les Parties et prévalent sur tout engagement antérieur, verbal ou écrit. Toute dérogation n'est valable que si convenue par écrit."),
      h3("Divisibilité"),
      p("La nullité éventuelle d'une clause n'affecte pas la validité des autres dispositions. Les Parties remplaceront, de bonne foi, toute clause nulle par une clause valable ayant un effet économique et juridique aussi proche que possible."),
      h3("Droit applicable et juridiction"),
      p("Le présent contrat est régi par le droit belge. En cas de litige, les Parties recherchent une solution amiable dans un délai de 30 jours calendrier. À défaut, les Tribunaux de l'arrondissement judiciaire de Bruxelles sont seuls compétents."),
      h3("Entrée en vigueur"),
      p("Le présent contrat prend effet au jour de sa signature et annule toutes autres dispositions convenues précédemment, pour ce chantier, entre KARNO et le Sous-traitant."),
      p(`Fait à ${c.lieuSignature || "Bruxelles"} le ${c.dateSignature || "..............."}, en deux exemplaires, chacune des parties signataires reconnaissant avoir reçu le sien. Les Parties reconnaissent avoir lu et accepté l'intégralité des conditions du présent contrat, y compris toutes ses annexes.`),
    ],
  },
];

module.exports = { SECTIONS, VARIANTS };
