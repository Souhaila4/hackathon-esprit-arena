# Déploiement — charge, files d’attente, base de données

## Variables d’environnement (extrait)

| Variable | Rôle |
|----------|------|
| `QUEUE_SCORING_ENABLED` | `true` pour envoyer le scoring post-submit dans **BullMQ** (Redis requis). Sinon le scoring tourne en inline (comme avant). |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Connexion Redis pour BullMQ + Bull Board (`/queues`). |
| `SCORING_WORKER_CONCURRENCY` | Nombre de jobs de scoring traités en parallèle (défaut `2`). |
| `RATE_LIMIT_SUBMIT_LIMIT`, `RATE_LIMIT_SUBMIT_TTL_MS` | Limite **par utilisateur** (JWT `id`) sur `POST /competitions/:id/submit` (défaut 8 req / 60 s). |
| `RATE_LIMIT_CHECKPOINT_LIMIT`, `RATE_LIMIT_CHECKPOINT_TTL_MS` | Limite **par utilisateur** sur `PATCH .../checkpoints/:checkpointId/submit` (défaut 40 req / 60 s). |
| `DATABASE_URL` | MongoDB : ajouter `maxPoolSize` dans l’URL si besoin, ex. `mongodb+srv://.../?retryWrites=true&w=majority&maxPoolSize=20`. |
| `GITHUB_HTTP_TIMEOUT_MS`, `GROQ_HTTP_TIMEOUT_MS` | Timeouts HTTP côté agents. |
| `HUGGINGFACE_CB_*` | Paramètres du **circuit breaker** Hugging Face (anti-cheat). |
| `TRUST_PROXY` | Mettre à `1` derrière nginx / LB pour que `req.ip` reflète le client (rate limit). |

## Load balancer (plusieurs instances API)

- Faire tourner **plusieurs processus** Nest (ou conteneurs) derrière **nginx**, HAProxy ou le LB du cloud.
- Sticky sessions : en général **pas nécessaires** si l’API est stateless (JWT).
- **Redis + BullMQ** : une seule file partagée ; les workers peuvent cohabiter avec l’API ou sur des workers dédiés (même code Nest avec `QUEUE_SCORING_ENABLED=true`).

## Exemple nginx (amont)

```nginx
upstream arena_api {
    least_conn;
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
}
server {
    location / {
        proxy_pass http://arena_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

`X-Forwarded-For` / `X-Real-IP` permettent au rate limit (et aux logs) de voir la vraie IP client si besoin.

## Pool Prisma (MongoDB)

Augmenter `maxPoolSize` dans `DATABASE_URL` selon la charge (et la taille du cluster MongoDB). Éviter de surdimensionner : chaque instance API ouvre son propre pool.

## Soumissions concurrentes (plusieurs leaders en même temps)

- La soumission finale utilise un **`updateMany` atomique** sur le participant (`status: JOINED`) : une seule requête gagne ; les autres reçoivent « déjà soumis ». Pour les **équipes**, **équipe + membres** sont mis à jour dans la **même transaction MongoDB** que le leader (nécessite un serveur en **replica set**, ex. MongoDB Atlas ou instance locale configurée en replica set).
- Les jobs BullMQ de scoring utilisent un **`jobId` stable par participant** (`scoring-<participantId>`) pour éviter d’empiler plusieurs fois le même scoring si Redis accepte la déduplication.
