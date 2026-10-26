<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Forma project guidance

Forma is a Russian-language CRM for freelancers and small studios. The stack is Next.js 16.4.3, React 19, TypeScript, PostgreSQL, Drizzle ORM, and Better Auth. The app is prepared for Netlify; `netlify.toml` and `.nvmrc` are part of the deployment setup.

### Architecture and data safety

- Keep user-facing interface copy in Russian.
- Authenticated API handlers must call `getAuthenticatedWorkspace(request)` from `src/lib/api-auth.ts`. Scope every business-data read, update, and delete to the returned `workspaceId`; never rely on a client-supplied workspace ID.
- Validate request bodies on the server with Zod. Treat all browser input as untrusted.
- Keep database definitions in `src/db/schema.ts` and migrations in `drizzle/`. For schema changes, generate a new migration with `pnpm db:generate`, inspect its SQL, and apply it with `pnpm db:migrate` when the configured database is available. Do not rewrite already-applied migrations.
- Record successful business mutations through `recordActivity` in `src/lib/activity.ts` so the activity feed stays consistent.
- Documents are stored in PostgreSQL. The 4 MB upload limit matches the Netlify Functions binary request limit; update both the API and UI together if the hosting strategy changes.
- Keep credentials in ignored environment files such as `.env.local` or in deployment environment settings. Never commit real secrets; `.env.example` must contain placeholders only.

### Local development and deployment

- Use Node.js 22 and the pnpm version pinned in `package.json`.
- Start PostgreSQL with `docker compose up -d postgres`, then start the app with `pnpm dev`.
- Apply migrations with `pnpm db:migrate`; add the demo records with `pnpm db:seed` only when setting up an empty database.
- Before changing Next.js APIs or conventions, read the matching guide under `node_modules/next/dist/docs/` as required by the generated Next.js rules above.
- The production build command is `pnpm build`. Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, and the production `BETTER_AUTH_URL` in the hosting provider; do not put them in source control.
