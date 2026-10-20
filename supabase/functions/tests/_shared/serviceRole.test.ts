import { describe, expect, it } from 'vitest';
import { isServiceRoleRequest } from '../../_shared/serviceRole.ts';

const jwt = (payload: object) =>
  ['header', btoa(JSON.stringify(payload)).replace(/=+$/, ''), 'signature'].join('.');

describe('isServiceRoleRequest', () => {
  it('accepts a service_role JWT', () => {
    expect(isServiceRoleRequest(`Bearer ${jwt({ role: 'service_role' })}`)).toBe(true);
  });

  it('rejects the anon key and user tokens', () => {
    expect(isServiceRoleRequest(`Bearer ${jwt({ role: 'anon' })}`)).toBe(false);
    expect(isServiceRoleRequest(`Bearer ${jwt({ role: 'authenticated' })}`)).toBe(false);
  });

  it('rejects missing or malformed headers', () => {
    expect(isServiceRoleRequest(null)).toBe(false);
    expect(isServiceRoleRequest('Bearer not-a-jwt')).toBe(false);
  });
});
