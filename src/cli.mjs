#!/usr/bin/env node

import { analyzeEnv, parseBreachDate, sortFindings } from './heuristics.mjs';
import { listProjects, listEnvVars, normalizeScopeLabel } from './audit.mjs';
import { printHuman } from './formatters.mjs';
import { readLinkedProject, listLinkedEnvVars } from './auth.mjs';

function parseArgs(argv) {
  const out = {
    scopes: [],
    projects: [],
    linkedDirs: [],
    breachDate: null,
    decrypt: false,
    includeOk: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--scope') out.scopes.push(argv[++i]);
    else if (arg.startsWith('--scope=')) out.scopes.push(arg.split('=').slice(1).join('='));
    else if (arg === '--project') out.projects.push(argv[++i]);
    else if (arg.startsWith('--project=')) out.projects.push(arg.split('=').slice(1).join('='));
    else if (arg === '--linked-dir') out.linkedDirs.push(argv[++i]);
    else if (arg.startsWith('--linked-dir=')) out.linkedDirs.push(arg.split('=').slice(1).join('='));
    else if (arg === '--breach-date') out.breachDate = argv[++i];
    else if (arg.startsWith('--breach-date=')) out.breachDate = arg.split('=').slice(1).join('=');
    else if (arg === '--decrypt') out.decrypt = true;
    else if (arg === '--include-ok') out.includeOk = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '-h' || arg === '--help') out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (out.scopes.length === 0) out.scopes = ['personal'];
  return out;
}

function usage() {
  return [
    'Usage:',
    '  vercel-sedret-audit [options]',
    '',
    'Options:',
    '  --scope <personal|team-slug|team-id>   Repeatable, defaults to personal',
    '  --project <name>                       Only audit named project(s), repeatable',
    '  --linked-dir <path>                    Audit linked local project dir(s), repeatable',
    '  --breach-date <YYYY-MM-DD>             Compare updatedAt against a breach date',
    '  --decrypt                              Decrypt values for stronger heuristics, but never print them',
    '  --include-ok                           Also print low-risk / okay entries',
    '  --json                                 Emit JSON instead of human-readable text',
    '  -h, --help                             Show this help',
    '',
    'Auth:',
    '  - Uses VERCEL_TOKEN for cross-project API audits',
    '  - Uses your existing Vercel CLI login for --linked-dir audits',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const token = process.env.VERCEL_TOKEN;
  const hasLinkedDirs = args.linkedDirs.length > 0;
  if (!token && !hasLinkedDirs) {
    throw new Error('Missing auth. Either set VERCEL_TOKEN, or use --linked-dir with a local Vercel-linked project directory.');
  }

  const breachDate = parseBreachDate(args.breachDate);
  const projectFilter = new Set(args.projects.map((p) => p.toLowerCase()));
  const results = [];
  const failures = [];

  if (hasLinkedDirs) {
    for (const dir of args.linkedDirs) {
      try {
        const project = await readLinkedProject(dir);
        if (projectFilter.size > 0 && !projectFilter.has(String(project.projectName).toLowerCase())) continue;
        const envs = await listLinkedEnvVars(dir);
        for (const env of envs) {
          const finding = analyzeEnv(env, { breachDate });
          results.push({ scope: project.orgId || 'linked', project: project.projectName || project.projectId, projectId: project.projectId, ...finding });
        }
      } catch (error) {
        failures.push({ scope: 'linked', project: dir, stage: 'linkedDir', error: error.message });
      }
    }
  }

  if (token) {
    for (const scope of args.scopes) {
      let projects;
      try {
        projects = await listProjects(token, scope);
      } catch (error) {
        failures.push({ scope, stage: 'listProjects', error: error.message });
        continue;
      }

      for (const project of projects) {
        if (projectFilter.size > 0 && !projectFilter.has(String(project.name).toLowerCase())) continue;
        try {
          const envs = await listEnvVars(token, project, scope, args.decrypt);
          for (const env of envs) {
            const finding = analyzeEnv(env, { breachDate });
            results.push({ scope: normalizeScopeLabel(scope), project: project.name, projectId: project.id, ...finding });
          }
        } catch (error) {
          failures.push({ scope, project: project.name, stage: 'listEnvVars', error: error.message });
        }
      }
    }
  }

  if (args.json) {
    process.stdout.write(JSON.stringify({ results: sortFindings(results), failures }, null, 2));
    return;
  }

  printHuman(results, args.includeOk);
  if (failures.length > 0) {
    console.log('');
    console.log('Warnings:');
    for (const failure of failures) {
      const location = failure.project ? `${failure.scope}/${failure.project}` : failure.scope;
      console.log(`- ${location} (${failure.stage}): ${failure.error}`);
    }
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
