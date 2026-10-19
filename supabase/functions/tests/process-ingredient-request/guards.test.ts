import { describe, expect, it } from 'vitest';
import {
  DeadlineExceededError,
  isBlockedByPriorRequests,
  isServiceRoleRequest,
  withDeadline,
} from '../../process-ingredient-request/core.ts';

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

describe('isBlockedByPriorRequests', () => {
  const now = new Date('2026-10-19T12:00:00Z');
  const self = { id: 10, status: 'pending', created_at: '2026-10-19T12:00:00Z' };
  const other = (id: number, status: string, created_at = '2026-10-19T11:59:00Z') => ({
    id,
    status,
    created_at,
  });

  it('blocks when the name was already added or rejected', () => {
    expect(isBlockedByPriorRequests(self, [other(1, 'added')], now)).toBe(true);
    expect(isBlockedByPriorRequests(self, [other(1, 'rejected')], now)).toBe(true);
  });

  it('does not block on earlier duplicate or failed requests', () => {
    expect(isBlockedByPriorRequests(self, [other(1, 'duplicate'), other(2, 'failed')], now)).toBe(
      false
    );
  });

  it('blocks when an earlier request is still being processed', () => {
    expect(isBlockedByPriorRequests(self, [other(9, 'pending')], now)).toBe(true);
  });

  it('ignores a later pending request', () => {
    expect(isBlockedByPriorRequests(self, [other(11, 'pending')], now)).toBe(false);
  });

  it('ignores a pending request stuck for more than 10 minutes', () => {
    expect(isBlockedByPriorRequests(self, [other(9, 'pending', '2026-10-19T11:49:00Z')], now)).toBe(
      false
    );
  });
});

describe('withDeadline', () => {
  it('resolves when the work finishes in time', async () => {
    expect(await withDeadline(Promise.resolve('ok'), 50)).toBe('ok');
  });

  it('rejects with DeadlineExceededError when the work is too slow', async () => {
    await expect(withDeadline(new Promise(() => {}), 10)).rejects.toThrow(DeadlineExceededError);
  });
});
