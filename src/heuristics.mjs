export const DEFAULT_INCIDENT_DATE = '2026-04-19';

export function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

export function fmtDate(ts) {
  if (!ts) return 'unknown';
  const date = new Date(Number(ts));
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toISOString().slice(0, 10);
}

export function parseBreachDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid --breach-date: ${value}. Expected YYYY-MM-DD.`);
  }
  return date;
}

export function looksSecretByName(key = '') {
  const ignorePatterns = [/NOT[_-]?A[_-]?SECRET/i, /NO[_-]?SECRET/i, /EXAMPLE/i, /DUMMY/i];
  if (ignorePatterns.some((pattern) => pattern.test(key))) return false;

  const patterns = [
    /SECRET/i,
    /TOKEN/i,
    /PASSWORD/i,
    /PASS(WORD)?/i,
    /PRIVATE/i,
    /API[_-]?KEY/i,
    /ACCESS[_-]?KEY/i,
    /CLIENT[_-]?SECRET/i,
    /DATABASE[_-]?URL/i,
    /DB[_-]?URL/i,
    /JWT/i,
    /SIGNING/i,
    /COOKIE/i,
    /SESSION/i,
    /WEBHOOK/i,
    /DSN$/i,
    /CERT/i,
    /SMTP_/i,
    /POSTGRES/i,
    /REDIS/i,
    /SUPABASE.*KEY/i,
    /STRIPE.*KEY/i,
    /AUTH/i,
    /SLACK.*TOKEN/i,
  ];
  return patterns.some((pattern) => pattern.test(key));
}

export function isPublicPrefix(key = '') {
  return /^(NEXT_PUBLIC_|PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_)/.test(key);
}

export function contentHintLooksSecret(contentHint) {
  const hintType = contentHint?.type || '';
  return /(token|password|secret|connection-string)/i.test(hintType);
}

export function looksSecretByValue(value = '') {
  if (!value || typeof value !== 'string') return false;
  const patterns = [
    /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
    /\bsk_(live|test)_[A-Za-z0-9]{16,}\b/,
    /\brk_(live|test)_[A-Za-z0-9]{16,}\b/,
    /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
    /\bgh[pousr]_[A-Za-z0-9]{20,}/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    /postgres(ql)?:\/\/[^\s:]+:[^\s@]+@/i,
    /mysql:\/\/[^\s:]+:[^\s@]+@/i,
    /mongodb(\+srv)?:\/\/[^\s:]+:[^\s@]+@/i,
    /redis:\/\/:[^\s@]+@/i,
  ];
  if (patterns.some((pattern) => pattern.test(value))) return true;
  if (value.length >= 32 && !/\s/.test(value) && /[A-Za-z]/.test(value) && /\d/.test(value)) return true;
  return false;
}

export function analyzeEnv(env, options = {}) {
  const key = env.key || '(unknown)';
  const type = env.type || 'unknown';
  const targets = toArray(env.target);
  const secretByName = looksSecretByName(key);
  const publicPrefix = isPublicPrefix(key);
  const secretByHint = contentHintLooksSecret(env.contentHint);
  const secretByValue = env.decrypted ? looksSecretByValue(env.value) : false;
  const likelySecret = secretByName || secretByHint || secretByValue;
  const updatedAt = Number(env.updatedAt || env.createdAt || 0);
  const breachDate = options.breachDate || null;
  const changedSinceBreach = breachDate && updatedAt ? new Date(updatedAt) >= breachDate : null;

  const reasons = [];
  if (secretByName) reasons.push('name looks secret-ish');
  if (secretByHint) reasons.push(`content hint says ${env.contentHint.type}`);
  if (secretByValue) reasons.push('value matches secret/token pattern');
  if (breachDate && likelySecret) {
    if (changedSinceBreach === true) reasons.push(`changed since breach (${fmtDate(updatedAt)})`);
    else if (changedSinceBreach === false) reasons.push(`unchanged since breach (${fmtDate(updatedAt)})`);
  }
  if (publicPrefix) reasons.push('public-prefix variable');

  const rotationStatus = likelySecret
    ? changedSinceBreach === true
      ? 'changed_since_breach'
      : changedSinceBreach === false
        ? 'unchanged_since_breach'
        : 'review_manually'
    : 'not_applicable';

  if (type === 'system') {
    return { level: 'ok', action: 'ignore', rotationStatus, key, type, targets, reasons: ['system variable'], env };
  }

  if (publicPrefix && likelySecret) {
    return {
      level: 'critical',
      action: 'rotate_now',
      rotationStatus,
      key,
      type,
      targets,
      reasons: ['public-prefixed variable looks like a secret', ...reasons.filter((r) => r !== 'public-prefix variable')],
      env,
    };
  }

  if ((type === 'plain' || type === 'encrypted' || type === 'secret') && likelySecret) {
    return {
      level: 'critical',
      action: 'rotate_now',
      rotationStatus,
      key,
      type,
      targets,
      reasons: [`stored as ${type}, not Vercel sensitive`, ...reasons],
      env,
    };
  }

  if (type === 'sensitive' && likelySecret) {
    return {
      level: 'low',
      action: 'review_only',
      rotationStatus,
      key,
      type,
      targets,
      reasons: ['stored as sensitive, lower urgency for this incident', ...reasons],
      env,
    };
  }

  if ((type === 'plain' || type === 'encrypted' || type === 'secret') && !publicPrefix) {
    return {
      level: 'medium',
      action: 'review',
      rotationStatus,
      key,
      type,
      targets,
      reasons: [`non-sensitive variable stored as ${type}`],
      env,
    };
  }

  if (publicPrefix) {
    return {
      level: 'ok',
      action: 'likely_public',
      rotationStatus,
      key,
      type,
      targets,
      reasons: ['public client-side variable'],
      env,
    };
  }

  return {
    level: 'ok',
    action: 'ok',
    rotationStatus,
    key,
    type,
    targets,
    reasons: likelySecret ? reasons : ['no obvious rotation signal'],
    env,
  };
}

export function sortFindings(findings) {
  const weight = { critical: 0, medium: 1, low: 2, ok: 3 };
  return [...findings].sort((a, b) => {
    const wa = weight[a.level] ?? 99;
    const wb = weight[b.level] ?? 99;
    if (wa !== wb) return wa - wb;
    if (a.project !== b.project) return a.project.localeCompare(b.project);
    return a.key.localeCompare(b.key);
  });
}
