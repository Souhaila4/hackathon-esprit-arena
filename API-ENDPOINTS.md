# API Arena of Coders — Liste des endpoints

Base URL locale : `http://localhost:<PORT>` (voir `PORT` dans `.env`, ex. `3000`, `3002`).

- **Documentation Swagger (OpenAPI)** : `GET /api` (interface Swagger UI ; schéma JSON souvent exposé en `GET /api-json` selon la version de `@nestjs/swagger`).
- **Fichiers uploadés** : préfixe `/uploads/` (servi en statique depuis le dossier `uploads`)
- **Authentification** : en-tête `Authorization: Bearer <JWT>` (schéma Swagger : `access-token`), sauf mention « Public ».

---

## Comparaison (doc manuelle vs génération interne)

| Élément | Ancienne fiche auto (`API-ENDPOINTS.md` initiale) | Cette version (alignée sur votre liste) |
|--------|---------------------------------------------------|----------------------------------------|
| **Bull Board** | Section courte en note de fin | Tableau dédié « Outils internes » + conditions `QUEUE_SCORING_ENABLED` / Redis |
| **Analytics** | Idem | Chemin explicite `/api/analytics/developers` (préfixe `api/` du contrôleur) |
| **Port** | Exemple `3000` uniquement | Rappel que `PORT` est libre (ex. `3002`) |
| **Santé** | Absent | `GET /health` ajouté au backend pour probes (voir section Racine) |

**État du code :** tous les chemins listés ci-dessous existent dans les `*.controller.ts` sous `src/`, sauf mention « conditionnel ». Aucun endpoint manquant n’a été identifié par rapport à votre liste ; la file Bull / Bull Board est enregistrée via `ScoringModule.register()` importé par `CompetitionModule` (`src/scoring/scoring.module.ts`).

---

## Racine

| Méthode | Chemin | Auth | Description |
|--------|--------|------|-------------|
| `GET` | `/` | Public | Message de bienvenue (`AppController`) |
| `GET` | `/health` | Public | Sonde liveness (`ok`, `uptimeSec`, `ts` ISO) — déploiement / monitoring |

---

## Auth — `/auth`

| Méthode | Chemin | Auth | Description |
|--------|--------|------|-------------|
| `POST` | `/auth/signup` | Public | Inscription (multipart : `email`, `password`, `firstName`, `lastName`, `avatar` requis ; `resume` .docx optionnel ; `githubUrl`, `linkedinUrl` optionnels) |
| `GET` | `/auth/avatar/:filename` | Public | Servir un fichier avatar depuis le disque |
| `POST` | `/auth/signin` | Public | Connexion (JWT) |
| `POST` | `/auth/forgot-password` | Public | Demande de code de réinitialisation |
| `POST` | `/auth/reset-password` | Public | Réinitialisation du mot de passe avec le code |
| `GET` | `/auth/me` | JWT | Profil utilisateur courant |
| `PATCH` | `/auth/profile` | JWT | Mise à jour du profil |
| `POST` | `/auth/profile/cv` | JWT | Upload CV `.docx` (extraction IA) |
| `POST` | `/auth/profile/avatar` | JWT | Mise à jour de l’avatar |
| `POST` | `/auth/fcm-token` | JWT | Enregistrer le token Firebase Cloud Messaging (push) |

---

## Utilisateur — `/user`

| Méthode | Chemin | Auth | Description |
|--------|--------|------|-------------|
| `GET` | `/user/leaderboard` | Public | Classement public (XP) |
| `GET` | `/user/:id` | Public | Profil public par ID |
| `POST` | `/user/request-company-role` | JWT | Demander le rôle **COMPANY** |
| `PATCH` | `/user/wallet` | JWT | Enregistrer le compte Hedera (`hederaAccountId`) |

---

## Admin — `/admin`

Toutes les routes : **JWT + rôle ADMIN** (`AdminGuard`).

| Méthode | Chemin | Description |
|--------|--------|-------------|
| `PATCH` | `/admin/users/:id/role` | Changer le rôle d’un utilisateur (`USER`, `ADMIN`, `COMPANY`) |
| `GET` | `/admin/company-requests` | Liste des demandes rôle entreprise (`?status` optionnel) |
| `PATCH` | `/admin/company-requests/:id/review` | Approuver / refuser une demande |
| `GET` | `/admin/hackathons/equipes` | Tous les hackathons avec équipes et membres |
| `DELETE` | `/admin/equipes/:equipeId` | Supprimer une équipe (admin) |
| `GET` | `/admin/dashboard/stats` | Statistiques plateforme |
| `GET` | `/admin/users/recent` | Derniers inscrits (`?limit`, max 50) |
| `GET` | `/admin/users` | Liste utilisateurs (`limit`, `offset`, `search`, `role`) |
| `POST` | `/admin/competitions/:competitionId/preselected/send-email` | Email aux participants présélectionnés (top scores) |
| `POST` | `/admin/n8n/webhook-test` | Test du webhook n8n (proxy anti-CORS) |

---

## Compétitions / hackathons — `/competitions`

Le contrôleur applique **JWT** sur toutes les routes.

| Méthode | Chemin | Rôles / notes | Description |
|--------|--------|----------------|-------------|
| `POST` | `/competitions` | ADMIN, COMPANY | Créer un hackathon |
| `PATCH` | `/competitions/:id` | ADMIN, COMPANY | Mettre à jour |
| `PATCH` | `/competitions/:id/status` | ADMIN, COMPANY | Cycle de vie (statuts) |
| `PATCH` | `/competitions/:id/archive` | ADMIN, COMPANY | Archiver |
| `GET` | `/competitions` | JWT (+ filtre créateur si COMPANY) | Liste paginée (`status`, `difficulty`, `specialty`, `onlyActive`, `page`, `limit`) |
| `GET` | `/competitions/for-me` | JWT | Hackathons alignés sur la spécialité du user |
| `GET` | `/competitions/my-wins` | JWT | Hackathons gagnés par l’utilisateur |
| `GET` | `/competitions/leaderboard/global` | JWT | Classement global (`?limit`) |
| `GET` | `/competitions/hackathon-ideas` | ADMIN | Idées de hackathons (webhook n8n) |
| `GET` | `/competitions/:id` | JWT | Détail d’une compétition |
| `GET` | `/competitions/:id/participants` | JWT | Participants |
| `GET` | `/competitions/:id/leaderboard` | JWT | Classement de la compétition |
| `GET` | `/competitions/:id/top-participants` | JWT | Top N par score (`?limit`) |
| `GET` | `/competitions/:id/participants/all` | ADMIN, COMPANY | Tous les participants (y compris disqualifiés) |
| `POST` | `/competitions/:id/winner/:participantId` | ADMIN, COMPANY | Désigner un gagnant |
| `POST` | `/competitions/:id/join` | USER | Rejoindre (multipart : `hackathonFaceImage`) |
| `GET` | `/competitions/:id/my-participation` | JWT | Ma participation |
| `GET` | `/competitions/:id/checkpoints` | JWT | Liste des checkpoints |
| `GET` | `/competitions/:id/my-checkpoint-submissions` | JWT | Mes soumissions checkpoint |
| `PATCH` | `/competitions/:id/checkpoints/:checkpointId/submit` | JWT | Soumettre un checkpoint (throttle) |
| `GET` | `/competitions/:id/checkpoint-submissions` | ADMIN, COMPANY | Toutes les soumissions (revue) |
| `PATCH` | `/competitions/:id/checkpoint-submissions/:submissionId/review` | ADMIN, COMPANY | Approuver / refuser une soumission |
| `POST` | `/competitions/:id/submit` | JWT | Soumission finale (repo GitHub, anti-triche / scoring — throttle) |

---

## Équipes — préfixe racine (contrôleur `@Controller()`)

Toutes les routes : **JWT**.

| Méthode | Chemin | Rôles / notes | Description |
|--------|--------|----------------|-------------|
| `POST` | `/equipes` | USER | Créer une équipe (**body JSON** : `name`, `competitionId`) |
| `POST` | `/equipes/with-photo` | USER | Créer une équipe (**multipart/form-data** : `name`, `competitionId` + image ; champ fichier : `hackathonFaceImage`, `photo`, `image`, `faceImage` ou `file` ; max **10 Mo**) |
| `POST` | `/team/create` | USER | **Alias** de `/equipes/with-photo` (même multipart, ex. apps Flutter) |
| `GET` | `/equipes/my-equipe/:competitionId` | JWT | Mon équipe pour une compétition |
| `GET` | `/equipes/competition/:competitionId` | JWT | Toutes les équipes d’une compétition |
| `GET` | `/equipes/search-users` | JWT | Recherche utilisateurs (`query`, `competitionId` optionnel) |
| `GET` | `/equipes/:id` | JWT | Détail équipe |
| `POST` | `/equipes/:id/mark-ready` | USER | Marquer l’équipe prête (leader) |
| `POST` | `/equipes/:id/invite` | USER | Inviter (leader) |
| `DELETE` | `/equipes/:equipeId/members/:memberUserId` | USER | Retirer un membre (leader) |
| `GET` | `/equipe-invitations/my-invitations` | JWT | Mes invitations en attente |
| `POST` | `/equipe-invitations/:id/accept` | USER | Accepter une invitation |
| `POST` | `/equipe-invitations/:id/decline` | USER | Refuser une invitation |
| `POST` | `/competitions/:id/join-solo` | USER | File d’attente solo |
| `POST` | `/equipes/auto-assign/:competitionId` | ADMIN | Auto-affectation des solos en équipes |

---

## Portefeuille (Arena Coin / Hedera) — `/wallet`

| Méthode | Chemin | Auth | Description |
|--------|--------|------|-------------|
| `GET` | `/wallet/me` | JWT | Infos wallet + historique transactions |
| `POST` | `/wallet/admin/mint` | JWT + ADMIN | Mint de coins vers un wallet entreprise |
| `GET` | `/wallet/competition/:competitionId/transactions` | JWT + ADMIN | Transactions liées à un hackathon |

---

## Stream (GetStream) — `/stream`

| Méthode | Chemin | Auth | Description |
|--------|--------|------|-------------|
| `POST` | `/stream/token` | JWT | Token utilisateur Stream (`userId` optionnel dans le body) |
| `POST` | `/stream/arena/join` | JWT | Rejoindre le canal Arena Live |
| `GET` | `/stream/rooms` | JWT | Liste des « salles » (config spécialité) |
| `POST` | `/stream/room/:roomId/join` | JWT | Rejoindre une salle hackathon |
| `POST` | `/stream/team/:equipeId/comp/:competitionId/join` | JWT | Canal chat d’équipe pour un hackathon |

---

## Certificats NFT — `/certificate`

| Méthode | Chemin | Auth | Description |
|--------|--------|------|-------------|
| `POST` | `/certificate/generate` | JWT | Générer / minter un certificat NFT (Hedera + IPFS) |

---

## Notifications — `/notifications`

Toutes les routes : **JWT**.

| Méthode | Chemin | Description |
|--------|--------|-------------|
| `GET` | `/notifications` | Liste (`unreadOnly`, `limit`) |
| `PATCH` | `/notifications/read-all` | Tout marquer comme lu |
| `PATCH` | `/notifications/:id/read` | Marquer une notification lue |

---

## Anti-triche (proxy Hugging Face) — `/anti-cheat`

Toutes les routes : **JWT**. Corps **multipart/form-data**.

| Méthode | Chemin | Description |
|--------|--------|-------------|
| `POST` | `/anti-cheat/validate-image` | Champs : `image` (requis), `avatar` (optionnel) |
| `POST` | `/anti-cheat/validate-audio` | Champ : `audio` |

---

## Scraper (test) — `/scraper`

| Méthode | Chemin | Auth | Description |
|--------|--------|------|-------------|
| `GET` | `/scraper/test-github` | Public | `?url=` URL profil GitHub — test scraping repos |

---

## Analytics — `/api/analytics`

| Méthode | Chemin | Auth | Description |
|--------|--------|------|-------------|
| `GET` | `/api/analytics/developers` | Public | Filtres : `specialty`, `skill`, `minWins` |

---

## Outils internes (optionnel)

| Chemin | Condition | Description |
|--------|-----------|-------------|
| `GET /queues` | Si `QUEUE_SCORING_ENABLED=true` et Redis configuré | **Bull Board** — file d’attente de scoring (monitoring) |

Variables typiques : `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` (optionnel). Voir `src/scoring/scoring.module.ts`.

---

## Mise à jour de ce document

Les routes sont définies dans les fichiers `*.controller.ts` sous `src/`. En cas de doute, la référence interactive reste **Swagger** : `http://localhost:<PORT>/api`.
