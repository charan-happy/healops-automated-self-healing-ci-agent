import { SecretScrubberService } from './secret-scrubber.service';

describe('SecretScrubberService', () => {
  let service: SecretScrubberService;

  beforeEach(() => {
    service = new SecretScrubberService();
  });

  describe('scrub()', () => {
    it('should redact API keys', () => {
      const result = service.scrub('My key is sk-abc123def456ghi789jkl012');
      expect(result.cleaned).toBe('My key is [REDACTED:API_KEY]');
      expect(result.count).toBe(1);
    });

    it('should redact GitHub PATs', () => {
      const result = service.scrub('Token: ghp_abcdefghijklmnopqrstuvwxyz1234567890');
      expect(result.cleaned).toBe('Token: [REDACTED:GH_PAT]');
      expect(result.count).toBe(1);
    });

    it('should redact GitHub secrets (ghs_)', () => {
      const result = service.scrub('Secret: ghs_abcdefghijklmnopqrstuvwxyz1234567890');
      expect(result.cleaned).toBe('Secret: [REDACTED:GH_SECRET]');
      expect(result.count).toBe(1);
    });

    it('should redact Bearer tokens', () => {
      const result = service.scrub('Authorization: Bearer eyJhbGciOiJSUzI1NiJ9abcdef');
      expect(result.cleaned).toBe('Authorization: [REDACTED:BEARER_TOKEN]');
      expect(result.count).toBe(1);
    });

    it('should redact passwords (case insensitive)', () => {
      const result = service.scrub('PASSWORD=mysecretpass123');
      expect(result.cleaned).toBe('[REDACTED:PASSWORD]');
      expect(result.count).toBe(1);
    });

    it('should redact DATABASE_URL', () => {
      const result = service.scrub('DATABASE_URL=postgresql://user:pass@host:5432/db');
      expect(result.cleaned).toBe('[REDACTED:DB_URL]');
      expect(result.count).toBe(1);
    });

    it('should redact REDIS_URL', () => {
      const result = service.scrub('REDIS_URL=redis://default:pass@host:6379');
      expect(result.cleaned).toBe('[REDACTED:REDIS_URL]');
      expect(result.count).toBe(1);
    });

    it('should redact email addresses', () => {
      const result = service.scrub('Contact admin@example.com for support');
      expect(result.cleaned).toBe('Contact [REDACTED:EMAIL] for support');
      expect(result.count).toBe(1);
    });

    it('should redact private key headers', () => {
      const result = service.scrub('-----BEGIN RSA PRIVATE KEY-----');
      expect(result.cleaned).toBe('[REDACTED:PRIVATE_KEY]');
      expect(result.count).toBe(1);
    });

    it('should redact Slack tokens', () => {
      const result = service.scrub('SLACK_TOKEN=xoxb-123456-abcdef');
      expect(result.cleaned).toContain('[REDACTED:SLACK_TOKEN]');
      expect(result.count).toBeGreaterThanOrEqual(1);
    });

    it('should count multiple different secrets', () => {
      const input = [
        'API_KEY=sk-abc123def456ghi789jkl012',
        'DATABASE_URL=postgresql://user:pass@host:5432/db',
        'Authorization: Bearer eyJhbGciOiJSUzI1NiJ9abcdef',
      ].join('\n');
      const result = service.scrub(input);
      expect(result.count).toBe(3);
      expect(result.cleaned).not.toContain('sk-abc123');
      expect(result.cleaned).not.toContain('postgresql://');
      expect(result.cleaned).not.toContain('eyJhbG');
    });

    it('should pass through non-matching strings unchanged', () => {
      const input = 'This is a normal log line with no secrets';
      const result = service.scrub(input);
      expect(result.cleaned).toBe(input);
      expect(result.count).toBe(0);
    });
  });

  describe('scrubObject()', () => {
    it('should scrub nested string values', () => {
      const obj = {
        config: {
          apiKey: 'sk-abc123def456ghi789jkl012',
          nested: {
            dbUrl: 'DATABASE_URL=postgresql://user:pass@host:5432/db',
          },
        },
        count: 42,
        enabled: true,
      };
      const result = service.scrubObject(obj as Record<string, unknown>);
      expect((result['config'] as Record<string, unknown>)['apiKey']).toBe('[REDACTED:API_KEY]');
      expect(
        ((result['config'] as Record<string, unknown>)['nested'] as Record<string, unknown>)['dbUrl'],
      ).toBe('[REDACTED:DB_URL]');
      expect(result['count']).toBe(42);
      expect(result['enabled']).toBe(true);
    });

    it('should not modify the original object', () => {
      const original = { key: 'sk-abc123def456ghi789jkl012' };
      service.scrubObject(original);
      expect(original.key).toBe('sk-abc123def456ghi789jkl012');
    });
  });
});
