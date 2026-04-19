#!/usr/bin/env node

import { analyzeEnv, parseBreachDate, sortFindings } from './heuristics.mjs';
import {
  discoverScopesWithToken,
  listProjects,
  listEnvVars,
  listProjectsViaCli,
  listEnvVarsViaCli,
  normalizeScopeLabel,
} from './audit.mjs';
import { printHuman } from './formatters.mjs';
import { discoverCliScopes, isVercelAuthError, readLinkedProject, listLinkedEnvVars, withCliLoginRetry } from './auth.mjs';

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

  return out;
}

function usage() {
  return [
    'Usage:',
    '  vercel-sedret-audit [options]',
    '',
    'Options:',
    '  --scope <personal|team-slug|team-id>   Repeatable, defaults to all accessible scopes',
    '  --project <name>                       Only audit named project(s), repeatable',
    '  --linked-dir <path>                    Audit linked local project dir(s), repeatable',
    '  --breach-date <YYYY-MM-DD>             Compare updatedAt against a breach date',
    '  --decrypt                              Decrypt values for stronger heuristics, but never print them',
    '  --include-ok                           Also print low-risk / okay entries',
    '  --json                                 Emit JSON instead of human-readable text',
    '  -h, --help                             Show this help',
    '',
    'Defaults:',
    '  - With no options, audits all accessible Vercel projects using your current CLI login.',
    '  - If VERCEL_TOKEN is set, uses the API directly across all accessible scopes.',
    '  - If --linked-dir is passed, audits those linked project directories too.',
  ].join('\n');
}

async function collectFromLinkedDirs(args, projectFilter, breachDate, results, failures) {
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
      if (isVercelAuthError(error)) throw error;
      failures.push({ scope: 'linked', project: dir, stage: 'linkedDir', error: error.message });
    }
  }
}

async function collectFromScopes(scopes, listProjectsFn, listEnvVarsFn, projectFilter, breachDate, decrypt, results, failures) {
  for (const scope of scopes) {
    let projects;
    try {
      projects = await listProjectsFn(scope);
    } catch (error) {
      failures.push({ scope, stage: 'listProjects', error: error.message });
      continue;
    }

    for (const project of projects) {
      if (projectFilter.size > 0 && !projectFilter.has(String(project.name).toLowerCase())) continue;
      try {
        const envs = await listEnvVarsFn(project, scope, decrypt);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const token = process.env.VERCEL_TOKEN;
  const breachDate = parseBreachDate(args.breachDate);
  const projectFilter = new Set(args.projects.map((p) => p.toLowerCase()));
  const results = [];
  const failures = [];

  if (args.linkedDirs.length > 0) {
    await withCliLoginRetry(() => collectFromLinkedDirs(args, projectFilter, breachDate, results, failures));
  }

  const explicitScopes = args.scopes.length > 0 ? args.scopes : null;

  if (token) {
    const discovered = explicitScopes
      ? explicitScopes
      : ['personal', ...((await discoverScopesWithToken(token)).teams.map((team) => team.slug || team.teamId))];

    await collectFromScopes(
      discovered,
      (scope) => listProjects(token, scope),
      (project, scope, decrypt) => listEnvVars(token, project, scope, decrypt),
      projectFilter,
      breachDate,
      args.decrypt,
      results,
      failures,
    );
  } else if (args.linkedDirs.length === 0 || explicitScopes) {
    await withCliLoginRetry(async () => {
      const discovered = explicitScopes
        ? explicitScopes
        : ['personal', ...((await discoverCliScopes()).teams.map((team) => team.slug || team.teamId))];

      await collectFromScopes(
        discovered,
        (scope) => listProjectsViaCli(scope),
        (project, scope, decrypt) => listEnvVarsViaCli(project, scope, decrypt),
        projectFilter,
        breachDate,
        args.decrypt,
        results,
        failures,
      );
    });
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
