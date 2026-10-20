import { describe, expect, it, vi } from 'vitest';
import {
  assertPremium,
  PremiumRequiredError,
  premiumRequiredResponse,
  type PremiumCheckClient,
} from '../../_shared/premium.ts';

const UID = 'user-1';

const fakeClient = (result: { data?: unknown; error?: unknown }): PremiumCheckClient => ({
  rpc: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })),
});

describe('assertPremium', () => {
  it('has_premium_access_for가 true면 정상 resolve하고 uid를 그대로 넘긴다', async () => {
    const client = fakeClient({ data: true });

    await expect(assertPremium(client, UID)).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledWith('has_premium_access_for', { p_uid: UID });
  });

  it('has_premium_access_for가 false면 PremiumRequiredError를 던진다', async () => {
    const client = fakeClient({ data: false });

    await expect(assertPremium(client, UID)).rejects.toBeInstanceOf(PremiumRequiredError);
  });

  it('rpc 자체가 에러를 반환하면 접근 불가로 뭉개지 않고 그대로 다시 던진다', async () => {
    const rpcError = new Error('network down');
    const client = fakeClient({ error: rpcError });

    await expect(assertPremium(client, UID)).rejects.toBe(rpcError);
    await expect(assertPremium(client, UID)).rejects.not.toBeInstanceOf(PremiumRequiredError);
  });
});

describe('premiumRequiredResponse', () => {
  it('PremiumRequiredError를 402 JSON 응답으로 변환한다', async () => {
    const error = new PremiumRequiredError('패스가 필요한 기능입니다.');
    const response = premiumRequiredResponse(error);

    expect(response.status).toBe(402);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    await expect(response.json()).resolves.toEqual({ error: '패스가 필요한 기능입니다.' });
  });
});
