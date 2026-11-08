# LogsTrace — working rules

- Docs: `README.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/SECURITY.md`, `docs/ROADMAP.md`.
- Keep features and examples generic (any system). No customer- or game-specific logic.
- Comments: short, only for non-obvious "why" or gotchas. No banners or long blocks.
- Validate every request body/query with zod (`readValidated`, shared schemas in `shared/utils/validation.ts`).
- Org/project routes must call `requireOrgAccess` / `requireProjectAccess` with the right permission from `shared/utils/permissions.ts`.
- Masking: anything returning log text/values must respect `logs:read_sensitive` (`visibleText`, `maskText`, `maskData`); filters/search run on masked text for viewers; masking must keep word count.
- User-chosen names go through `nameSchema` (`isSafeDisplayText`); redirects through `safeRedirect()`.
- Use Postgres rate limits (`enforceRateLimit`), not in-memory ones. Audit security-relevant actions (`audit()`).
- Don't weaken CSP, CSRF (`02.csrf.ts`) or body limits. No `v-html` on log data.
- Schema changes: edit `server/db/schema.ts`, then `npm run db:generate`.
- Run `npx nuxt typecheck` before finishing; it must pass.
- Never commit `.env` or `.dev-accounts.md`, and never paste their contents into code, docs or chat.
- Keep Nuxt at 4.5.2 and TypeScript at 5.9.
- After a change, update `docs/ROADMAP.md` and the other docs if relevant. Docs stay short: bullets and tables.
