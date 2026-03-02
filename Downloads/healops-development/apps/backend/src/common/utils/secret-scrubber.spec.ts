import { scrubSecrets, scrubObject } from './secret-scrubber';

describe('scrubSecrets', () => {
  // ─── Positive tests — each pattern should be detected ──────────────────

  it('should redact API keys (sk-...)', () => {
    const result = scrubSecrets('my key is sk-abcdefghijklmnopqrst123');
    expect(result.cleaned).toContain('[REDACTED:API_KEY]');
    expect(result.count).toBe(1);
  });

  it('should redact GitHub PATs (ghp_)', () => {
    const result = scrubSecrets('token: ghp_' + 'a'.repeat(36));
    expect(result.cleaned).toContain('[REDACTED:GH_PAT]');
    expect(result.count).toBe(1);
  });

  it('should redact GitHub secrets (ghs_)', () => {
    const result = scrubSecrets('secret: ghs_' + 'b'.repeat(36));
    expect(result.cleaned).toContain('[REDACTED:GH_SECRET]');
    expect(result.count).toBe(1);
  });

  it('should redact GitHub fine-grained PATs (github_pat_)', () => {
    const result = scrubSecrets('pat: github_pat_' + 'c'.repeat(82));
    expect(result.cleaned).toContain('[REDACTED:GH_FINE_GRAINED_PAT]');
    expect(result.count).toBe(1);
  });

  it('should redact Bearer tokens', () => {
    const result = scrubSecrets('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(result.cleaned).toContain('[REDACTED:BEARER_TOKEN]');
    expect(result.count).toBe(1);
  });

  it('should redact passwords', () => {
    const result = scrubSecrets('password=my_secret_pass');
    expect(result.cleaned).toContain('[REDACTED:PASSWORD]');
    expect(result.count).toBe(1);
  });

  it('should redact DATABASE_URL', () => {
    const result = scrubSecrets('DATABASE_URL=postgres://user:pass@host:5432/db');
    expect(result.cleaned).toContain('[REDACTED:DB_URL]');
    expect(result.count).toBe(1);
  });

  it('should redact REDIS_URL', () => {
    const result = scrubSecrets('REDIS_URL=redis://localhost:6379');
    expect(result.cleaned).toContain('[REDACTED:REDIS_URL]');
    expect(result.count).toBe(1);
  });

  it('should redact email addresses', () => {
    const result = scrubSecrets('contact user@example.com for help');
    expect(result.cleaned).toContain('[REDACTED:EMAIL]');
    expect(result.count).toBe(1);
  });

  it('should redact private key headers', () => {
    const result = scrubSecrets('-----BEGIN RSA PRIVATE KEY-----');
    expect(result.cleaned).toContain('[REDACTED:PRIVATE_KEY]');
    expect(result.count).toBe(1);
  });

  it('should redact GitHub secrets (ghsecret_)', () => {
    const result = scrubSecrets('ghsecret_' + 'd'.repeat(40));
    expect(result.cleaned).toContain('[REDACTED:GITHUB_SECRET]');
    expect(result.count).toBe(1);
  });

  it('should redact Slack tokens', () => {
    const result = scrubSecrets('token: xoxb-1234567890-abcdefg');
    expect(result.cleaned).toContain('[REDACTED:SLACK_TOKEN]');
    expect(result.count).toBe(1);
  });

  it('should redact AWS access keys (EC-44)', () => {
    const result = scrubSecrets('aws key: AKIAIOSFODNN7EXAMPLE');
    expect(result.cleaned).toContain('[REDACTED:AWS_ACCESS_KEY]');
    expect(result.count).toBe(1);
  });

  it('should redact Anthropic keys (EC-44)', () => {
    const result = scrubSecrets('key: sk-ant-api03-abc123def456');
    expect(result.cleaned).toContain('[REDACTED:ANTHROPIC_KEY]');
    expect(result.count).toBe(1);
  });

  // ─── Negative tests — should NOT be redacted ───────────────────────────

  it('should not redact normal text', () => {
    const text = 'This is a normal log line with no secrets';
    const result = scrubSecrets(text);
    expect(result.cleaned).toBe(text);
    expect(result.count).toBe(0);
  });

  it('should not redact short strings that look like prefixes', () => {
    const result = scrubSecrets('sk-short');
    expect(result.count).toBe(0);
  });

  // ─── Multiple secrets ──────────────────────────────────────────────────

  it('should redact multiple secrets in one string', () => {
    const result = scrubSecrets(
      'DATABASE_URL=postgres://x REDIS_URL=redis://y password=z',
    );
    expect(result.count).toBe(3);
  });
});

describe('scrubObject', () => {
  it('should scrub secrets from nested object values', () => {
    const obj = {
      name: 'test',
      config: { dbUrl: 'DATABASE_URL=postgres://user:pass@host/db' },
    };
    const cleaned = scrubObject(obj);
    expect((cleaned['config'] as Record<string, unknown>)['dbUrl']).toContain('[REDACTED:DB_URL]');
  });

  it('should leave non-string values unchanged', () => {
    const obj = { count: 42, flag: true };
    const cleaned = scrubObject(obj);
    expect(cleaned['count']).toBe(42);
    expect(cleaned['flag']).toBe(true);
  });
});
