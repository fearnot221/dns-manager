import { afterEach, describe, expect, it, vi } from 'vitest';
import { portalIdentity, ncuPortalProvider } from '@/lib/auth/ncu-portal';
import { isSameOrigin } from '@/lib/api/origin';
const profile = { identifier: 'student-test', chineseName: '測試', email: 'test@example.com', emailVerified: true };
afterEach(() => vi.unstubAllEnvs());
describe('NCU Portal identity', () => {
  it('uses studentId for display but never for owner authorization', () => {
    expect(portalIdentity({ identifier: 'someone', studentId: '115502532' })).toMatchObject({ owner: false, name: '115502532' });
    expect(portalIdentity({ identifier: '115502532' })).toMatchObject({ owner: true });
    expect(portalIdentity({ identifier: 'someone', email: null }).email).toMatch(/@accounts.invalid$/);
  });
  it('always provisions ordinary users regardless of claimed administrator roles', async () => {
    const provider = ncuPortalProvider();
    expect(await provider.profile!({ ...profile, globalRole: 'SUPER_ADMIN', role: 'ADMIN' }, {})).toMatchObject({ globalRole: 'USER' });
  });
  it('maps a verified user without granting administrator access', () => {
    expect(portalIdentity(profile, 'owner-id')).toMatchObject({ id: 'student-test', name: "student-test", owner: false });
    expect(ncuPortalProvider().allowDangerousEmailAccountLinking).toBe(false);
  });
  it('blocks delegated login', () => {
    for (const extra of [{ delegator: { identifier: 'other' } }]) expect(() => portalIdentity({ ...profile, ...extra }, 'owner-id')).toThrow();
  });
  it('never elevates a user by the owner email; binds only the configured identifier', () => {
    expect(portalIdentity({ ...profile, email: 'fearnot@ce.ncu.edu.tw' }, 'owner-id').owner).toBe(false);
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
