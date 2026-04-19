# Security policy

## Supported versions

This project is early and only the latest `main` branch is considered supported.

## Reporting a vulnerability

If you believe you found a security issue in this project, please do not open a public issue first.

Instead, email:
- mitch@mitchmalone.com

Include:
- what you found
- how to reproduce it
- the impact you expect
- any suggested fix, if you have one

## Security notes

A few important trust assumptions for this repo:
- the tool is designed to run locally
- the tool never intentionally prints secret values
- `--decrypt` increases inspection depth, but still should not print values
- findings are heuristics, not proof

If you notice a path that could expose secret material in output, logs, or error handling, please report it privately.
