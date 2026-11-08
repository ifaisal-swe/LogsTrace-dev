## What and why

<!-- What does this change, and which problem does it solve? Link the issue: Closes #123 -->

## How to test

## Checklist

- [ ] `npx nuxt typecheck` passes
- [ ] Request bodies/queries validated with zod; org/project routes check permissions
- [ ] Log text/values respect masking (`logs:read_sensitive`)
- [ ] Generic (no customer-, product- or game-specific logic)
- [ ] Docs updated (`docs/`, `docs-site/`) if behaviour changed; schema changes include `npm run db:generate` output
- [ ] I agree to the CLA in [CONTRIBUTING.md](../CONTRIBUTING.md#license-and-cla)
