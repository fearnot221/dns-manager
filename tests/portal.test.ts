import { afterEach, describe, expect, it, vi } from 'vitest';
import { portalIdentity, ncuPortalProvider } from '@/lib/auth/ncu-portal';
import { isSameOrigin } from '@/lib/api/origin';
const profile = { identifier: 'student-test', chineseName: '測試', email: 'test@example.com', emailVerified: true };
afterEach(() => vi.unstubAllEnvs());
describe('NCU Portal identity', () => {
  it('maps a verified user without granting administrator access', () => {
    expect(portalIdentity(profile, 'owner-id')).toMatchObject({ id: 'student-test', email: profile.email, owner: false });
    expect(ncuPortalProvider().allowDangerousEmailAccountLinking).toBe(false);
  });
  it('blocks delegated login and unverified or missing contact emails', () => {
    for (const extra of [{ delegator: { identifier: 'other' } }, { emailVerified: false }, { email: null }]) expect(() => portalIdentity({ ...profile, ...extra }, 'owner-id')).toThrow();
  });
  it('never elevates a user by the owner email; binds only the configured identifier', () => {
    expect(() => portalIdentity({ ...profile, email: 'fearnot@ce.ncu.edu.tw' }, 'owner-id')).toThrow();
    expect(portalIdentity({ identifier: 'owner-id' }, 'owner-id')).toMatchObject({ owner: true, email: 'fearnot@ce.ncu.edu.tw' });
  });
});
describe('reverse proxy origin checks', () => {
  it('uses the configured public origin without trusting forwarded headers', () => {
    vi.stubEnv('AUTH_URL', 'https://dns.example.edu.tw');
    const request = (origin: string) => new Request('http://0.0.0.0:3000/api/users', { headers: { origin, 'x-forwarded-host': 'evil.example' } });
    expect(isSameOrigin(request('https://dns.example.edu.tw'))).toBe(true);
    expect(isSameOrigin(request('https://evil.example'))).toBe(false);
    expect(isSameOrigin(request('not-a-url'))).toBe(false);
  });
});
