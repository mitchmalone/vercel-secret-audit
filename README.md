# vercel-secret-audit

Local-first audit tool for Vercel environment variables.

It helps answer two practical questions after the April 2026 incident:
- which variables look like secrets and should probably be rotated now?
- which likely secrets appear unchanged since the breach date?

## Trust model

- runs locally
- never prints secret values
- prefers your existing Vercel CLI session when possible
- can also use a `VERCEL_TOKEN` for broader cross-project audits

## Quick start

```bash
npx vercel-secret-audit
```

By default, it will:
- use your current Vercel CLI login
- find all accessible Vercel projects across your personal account and teams
- audit each project automatically

Or with a token:

```bash
VERCEL_TOKEN=xxx npx vercel-secret-audit
```

## Common usage

```bash
# audit all accessible projects via current Vercel CLI login
npx vercel-secret-audit

# audit the current linked Vercel project only
npx vercel-secret-audit --linked-dir .

# audit multiple linked projects
npx vercel-secret-audit --linked-dir ./app-a --linked-dir ./app-b

# audit all accessible projects with API token auth
VERCEL_TOKEN=xxx npx vercel-secret-audit

# limit to one scope if needed
VERCEL_TOKEN=xxx npx vercel-secret-audit --scope personal
VERCEL_TOKEN=xxx npx vercel-secret-audit --scope my-team

# only inspect specific projects
VERCEL_TOKEN=xxx npx vercel-secret-audit --scope my-team --project my-app

# include breach-date awareness
VERCEL_TOKEN=xxx npx vercel-secret-audit --scope my-team --breach-date 2026-04-19

# machine-readable output
VERCEL_TOKEN=xxx npx vercel-secret-audit --scope my-team --json
```

## Output levels

- `CRITICAL`: likely secret, not stored as `sensitive`, or a public-prefixed accidental secret
- `MEDIUM`: review manually
- `LOW`: likely secret but already stored as `sensitive`
- `OK`: expected public/client-side or otherwise low-risk metadata

## Rotation verification

If you provide `--breach-date YYYY-MM-DD`, the tool will classify likely secrets as:
- `changed_since_breach`
- `unchanged_since_breach`
- `review_manually`

That is useful evidence, not perfect proof.

## Development

```bash
npm run check
npm run start -- --help
```
