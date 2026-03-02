// ─── Secret Scrubber Utility ────────────────────────────────────────────────
// Scrubs sensitive content before sending to Claude/OpenRouter.
// MUST be called on ALL content before it enters the LangGraph state.

export interface ScrubResult {
  cleaned: string;
  count: number;
}

const SECRET_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, label: 'API_KEY' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, label: 'GH_PAT' },
  { pattern: /ghs_[a-zA-Z0-9]{36}/g, label: 'GH_SECRET' },
  { pattern: /github_pat_[a-zA-Z0-9_]{82}/g, label: 'GH_FINE_GRAINED_PAT' },
  { pattern: /Bearer [a-zA-Z0-9+/=]{20,}/g, label: 'BEARER_TOKEN' },
  { pattern: /password\s*[=:]\s*\S+/gi, label: 'PASSWORD' },
  { pattern: /DATABASE_URL\s*=\s*\S+/gi, label: 'DB_URL' },
  { pattern: /REDIS_URL\s*=\s*\S+/gi, label: 'REDIS_URL' },
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, label: 'EMAIL' },
  { pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, label: 'PRIVATE_KEY' },
  { pattern: /ghsecret_[a-zA-Z0-9]{40,}/g, label: 'GITHUB_SECRET' },
  { pattern: /xox[bpas]-[a-zA-Z0-9-]+/g, label: 'SLACK_TOKEN' },
  { pattern: /AKIA[0-9A-Z]{16}/g, label: 'AWS_ACCESS_KEY' },
  { pattern: /sk-ant-[\w-]+/g, label: 'ANTHROPIC_KEY' },
];

export function scrubSecrets(content: string): ScrubResult {
  let cleaned = content;
  let count = 0;

  for (const { pattern, label } of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const matches = cleaned.match(regex);
    if (matches) {
      count += matches.length;
      cleaned = cleaned.replace(regex, `[REDACTED:${label}]`);
    }
  }

  return { cleaned, count };
}

export function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(obj), (_key: string, value: unknown) => {
    if (typeof value === 'string') {
      return scrubSecrets(value).cleaned;
    }
    return value;
  }) as Record<string, unknown>;
}
