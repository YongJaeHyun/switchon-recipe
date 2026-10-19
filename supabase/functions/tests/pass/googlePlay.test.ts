import { describe, expect, it, vi } from 'vitest';
import {
  createGooglePlayClient,
  parseServiceAccount,
  type ServiceAccount,
  type VoidedPurchase,
} from '../../_shared/googlePlay.ts';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PACKAGE_NAME = 'kr.customparts.switchon';
const androidPublisherUrl = (path: string) =>
  `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}${path}`;

const base64UrlToBytes = (b64url: string): Uint8Array => {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return new Uint8Array(Buffer.from(padded, 'base64'));
};

const decodeJwtPayload = (jwt: string): Record<string, unknown> => {
  const [, payloadB64] = jwt.split('.');
  return JSON.parse(Buffer.from(base64UrlToBytes(payloadB64)).toString('utf8'));
};

const toPem = (base64: string): string => {
  const lines = base64.match(/.{1,64}/g) ?? [base64];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
};

const generateServiceAccount = async (): Promise<{
  sa: ServiceAccount;
  publicKey: CryptoKey;
}> => {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey);
  const pem = toPem(Buffer.from(pkcs8).toString('base64'));
  return {
    sa: { client_email: 'svc@example.iam.gserviceaccount.com', private_key: pem },
    publicKey,
  };
};

const verifyJwtSignature = async (jwt: string, publicKey: CryptoKey): Promise<boolean> => {
  const [headerB64, payloadB64, signatureB64] = jwt.split('.');
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToBytes(signatureB64);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, signingInput);
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createGooglePlayClient', () => {
  it('requests an access token with a signed JWT assertion', async () => {
    const { sa, publicKey } = await generateServiceAccount();
    let capturedAssertion = '';
    let capturedGrantType = '';

    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url) !== TOKEN_URL) {
        return jsonResponse({
          purchaseState: 0,
          consumptionState: 0,
          acknowledgementState: 0,
          purchaseTimeMillis: '1700000000000',
        });
      }
      const params = new URLSearchParams(String(init?.body));
      capturedGrantType = params.get('grant_type') ?? '';
      capturedAssertion = params.get('assertion') ?? '';
      return jsonResponse({ access_token: 'token-abc', expires_in: 3600 });
    }) as unknown as typeof fetch;

    const client = createGooglePlayClient(sa, PACKAGE_NAME, fetchFn);
    await client.getProductPurchase('switchon_pass_5w_1900', 'purchase-token-1');

    expect(capturedGrantType).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(capturedAssertion).not.toBe('');

    const payload = decodeJwtPayload(capturedAssertion);
    expect(payload.iss).toBe(sa.client_email);
    expect(payload.scope).toBe('https://www.googleapis.com/auth/androidpublisher');
    expect(payload.aud).toBe(TOKEN_URL);
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');

    await expect(verifyJwtSignature(capturedAssertion, publicKey)).resolves.toBe(true);
  });

  it('reuses the cached access token', async () => {
    const { sa } = await generateServiceAccount();
    let tokenRequests = 0;

    const fetchFn = vi.fn(async (url: string | URL) => {
      if (String(url) === TOKEN_URL) {
        tokenRequests += 1;
        return jsonResponse({ access_token: 'token-abc', expires_in: 3600 });
      }
      return jsonResponse({
        purchaseState: 0,
        consumptionState: 0,
        acknowledgementState: 0,
        purchaseTimeMillis: '1700000000000',
      });
    }) as unknown as typeof fetch;

    const client = createGooglePlayClient(sa, PACKAGE_NAME, fetchFn);
    await client.getProductPurchase('p1', 't1');
    await client.getProductPurchase('p1', 't2');

    expect(tokenRequests).toBe(1);
  });

  it('calls the product purchase endpoint with the bearer token', async () => {
    const { sa } = await generateServiceAccount();

    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url) === TOKEN_URL) {
        return jsonResponse({ access_token: 'token-abc', expires_in: 3600 });
      }
      expect(String(url)).toBe(
        androidPublisherUrl('/purchases/products/switchon_pass_5w_1900/tokens/purchase-token-1')
      );
      expect((init?.headers as Record<string, string>)?.Authorization).toBe('Bearer token-abc');
      return jsonResponse({
        purchaseState: 0,
        consumptionState: 0,
        acknowledgementState: 0,
        purchaseTimeMillis: '1700000000000',
        orderId: 'order-1',
      });
    }) as unknown as typeof fetch;

    const client = createGooglePlayClient(sa, PACKAGE_NAME, fetchFn);
    const purchase = await client.getProductPurchase('switchon_pass_5w_1900', 'purchase-token-1');

    expect(purchase.orderId).toBe('order-1');
  });

  it('consume posts to :consume', async () => {
    const { sa } = await generateServiceAccount();
    const calls: { url: string; method: string }[] = [];

    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url) === TOKEN_URL) {
        return jsonResponse({ access_token: 'token-abc', expires_in: 3600 });
      }
      calls.push({ url: String(url), method: init?.method ?? 'GET' });
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const client = createGooglePlayClient(sa, PACKAGE_NAME, fetchFn);
    await client.consumeProductPurchase('switchon_pass_5w_1900', 'purchase-token-1');

    expect(calls).toEqual([
      {
        url: androidPublisherUrl(
          '/purchases/products/switchon_pass_5w_1900/tokens/purchase-token-1:consume'
        ),
        method: 'POST',
      },
    ]);
  });

  it('refund posts to orders/{orderId}:refund?revoke=true', async () => {
    const { sa } = await generateServiceAccount();
    const calls: { url: string; method: string }[] = [];

    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url) === TOKEN_URL) {
        return jsonResponse({ access_token: 'token-abc', expires_in: 3600 });
      }
      calls.push({ url: String(url), method: init?.method ?? 'GET' });
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const client = createGooglePlayClient(sa, PACKAGE_NAME, fetchFn);
    await client.refundOrder('order-1');

    expect(calls).toEqual([
      {
        url: androidPublisherUrl('/orders/order-1:refund?revoke=true'),
        method: 'POST',
      },
    ]);
  });

  it('listVoidedPurchases follows nextPageToken', async () => {
    const { sa } = await generateServiceAccount();
    const requestedUrls: string[] = [];

    const page1: VoidedPurchase[] = [
      { purchaseToken: 'tok-1', orderId: 'order-1', voidedTimeMillis: '1700000000000' },
    ];
    const page2: VoidedPurchase[] = [
      { purchaseToken: 'tok-2', orderId: 'order-2', voidedTimeMillis: '1700000001000' },
    ];

    const fetchFn = vi.fn(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr === TOKEN_URL) {
        return jsonResponse({ access_token: 'token-abc', expires_in: 3600 });
      }
      requestedUrls.push(urlStr);
      if (!urlStr.includes('token=')) {
        return jsonResponse({
          voidedPurchases: page1,
          tokenPagination: { nextPageToken: 'next-1' },
        });
      }
      return jsonResponse({ voidedPurchases: page2 });
    }) as unknown as typeof fetch;

    const client = createGooglePlayClient(sa, PACKAGE_NAME, fetchFn);
    const result = await client.listVoidedPurchases(1700000000000);

    expect(result).toEqual([...page1, ...page2]);
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[0]).toContain('startTime=1700000000000');
    expect(requestedUrls[0]).toContain('type=0');
    expect(requestedUrls[1]).toContain('token=next-1');
  });

  it('throws with status on non-2xx', async () => {
    const { sa } = await generateServiceAccount();

    const fetchFn = vi.fn(async (url: string | URL) => {
      if (String(url) === TOKEN_URL) {
        return jsonResponse({ access_token: 'super-secret-access-token', expires_in: 3600 });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const client = createGooglePlayClient(sa, PACKAGE_NAME, fetchFn);

    await expect(client.getProductPurchase('p1', 't1')).rejects.toThrow(/404/);

    try {
      await client.getProductPurchase('p1', 't1');
      throw new Error('expected rejection');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('super-secret-access-token');
      expect(message).not.toContain(sa.private_key);
      expect(message).not.toContain('BEGIN PRIVATE KEY');
    }
  });
});

describe('parseServiceAccount', () => {
  it('JSON이면 서비스 계정을 돌려준다', () => {
    const raw = JSON.stringify({ client_email: 'a@b.iam', private_key: 'KEY' });
    expect(parseServiceAccount(raw)).toEqual({ client_email: 'a@b.iam', private_key: 'KEY' });
  });

  it('JSON이 아니면 시크릿 내용 없이 일반 오류를 던진다', () => {
    const raw = '{"private_key": "-----BEGIN PRIVATE KEY-----super-secret", oops';
    let caught: unknown;
    try {
      parseServiceAccount(raw);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const error = caught as Error;
    expect(error.message).toBe('GOOGLE_PLAY_SERVICE_ACCOUNT is not valid JSON');
    expect(error.cause).toBeUndefined();
    expect(String(error.stack)).not.toContain('super-secret');
  });
});
