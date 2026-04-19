import { fmtDate, sortFindings } from './heuristics.mjs';

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

function colorize(enabled, color, text) {
  if (!enabled || !color) return text;
  return `${color}${text}${ANSI.reset}`;
}

function style(enabled, styleCode, text) {
  if (!enabled || !styleCode) return text;
  return `${styleCode}${text}${ANSI.reset}`;
}

function dedupeResults(results) {
  const bestByKey = new Map();
  const scopeWeight = (scope) => (scope === 'personal' ? 1 : 0);

  for (const item of results) {
    const dedupeKey = [
      item.projectId || item.project,
      item.key,
      item.type,
      item.env?.gitBranch || '',
      [...(item.targets || [])].sort().join(','),
    ].join('::');

    const existing = bestByKey.get(dedupeKey);
    if (!existing || scopeWeight(item.scope) < scopeWeight(existing.scope)) {
      bestByKey.set(dedupeKey, item);
    }
  }

  return [...bestByKey.values()];
}

function formatTargets(targets) {
  if (!targets || targets.length === 0) return 'unknown environment';
  if (targets.length === 3 && ['development', 'preview', 'production'].every((t) => targets.includes(t))) {
    return 'all environments';
  }
  return targets.join(', ');
}

function adviceFor(finding) {
  if (finding.action === 'rotate_now') return 'advise to rotate immediately';
  if (finding.rotationStatus === 'unchanged_since_breach') return 'looks unchanged since breach, advise to rotate';
  if (finding.action === 'review_only') return 'looks lower risk, but still review';
  return 'advise to review manually';
}

function conciseReason(finding) {
  if (finding.rotationStatus === 'unchanged_since_breach') return 'unchanged since breach';
  if (finding.rotationStatus === 'changed_since_breach') return 'changed since breach';
  if (finding.action === 'rotate_now') return 'likely secret not stored as sensitive';
  if (finding.action === 'review_only') return 'stored as sensitive';
  return 'non-sensitive variable';
}

function badge(enabled, finding) {
  if (finding.level === 'critical') return colorize(enabled, ANSI.red, '🚨 CRITICAL');
  if (finding.level === 'medium') return colorize(enabled, ANSI.yellow, '⚠️ MEDIUM');
  if (finding.level === 'low') return colorize(enabled, ANSI.blue, 'ℹ️ LOW');
  return colorize(enabled, ANSI.gray, '· OK');
}

function verboseLine(f, enabled) {
  const target = f.targets.length ? f.targets.join(',') : 'unknown-target';
  const branch = f.env.gitBranch ? ` branch=${f.env.gitBranch}` : '';
  const updated = f.env.updatedAt || f.env.createdAt ? ` updated=${fmtDate(f.env.updatedAt || f.env.createdAt)}` : '';
  const rotation = f.rotationStatus && f.rotationStatus !== 'not_applicable' ? ` rotation=${f.rotationStatus}` : '';
  const level = colorize(enabled, f.level === 'critical' ? ANSI.red : f.level === 'medium' ? ANSI.yellow : f.level === 'low' ? ANSI.blue : ANSI.gray, f.level.toUpperCase());
  return `${level} ${f.scope}/${f.project} ${f.key} [${target}] type=${f.type}${branch}${updated}${rotation} :: ${f.reasons.join('; ')}`;
}

function conciseLine(f, enabled) {
  const scopeProject = style(enabled, ANSI.bold, `${f.scope}/${f.project}`);
  const key = colorize(enabled, ANSI.blue, style(enabled, ANSI.bold, f.key));
  const type = colorize(enabled, ANSI.dim, f.type);
  const updated = fmtDate(f.env.updatedAt || f.env.createdAt);
  const branch = f.env.gitBranch ? `, branch ${f.env.gitBranch}` : '';
  const note = conciseReason(f);
  return `${badge(enabled, f)} ${scopeProject} ${key} ${formatTargets(f.targets)}, ${type}${branch}, last update ${updated}, ${note}, ${adviceFor(f)}`;
}

export function printHuman(results, options = {}) {
  const { includeOk = false, verbose = false } = options;
  const deduped = dedupeResults(results);
  const printable = includeOk ? deduped : deduped.filter((r) => r.level !== 'ok');
  const sorted = sortFindings(printable);
  const useColor = !!process.stdout.isTTY && !process.env.NO_COLOR;
  const summary = {
    projects: new Set(deduped.map((r) => r.projectId || `${r.scope}/${r.project}`)).size,
    critical: deduped.filter((r) => r.level === 'critical').length,
    medium: deduped.filter((r) => r.level === 'medium').length,
    low: deduped.filter((r) => r.level === 'low').length,
    ok: deduped.filter((r) => r.level === 'ok').length,
  };

  console.log(style(useColor, ANSI.bold, 'Vercel secret audit'));
  console.log(`${summary.projects} project(s), ${colorize(useColor, ANSI.red, `${summary.critical} critical`)}, ${colorize(useColor, ANSI.yellow, `${summary.medium} medium`)}, ${colorize(useColor, ANSI.blue, `${summary.low} low`)}, ${colorize(useColor, ANSI.gray, `${summary.ok} ok`)}`);
  console.log('');

  if (sorted.length === 0) {
    console.log('No flagged variables found with the current heuristics.');
    return;
  }

  for (const finding of sorted) {
    console.log(verbose ? verboseLine(finding, useColor) : conciseLine(finding, useColor));
  }

  if (!verbose) {
    console.log('');
    console.log(colorize(useColor, ANSI.gray, 'Tip: use --verbose for the old detailed diagnostic output.'));
  }
}
