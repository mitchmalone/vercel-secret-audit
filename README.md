# vercel-secret-audit

A local audit tool for Vercel environment variables.

It helps with two jobs:
- finding variables that probably contain secrets
- checking which likely secrets appear unchanged since a breach date

## Status

This repo is meant to be cloned and run locally.

It is not published to npm yet.

## What it does

- audits Vercel env vars across personal and team scopes
- works with your existing Vercel CLI login or a `VERCEL_TOKEN`
- uses key names, Vercel metadata, and optional decrypted-value checks to spot likely secrets
- compares likely secrets against a breach date when you provide one
- never prints secret values, even with `--decrypt`

## What it does not do

- rotate secrets for you
- guarantee that an unflagged variable is safe
- replace manual review

## Requirements

- Node.js
- npm
- Vercel CLI (`vercel`) in your `PATH`
- either:
  - an active `vercel login` session, or
  - a `VERCEL_TOKEN`

## Quick start

```bash
git clone https://github.com/mitchmalone/vercel-secret-audit.git
cd vercel-secret-audit
npm install
npm run audit
```

By default, the tool will use your current Vercel CLI login, discover every personal and team scope you can access, and audit every project in those scopes.

If you want to use token auth instead:

```bash
VERCEL_TOKEN=xxx npm run audit
```

## Common usage

```bash
# audit all accessible projects via current Vercel CLI login
npm run audit

# show help
npm run audit -- --help

# audit the current linked Vercel project only
npm run audit -- --linked-dir .

# audit multiple linked local projects
npm run audit -- --linked-dir ./app-a --linked-dir ./app-b

# audit all accessible projects with API token auth
VERCEL_TOKEN=xxx npm run audit

# limit to one scope
VERCEL_TOKEN=xxx npm run audit -- --scope personal
VERCEL_TOKEN=xxx npm run audit -- --scope my-team

# only inspect specific projects
VERCEL_TOKEN=xxx npm run audit -- --scope my-team --project my-app

# compare likely secrets against a breach date
VERCEL_TOKEN=xxx npm run audit -- --scope my-team --breach-date 2026-04-19

# include lower-risk / okay entries too
npm run audit -- --include-ok

# use decrypted values for stronger heuristics, without printing values
VERCEL_TOKEN=xxx npm run audit -- --decrypt

# machine-readable output
VERCEL_TOKEN=xxx npm run audit -- --json
```

## How it works

The tool combines a few signals:
- secret-looking names like `API_KEY`, `TOKEN`, `DATABASE_URL`, `JWT`, and `CLIENT_SECRET`
- Vercel metadata such as variable type and content hints
- optional decrypted-value checks when `--decrypt` is enabled
- optional breach-date comparison using `updatedAt`

Treat the results as triage, not proof.

## Output levels

- `CRITICAL`: likely secret, or a public-prefixed variable that looks like a secret
- `MEDIUM`: worth reviewing manually
- `LOW`: likely secret, but already stored as `sensitive`
- `OK`: expected public/client-side or otherwise low-risk metadata

## Rotation verification

If you pass `--breach-date YYYY-MM-DD`, likely secrets are classified as:
- `changed_since_breach`
- `unchanged_since_breach`
- `review_manually`

That is useful evidence, not perfect proof.

## Authentication modes

### Use your existing Vercel CLI login

```bash
vercel login
npm run audit
```

If you are not logged in and run the tool in an interactive terminal, it will try to start `vercel login` for you.

### Use a Vercel token

```bash
VERCEL_TOKEN=xxx npm run audit
```

Token auth is useful for wider audits and non-interactive runs.

## Development

```bash
npm run check
npm run smoke
npm run audit -- --help
```

## Troubleshooting

### `vercel: command not found`

Install the Vercel CLI and make sure it is in your `PATH`.

### Not logged into Vercel

Run:

```bash
vercel login
```

Or set `VERCEL_TOKEN` before running the tool.

### No flagged variables found

That usually means one of two things:
- the current heuristics did not find anything suspicious
- the risky variables do not match the patterns this tool knows about yet

Manual review still matters.

## License

MIT
