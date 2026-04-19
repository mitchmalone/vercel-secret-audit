import { fmtDate, sortFindings } from './heuristics.mjs';

function formatFindingLine(f) {
  const target = f.targets.length ? f.targets.join(',') : 'unknown-target';
  const branch = f.env.gitBranch ? ` branch=${f.env.gitBranch}` : '';
  const updated = f.env.updatedAt || f.env.createdAt ? ` updated=${fmtDate(f.env.updatedAt || f.env.createdAt)}` : '';
  const rotation = f.rotationStatus && f.rotationStatus !== 'not_applicable' ? ` rotation=${f.rotationStatus}` : '';
  return `${f.level.toUpperCase().padEnd(8)} ${f.scope}/${f.project} ${f.key} [${target}] type=${f.type}${branch}${updated}${rotation} :: ${f.reasons.join('; ')}`;
}

export function printHuman(results, includeOk) {
  const flagged = includeOk ? results : results.filter((r) => r.level !== 'ok');
  const sorted = sortFindings(flagged);
  const summary = {
    projects: new Set(results.map((r) => `${r.scope}/${r.project}`)).size,
    critical: results.filter((r) => r.level === 'critical').length,
    medium: results.filter((r) => r.level === 'medium').length,
    low: results.filter((r) => r.level === 'low').length,
    ok: results.filter((r) => r.level === 'ok').length,
  };

  console.log('Vercel secret audit');
  console.log(`Projects scanned: ${summary.projects}`);
  console.log(`Critical: ${summary.critical}  Review: ${summary.medium}  Low: ${summary.low}  OK/ignored: ${summary.ok}`);
  console.log('');

  if (sorted.length === 0) {
    console.log('No flagged variables found with the current heuristics.');
    return;
  }

  for (const finding of sorted) console.log(formatFindingLine(finding));

  console.log('');
  console.log('Rotation guidance:');
  console.log('- CRITICAL: rotate now, especially if the variable contains credentials and is not `sensitive`.');
  console.log('- REVIEW: inspect manually, these are non-sensitive vars that may still be harmless config.');
  console.log('- LOW: likely okay for this incident, but still worth sanity-checking.');
}
