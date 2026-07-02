# Forest Deployment

## Stack

- App: `Next.js`
- Database: `PostgreSQL`
- ORM: `Prisma`

## Required Environment Variable

Create an environment variable named `DATABASE_URL`.

Example:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/forest?schema=public"
```

Optional for Google Calendar sync:

```env
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI="http://localhost:3000/api/google-calendar/callback"
```

## First-Time Setup

1. Install dependencies.

```bash
npm install
```

2. Generate the Prisma client.

```bash
npm run prisma:generate
```

3. Apply Prisma migrations.

```bash
npm run prisma:migrate:deploy
```

4. Seed the default app data.

```bash
npm run db:seed
```

5. Import any legacy JSON snapshot into PostgreSQL if you still have old `data/*.json` files.

```bash
npm run db:migrate-json
```

6. Start the app.

```bash
npm run dev
```

## Default Seeded Accounts

On a fresh database, the app seeds these accounts automatically:

- Admin: `admin@forest.local` / `admin123`
- Bidder: `bidder@forest.local` / `bidder123`
- Caller: `caller@forest.local` / `caller123`
- Supportor: `supportor@forest.local` / `supportor123`

Change these immediately in production.

## Recommended Hosting

### Recommended: Render + Neon

This repo now includes [render.yaml](/D:/forest/render.yaml) so Render can deploy it as a standard Node web service.

1. Create a PostgreSQL database in `Neon`.
2. In Render, create a Blueprint deployment from this repo.
3. Set `DATABASE_URL` in Render.
4. If using Google Calendar sync, also set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`.
5. Render will run:
   - `npm run prisma:migrate:deploy`
   - `npm run db:seed`
   - `npm run db:migrate-json`
   - then build and start the app

### Alternative: Railway

1. Create a web service from this repo.
2. Attach your `Neon` `DATABASE_URL`.
3. Configure these commands:
   - Build: `npm ci && npm run prisma:generate && npm run build`
   - Start: `npm start`
   - Before first deploy: `npm run prisma:migrate:deploy && npm run db:seed && npm run db:migrate-json`

## Notes

- Users, sessions, permissions, profile assignments, salary settings, job application tables, interviews, ICS sources, ICS overrides, Google Calendar links, and finance transactions are now database-backed.
- Runtime storage is PostgreSQL-only.
- `npm run db:migrate-json` is optional and only for importing an older local JSON snapshot.
- Session state is cookie-based, but active sessions are stored in PostgreSQL.
- Health endpoint: `/api/health`
- For an already-existing database that was previously managed by `db push`, baseline the first migration once:

```bash
node ./node_modules/prisma/build/index.js migrate resolve --applied 20260702120000_init
```
