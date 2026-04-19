# Contributing

Thanks for helping with `vercel-secret-audit`.

## Quick start

```bash
git clone https://github.com/mitchmalone/vercel-secret-audit.git
cd vercel-secret-audit
nvm use || true
npm install
npm run check
npm run smoke
```

## Development workflow

1. Create a branch from `main`.
2. Make your change.
3. Run the local checks:

```bash
npm run check
npm run smoke
```

4. Update `README.md` if behavior or setup changed.
5. Open a pull request with a clear summary and test notes.

## Ground rules

- Keep the tool local-first.
- Do not print secret values.
- Prefer small, reviewable pull requests.
- If you change detection logic, explain the false-positive or false-negative tradeoff.
- If you add a new flag or auth flow, update the CLI help and README in the same PR.

## Testing expectations

Before opening a PR, make sure:
- `npm run check` passes
- `npm run smoke` passes
- `node ./src/cli.mjs --help` still reflects reality
- docs match the actual command examples

## Reporting ideas or bugs

- Use GitHub Issues for bugs, feature requests, and false-positive reports.
- Use private disclosure for anything security-sensitive. See `SECURITY.md`.
