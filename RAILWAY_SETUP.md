# Railway Deployment (with Postgres DB)

This project is now configured to run on Railway with a PostgreSQL database.

## What was added

- `server.js`: Express server that serves the app and provides `/api/*` endpoints backed by Postgres
- `railway-db-service.js`: Frontend service using those `/api/*` endpoints (same interface as existing Firebase service)
- `railway.toml`: Railway deploy config with health check
- `package.json`: `start`/`dev` now run `node server.js`

## Deploy Steps

1. Push this repo to GitHub.
2. In Railway, create a new project from your GitHub repo.
3. Add a PostgreSQL service to the same Railway project.
4. Link the Postgres `DATABASE_URL` to the app service.
   - Railway usually injects this automatically once services are linked.
5. Deploy.
6. Verify health check:
   - `https://<your-railway-domain>/api/health` should return `{ "ok": true }`.

## First-time data import (optional)

If you have existing planner data in browser/Firebase and want it in Railway DB:

1. Open the app where your current data exists.
2. Use Export (`Ctrl/Cmd + E`) to download JSON.
3. Open your Railway deployment.
4. Use Import feature and select that JSON file.

## Notes

- The app now prefers Railway DB service.
- If Railway API/DB is unavailable, it falls back to localStorage behavior.
- Firebase script is still present but auto-skipped when Railway DB service is active.
