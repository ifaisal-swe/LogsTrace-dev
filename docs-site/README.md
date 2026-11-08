# LogsTrace docs site

Source of [docs.logstrace.dev](https://docs.logstrace.dev): user guides and API reference. Built with [Docus](https://docus.dev) (a Nuxt layer); pages are Markdown in `content/`. It's a separate Nuxt app from the main product.

## Run locally

Requirements: Node 24.

```bash
cd docs-site
npm install
npm run dev        # http://localhost:3100
```

## Build

```bash
npm run generate   # static site in .output/public
```

Deploy `.output/public` to any static host (Cloudflare Pages, Netlify, GitHub Pages, nginx).

## Structure

| Path | Tab / URL |
|---|---|
| `content/index.md` | Landing page `/` |
| `content/1.guides/` | Documentation `/guides/...` (getting started, sending logs, integrations, exploring, teams) |
| `content/2.api-reference/` | API Reference `/api-reference/...` |
| `public/` | Logos and favicon |

## Writing docs

- Number prefixes set the order; `.navigation.yml` sets group titles and icons.
- Components: `::card-group`, `::card`, `::steps`, `::code-group`, `::field-group`, `::note`, `::tip`, `::warning` ([Nuxt UI prose](https://ui.nuxt.com/docs/typography)).
- Don't name a folder `docs`: Docus strips `/docs` from the navigation and the other tabs disappear.
- Examples use `https://logstrace.dev`; keep them generic (any system, any language).
- Update these pages whenever user-facing behaviour changes; internal docs live in [`../docs/`](../docs).
- Nuxt stays at 4.5.2.

Found a typo or an unclear page? Pull requests are welcome; see [CONTRIBUTING.md](../CONTRIBUTING.md).
