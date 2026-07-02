# Suivi de Projet

Application web de suivi de projet pour equipes techniques (reseaux de chaleur, geothermie, chaufferies industrielles, sous-stations) : checklists metier par type de projet, tableau Kanban, planning, suivi budgetaire, sous-traitants, dossier As-built, plan de maintenance, suivi de chantier (photos/vocal -> rapports), et integrations Google Calendar / Odoo. Multi-organisations (chaque equipe/entreprise a son propre espace isole).

## Demarrage le plus simple (Mac, sans terminal)

1. Installez [Docker Desktop](https://www.docker.com/products/docker-desktop) une seule fois, ouvrez-le.
2. Double-cliquez sur **`Demarrer l'application.command`** a la racine du projet.
3. Votre navigateur s'ouvre automatiquement sur `http://localhost:5173` une fois pret (1 a 3 minutes la premiere fois).
4. Pour arreter, double-cliquez sur **`Arreter l'application.command`**.

(La premiere fois, macOS peut demander de confirmer l'ouverture d'un fichier telecharge : clic droit > Ouvrir.)

**Pas de login pour l'instant** : l'application vous connecte automatiquement (`AUTO_LOGIN=true` par defaut) et cree une organisation par defaut au premier lancement, pour pouvoir l'utiliser immediatement. C'est adapte a un usage local/solo pendant les tests. **Avant de mettre l'application en ligne sur internet (accessible par plusieurs equipes), passez `AUTO_LOGIN=false` dans `.env`** : sans cela, n'importe qui connaissant l'URL publique aurait acces a toutes les donnees sans mot de passe. Le systeme de compte/organisation reste disponible (`/register`, `/login`), il est juste court-circuite par defaut.

## Stack technique

- **Backend** : Node.js, Express, Prisma ORM, PostgreSQL, authentification JWT
- **Frontend** : React (Vite), Tailwind CSS, drag & drop (@hello-pangea/dnd), graphiques (Recharts)
- **Deploiement** : Docker Compose (base de donnees + API + interface web), ou deploiement cloud en un clic via `render.yaml`

## Fonctionnalites

- Creation d'une organisation (equipe) et invitation de membres via l'identifiant de l'organisation
- Projets types au choix (reseau de chaleur, geothermie, chaufferie, sous-station) : une checklist de taches et de documents attendus adaptee au metier est generee automatiquement a la creation
- Tableau Kanban avec colonnes personnalisables et glisser-deposer des taches
- Taches avec priorite, dates de debut/echeance, heures et couts estimes/reels, assignation a un membre
- Vue planning : chronologie des taches et jalons de projet
- Suivi budgetaire : lignes de depenses/recettes, repartition par categorie (graphique), comparaison budget prevu vs depense
- Annuaire des sous-traitants de l'organisation (specialite, contact), reutilisable sur tous les projets
- Documents & As-built : checklist des documents attendus par projet, statut (manquant/recu/valide/rejete), sous-traitant responsable, date limite avec alerte de retard, upload de fichier
- Equipements & Maintenance : fiche par equipement (fabricant, modele, fiche technique uploadee), intervalle de maintenance et calcul automatique de la prochaine echeance
- Suivi de chantier : rapports avec notes (saisies ou dictees au micro), points critiques et photos, mis en forme automatiquement en rapport structure (genere par IA si une cle Anthropic est configuree)
- Integrations : synchronisation des echeances vers Google Calendar, consultation des bons de commande Odoo lies au projet

## Demarrage avec Docker (ligne de commande)

Pre-requis : Docker et Docker Compose installes.

```bash
cp .env.example .env
# Editez .env si besoin (JWT_SECRET, et les cles optionnelles ci-dessous)
docker compose up --build
```

Une fois demarre :
- Interface web : http://localhost:5173
- API : http://localhost:4000/api

Creez votre organisation depuis l'ecran d'inscription (http://localhost:5173/register). La base de donnees et ses tables sont creees automatiquement au demarrage du conteneur backend (migrations Prisma).

## Demarrer en local sans Docker (developpement)

Pre-requis : Node.js 20+, PostgreSQL 14+ en local.

Backend :
```bash
cd backend
cp .env.example .env   # adaptez DATABASE_URL a votre PostgreSQL local
npm install
npx prisma migrate deploy
npm run dev
```

Frontend :
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Fonctionnalites optionnelles a configurer

Ces fonctionnalites marchent des l'installation en mode degrade, et deviennent pleinement actives une fois les cles/identifiants ajoutes dans `.env` (racine, ou `backend/.env`) :

### Rapports de chantier generes par IA

Sans configuration : les notes et points critiques sont mis en forme simplement (sans reformulation).
Avec `ANTHROPIC_API_KEY` (creee sur [console.anthropic.com](https://console.anthropic.com)) : un rapport structure (situation, avancement, points critiques, actions a mener) est genere automatiquement a partir des notes, points critiques et legendes de photos.

La dictee vocale (bouton micro) fonctionne nativement dans Chrome, sans cle a configurer.

### Google Calendar

Pour synchroniser les echeances/jalons d'un projet vers un calendrier Google dedie :

1. Allez sur [Google Cloud Console](https://console.cloud.google.com/), creez un projet.
2. Activez l'API "Google Calendar API".
3. Dans "Identifiants", creez un identifiant OAuth 2.0 de type "Application Web".
4. Ajoutez comme URI de redirection autorisee : `http://localhost:4000/api/integrations/google/callback` (ou l'URL de production equivalente).
5. Renseignez `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` et `GOOGLE_REDIRECT_URI` dans `.env`.
6. Redemarrez l'application. Dans l'onglet "Integrations" d'un projet, cliquez sur "Connecter mon compte Google" puis "Synchroniser ce projet".

Limite actuelle : la synchronisation est a sens unique (application -> Google Calendar) et n'ajoute pas de deduplication : relancer la synchronisation recreera les evenements. Pratique pour une synchro ponctuelle avant une reunion, a ameliorer si un usage frequent est necessaire.

### Odoo (bons de commande)

1. Dans Odoo, generez une cle API pour l'utilisateur qui servira a la connexion (Parametres > Utilisateurs > Securite du compte > Cles API).
2. Renseignez `ODOO_URL` (ex: `https://monentreprise.odoo.com`), `ODOO_DB` (nom de la base), `ODOO_USERNAME` et `ODOO_API_KEY` dans `.env`.
3. Redemarrez l'application. Dans l'onglet "Integrations" d'un projet, renseignez la reference du projet cote Odoo (par defaut, le nom du projet) puis "Charger les bons de commande".

C'est une consultation en lecture seule (pas de creation/modification de bons de commande depuis l'application).

## Deploiement sur un serveur ou dans le cloud

**Option A - VPS avec Docker** :
1. Copiez le dossier du projet sur votre serveur (ou clonez le depot Git une fois pousse).
2. Creez un fichier `.env` a la racine a partir de `.env.example` : definissez un `JWT_SECRET` fort, `CORS_ORIGIN` (URL publique du frontend), `VITE_API_URL` (URL publique de l'API), et les cles optionnelles ci-dessus.
3. Lancez `docker compose up -d --build`.
4. Mettez un reverse proxy (Nginx, Caddy, Traefik) devant les ports 5173 (frontend) et 4000 (API) pour servir le tout en HTTPS sur votre domaine.
5. Sauvegardez regulierement les volumes `db_data` (base de donnees) et `uploads_data` (documents, photos, fiches techniques).

**Option B - Render.com (cloud, en un clic)** :
1. Poussez ce dossier sur un depot Git (GitHub/GitLab).
2. Sur [render.com](https://render.com), "New +" > "Blueprint", connectez le depot : Render lit `render.yaml` et cree automatiquement la base de donnees, le backend et le frontend.
3. Renseignez les variables marquees comme a completer dans le tableau de bord Render (`CORS_ORIGIN`, `VITE_API_URL`, et les cles optionnelles).

## Structure du projet

```
suivi-projet/
  backend/       API Express + schema Prisma (PostgreSQL)
  frontend/      Application React (Vite + Tailwind)
  docker-compose.yml
  render.yaml                        Deploiement cloud en un clic (Render)
  Demarrer l'application.command     Lancement en un double-clic (Mac)
  Arreter l'application.command
```

## Modele de donnees (resume)

- **Organization** : une equipe/entreprise (isolation multi-tenant)
- **User** : membre d'une organisation (role ADMIN ou MEMBER)
- **Project** : un projet (type, budget, dates, reference Odoo, calendrier Google associe)
- **Column** / **Task** : tableau Kanban et taches (priorite, dates, heures, couts, assignation)
- **Milestone** : un jalon de planning
- **BudgetItem** : une ligne de depense ou recette
- **Subcontractor** : un sous-traitant de l'organisation (annuaire partage entre projets)
- **Document** : un document attendu/recu pour un projet (dossier As-built), avec statut, sous-traitant, deadline, fichier
- **Equipment** : un equipement installe sur un projet, avec fiche technique et intervalle de maintenance
- **SiteReport** / **ReportPhoto** : rapport de suivi de chantier avec ses photos

Les fichiers uploades (documents, fiches techniques, photos) sont stockes sur le serveur backend dans `/app/uploads` (volume Docker `uploads_data`, persiste entre redemarrages).

## Prochaines ameliorations possibles

- Editeur de templates de checklist (actuellement les templates par type de projet sont integres au code, pas modifiables depuis l'interface)
- Synchronisation Google Calendar bidirectionnelle avec deduplication des evenements
- Creation de bons de commande dans Odoo depuis l'application (actuellement lecture seule)
- Notifications par email (echeances, documents manquants, maintenance due)
- Export PDF/Excel des rapports de projet et des dossiers As-built
- Historique/audit des modifications, gestion fine des roles par projet
