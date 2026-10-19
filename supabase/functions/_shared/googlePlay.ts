// Google Play Developer API 클라이언트: 서비스 계정 JWT로 OAuth 토큰을 얻고
// 구매 조회/소비, 환불, 무효화 구매 목록 조회를 수행한다.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 fetch/WebCrypto 전역만 사용한다.

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export interface ProductPurchase {
  purchaseState: number;
  consumptionState: number;
  acknowledgementState: number;
  purchaseTimeMillis: string;
  orderId?: string;
  obfuscatedExternalAccountId?: string;
  productId?: string;
}

export interface VoidedPurchase {
  purchaseToken: string;
  orderId: string;
  voidedTimeMillis: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ANDROID_PUBLISHER_BASE =
  'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const OAUTH_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const JWT_LIFETIME_SECONDS = 3600;
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const jsonToBase64Url = (value: unknown): string =>
  toBase64Url(new TextEncoder().encode(JSON.stringify(value)));

// PKCS8 PEM(service account JSON의 private_key) 문자열을 WebCrypto가 받는 ArrayBuffer로 변환
const pemToArrayBuffer = (pem: string): ArrayBuffer => {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const importPrivateKey = (privateKeyPem: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

// RS256으로 서명된 JWT assertion을 만든다 (OAuth 2.0 서비스 계정 흐름)
const createAssertion = async (sa: ServiceAccount): Promise<string> => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: OAUTH_SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + JWT_LIFETIME_SECONDS,
  };
  const signingInput = `${jsonToBase64Url(header)}.${jsonToBase64Url(payload)}`;

  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
};

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
}

const fetchAccessToken = async (
  sa: ServiceAccount,
  fetchFn: typeof fetch
): Promise<CachedToken> => {
  const assertion = await createAssertion(sa);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Google Play API error ${res.status} at getAccessToken`);
  }

  const data = (await res.json()) as AccessTokenResponse;
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - TOKEN_EXPIRY_BUFFER_MS,
  };
};

const buildUrl = (packageName: string, path: string): string =>
  `${ANDROID_PUBLISHER_BASE}/${encodeURIComponent(packageName)}${path}`;

interface VoidedPurchasesResponse {
  voidedPurchases?: VoidedPurchase[];
  tokenPagination?: { nextPageToken?: string };
}

export function createGooglePlayClient(
  sa: ServiceAccount,
  packageName: string,
  fetchFn: typeof fetch = fetch
) {
  let cached: CachedToken | null = null;

  const getAccessToken = async (): Promise<string> => {
    if (cached && Date.now() < cached.expiresAt) return cached.accessToken;
    cached = await fetchAccessToken(sa, fetchFn);
    return cached.accessToken;
  };

  // endpointName은 에러 메시지에만 쓰인다. 토큰/키는 절대 에러 메시지에 담지 않는다
  const call = async (endpointName: string, method: string, path: string): Promise<Response> => {
    const accessToken = await getAccessToken();
    const res = await fetchFn(buildUrl(packageName, path), {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Google Play API error ${res.status} at ${endpointName}`);
    }
    return res;
  };

  return {
    async getProductPurchase(productId: string, token: string): Promise<ProductPurchase> {
      const res = await call(
        'getProductPurchase',
        'GET',
        `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`
      );
      return (await res.json()) as ProductPurchase;
    },

    async consumeProductPurchase(productId: string, token: string): Promise<void> {
      await call(
        'consumeProductPurchase',
        'POST',
        `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:consume`
      );
    },

    async refundOrder(orderId: string): Promise<void> {
      await call(
        'refundOrder',
        'POST',
        `/orders/${encodeURIComponent(orderId)}:refund?revoke=true`
      );
    },

    async listVoidedPurchases(startTimeMillis: number): Promise<VoidedPurchase[]> {
      const results: VoidedPurchase[] = [];
      let pageToken: string | undefined;

      do {
        const query = new URLSearchParams({ startTime: String(startTimeMillis), type: '0' });
        if (pageToken) query.set('token', pageToken);

        const res = await call(
          'listVoidedPurchases',
          'GET',
          `/purchases/voidedpurchases?${query.toString()}`
        );
        const data = (await res.json()) as VoidedPurchasesResponse;

        if (data.voidedPurchases) results.push(...data.voidedPurchases);
        pageToken = data.tokenPagination?.nextPageToken;
      } while (pageToken);

      return results;
    },
  };
}
