import { UserDB } from 'types/database';
import { describe, expect, it, vi } from 'vitest';
import { resolveStartupUser } from './resolveStartupUser';

const user = { id: 'u1', is_onboarded: true, start_date: '2026-10-01' } as UserDB;
const cached = { ...user, start_date: '2026-09-01' } as UserDB;

const deps = (overrides: Partial<Parameters<typeof resolveStartupUser>[0]> = {}) => ({
  isOnline: async () => true,
  loadSessionUser: async () => ({ hasSession: true, user }),
  loadCachedUser: async () => cached,
  saveCachedUser: vi.fn(async () => {}),
  ...overrides,
});

describe('resolveStartupUser', () => {
  it('uses the server user when online and caches it', async () => {
    const d = deps();
    expect(await resolveStartupUser(d)).toEqual({ isLoggedIn: true, user });
    expect(d.saveCachedUser).toHaveBeenCalledWith(user);
  });

  it('uses the cached user when offline', async () => {
    const loadSessionUser = vi.fn();
    expect(
      await resolveStartupUser(deps({ isOnline: async () => false, loadSessionUser }))
    ).toEqual({ isLoggedIn: true, user: cached });
    expect(loadSessionUser).not.toHaveBeenCalled();
  });

  it('is logged out when offline without a cached user', async () => {
    expect(
      await resolveStartupUser(
        deps({ isOnline: async () => false, loadCachedUser: async () => null })
      )
    ).toEqual({ isLoggedIn: false, user: null });
  });

  it('falls back to the cached user when the session exists but the profile fetch fails', async () => {
    expect(
      await resolveStartupUser(
        deps({ loadSessionUser: async () => ({ hasSession: true, user: null }) })
      )
    ).toEqual({ isLoggedIn: true, user: cached });
  });

  it('is logged out when there is no session online', async () => {
    expect(
      await resolveStartupUser(
        deps({ loadSessionUser: async () => ({ hasSession: false, user: null }) })
      )
    ).toEqual({ isLoggedIn: false, user: null });
  });
});
