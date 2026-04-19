import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

export async function execJson(command, args) {
  return await new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${stderr || stdout || error.message}`.trim()));
        return;
      }
      const cleaned = String(stdout)
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('Vercel CLI '))
        .join('\n');
      try {
        resolve(JSON.parse(cleaned));
      } catch {
        reject(new Error(`Failed to parse JSON from ${command} ${args.join(' ')}: ${cleaned.slice(0, 500)}`));
      }
    });
  });
}

export async function vercelApiJson(path) {
  return await execJson('vercel', ['api', path, '--raw']);
}

export async function discoverCliScopes() {
  const user = await vercelApiJson('/v2/user');
  const teams = await vercelApiJson('/v2/teams');
  return {
    personal: { label: 'personal', accountId: user?.user?.id ?? null },
    teams: Array.isArray(teams?.teams)
      ? teams.teams.map((team) => ({ label: team.slug || team.id, teamId: team.id, slug: team.slug || null }))
      : [],
  };
}

export function isVercelAuthError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('missing an authentication token') ||
    message.includes('authentication token') ||
    message.includes('valid access token') ||
    message.includes('not logged in') ||
    message.includes('no existing credentials found') ||
    message.includes('please run `vercel login`') ||
    message.includes('please run vercel login')
  );
}

export async function ensureVercelCliLogin() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Not logged into Vercel. Run `vercel login` or set VERCEL_TOKEN, then try again.');
  }

  console.log('Not logged into Vercel yet. Starting `vercel login` now...');

  await new Promise((resolve, reject) => {
    const child = spawn('vercel', ['login'], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error('Vercel login did not complete successfully.'));
    });
  });
}

export async function withCliLoginRetry(fn) {
  try {
    return await fn();
  } catch (error) {
    if (!isVercelAuthError(error)) throw error;
    await ensureVercelCliLogin();
    return await fn();
  }
}

export async function readLinkedProject(dir) {
  const path = `${dir.replace(/\/$/, '')}/.vercel/project.json`;
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

export async function listLinkedEnvVars(dir) {
  const data = await execJson('vercel', ['env', 'list', '--cwd', dir, '--format', 'json']);
  return Array.isArray(data?.envs) ? data.envs : [];
}
