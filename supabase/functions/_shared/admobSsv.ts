// AdMob 보상형 광고 서버 측 확인(SSV) 콜백의 서명 검증.
// 서명 대상은 콜백 쿼리 문자열 원문에서 '&signature=' 앞까지이고, 서명은 base64url 인코딩된
// DER 형식 ECDSA P-256 / SHA-256이다. 공개키는 Google이 VERIFIER_KEYS_URL로 배포한다.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 import 없이 전역 fetch·crypto.subtle·atob만 쓴다.

export const VERIFIER_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const DEFAULT_KEY_TTL_MS = 24 * 60 * 60 * 1000;

export interface SsvKey {
  keyId: number;
  pem: string;
}

export interface SsvParams {
  adUnit: string;
  rewardAmount: number;
  rewardItem: string;
  transactionId: string;
  userId: string | null;
  keyId: number;
  signature: string;
}

// signature와 key_id는 항상 쿼리 맨 끝에 오므로, 그 앞 원문이 서명 대상 메시지다.
export const parseSsvQuery = (
  rawQuery: string
): { params: SsvParams; signedMessage: string } | null => {
  const query = rawQuery.startsWith('?') ? rawQuery.slice(1) : rawQuery;
  const signatureIndex = query.indexOf('&signature=');
  if (signatureIndex <= 0) return null;

  const signedMessage = query.slice(0, signatureIndex);
  const search = new URLSearchParams(query);
  const signature = search.get('signature');
  const keyIdText = search.get('key_id');
  if (!signature || !keyIdText || !/^\d+$/.test(keyIdText)) return null;

  const rewardAmount = Number(search.get('reward_amount'));
  return {
    signedMessage,
    params: {
      adUnit: search.get('ad_unit') ?? '',
      rewardAmount: Number.isInteger(rewardAmount) ? rewardAmount : 0,
      rewardItem: search.get('reward_item') ?? '',
      transactionId: search.get('transaction_id') ?? '',
      userId: search.get('user_id') || null,
      keyId: Number(keyIdText),
      signature,
    },
  };
};

// DER SEQUENCE { INTEGER r, INTEGER s } → WebCrypto가 받는 raw r||s (각 32바이트)
export const derToRawEcdsa = (der: Uint8Array): Uint8Array => {
  let offset = 0;
  const readLength = () => {
    const first = der[offset++];
    if (first === undefined) throw new Error('DER 길이 누락');
    if (first < 0x80) return first;
    const byteCount = first & 0x7f;
    if (byteCount === 0 || byteCount > 2) throw new Error('지원하지 않는 DER 길이');
    let length = 0;
    for (let i = 0; i < byteCount; i++) {
      const byte = der[offset++];
      if (byte === undefined) throw new Error('DER 길이 누락');
      length = (length << 8) | byte;
    }
    return length;
  };
  const readInteger = () => {
    if (der[offset++] !== 0x02) throw new Error('DER INTEGER가 아님');
    const length = readLength();
    if (length === 0 || offset + length > der.length) throw new Error('DER INTEGER 길이 오류');
    let value = der.slice(offset, offset + length);
    offset += length;
    while (value.length > 1 && value[0] === 0) value = value.slice(1);
    if (value.length > 32) throw new Error('ECDSA 값이 32바이트를 넘음');
    const padded = new Uint8Array(32);
    padded.set(value, 32 - value.length);
    return padded;
  };

  if (der[offset++] !== 0x30) throw new Error('DER SEQUENCE가 아님');
  const sequenceLength = readLength();
  if (offset + sequenceLength !== der.length) throw new Error('DER SEQUENCE 길이 오류');
  const r = readInteger();
  const s = readInteger();
  if (offset !== der.length) throw new Error('DER 뒤에 남는 바이트');

  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
};

const base64ToBytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const base64UrlToBytes = (base64Url: string) => {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  return base64ToBytes(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
};

const importPem = (pem: string) =>
  crypto.subtle.importKey(
    'spki',
    base64ToBytes(pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '')),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );

// 서명이 key_id의 공개키로 검증되면 params, 아니면(형식 오류 포함) null
export const verifySsv = async (rawQuery: string, keys: SsvKey[]): Promise<SsvParams | null> => {
  const parsed = parseSsvQuery(rawQuery);
  if (!parsed) return null;

  const key = keys.find((candidate) => candidate.keyId === parsed.params.keyId);
  if (!key) return null;

  try {
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      await importPem(key.pem),
      derToRawEcdsa(base64UrlToBytes(parsed.params.signature)),
      new TextEncoder().encode(parsed.signedMessage)
    );
    return valid ? parsed.params : null;
  } catch {
    return null;
  }
};

// Google 공개키 목록을 메모리에 캐시한다. forceRefresh는 캐시에 없는 key_id(키 교체)를 만났을 때 쓴다.
export const createKeyFetcher = (
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ttlMs: number = DEFAULT_KEY_TTL_MS
): ((forceRefresh?: boolean) => Promise<SsvKey[]>) => {
  let cached: { keys: SsvKey[]; fetchedAt: number } | null = null;

  return async (forceRefresh = false) => {
    if (cached && !forceRefresh && Date.now() - cached.fetchedAt < ttlMs) return cached.keys;

    const response = await fetchFn(VERIFIER_KEYS_URL);
    if (!response.ok) throw new Error(`AdMob 공개키 조회 실패: ${response.status}`);
    const body = (await response.json()) as { keys?: { keyId?: unknown; pem?: unknown }[] };
    const keys = (body.keys ?? [])
      .filter(
        (key): key is { keyId: number; pem: string } =>
          typeof key.keyId === 'number' && typeof key.pem === 'string'
      )
      .map(({ keyId, pem }) => ({ keyId, pem }));
    if (keys.length === 0) throw new Error('AdMob 공개키가 비어 있음');

    cached = { keys, fetchedAt: Date.now() };
    return keys;
  };
};
