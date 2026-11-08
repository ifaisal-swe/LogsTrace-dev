# Contributing

Thanks for helping. Bug reports, ideas, docs fixes and pull requests are all welcome.

## Ways to contribute

- **Bug**: open an issue with the *Bug report* template.
- **Idea**: open an issue with the *Feature request* template. For bigger changes, wait for a reply before writing code, so your work isn't wasted.
- **Docs**: edit `docs-site/content/` (user docs) or `docs/` (internal docs).
- **Security issue**: never public. See [SECURITY.md](SECURITY.md).

## Set up

Follow the [README quick start](README.md#quick-start-local). Use test data only; never paste real API keys, emails or `.env` contents in issues or PRs.

## Pull requests

1. Fork the repo and create a branch: `git checkout -b fix/short-description`.
2. Read [CLAUDE.md](CLAUDE.md) (working rules) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). For a design change, discuss it in an issue first.
3. Keep PRs small and focused: one change per PR.
4. Run `npx nuxt typecheck`; it must pass (CI checks it too).
5. Schema change: edit `server/db/schema.ts`, then `npm run db:generate`, and commit the migration.
6. Update docs if behaviour changed.
7. Open the PR and fill in the template.

Rules that reviews check:

- Keep features generic: no customer-, product- or game-specific logic.
- Validate every request body/query with zod; org/project routes check permissions.
- Anything returning log data respects masking (`logs:read_sensitive`).
- Don't weaken CSP, CSRF, rate limits or body limits. No `v-html` on log data.
- Short code comments, only for non-obvious "why".

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`.

## License and CLA

LogsTrace is licensed under [AGPL-3.0](LICENSE).

By submitting a contribution you agree that:

1. You wrote it, or have the right to submit it.
2. It is licensed to the project under AGPL-3.0.
3. You grant the project maintainer a perpetual, worldwide, royalty-free, irrevocable license to use, modify, sublicense and relicense your contribution, including under other license terms (for example for the hosted service at logstrace.dev).

You keep the copyright to your contribution.

## Code of conduct

Be kind. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
