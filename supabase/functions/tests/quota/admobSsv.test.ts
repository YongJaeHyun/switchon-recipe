import { describe, expect, it, vi } from 'vitest';
import {
  createKeyFetcher,
  derToRawEcdsa,
  isAllowedAdUnit,
  parseSsvQuery,
  verifySsv,
  type SsvKey,
} from '../../_shared/admobSsv.ts';

const KEY_ID = 3335741209;
const UID = '8f1d2c3b-4a5e-4f60-9a7b-1c2d3e4f5a6b';

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const toBase64Url = (bytes: Uint8Array) =>
  toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// raw r||s(64바이트)를 DER SEQUENCE { INTEGER r, INTEGER s }로 인코딩 (Google 서명 형식)
const derInteger = (value: Uint8Array) => {
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) start++;
  let body = value.slice(start);
  if (body[0] & 0x80) body = Uint8Array.from([0, ...body]);
  return Uint8Array.from([0x02, body.length, ...body]);
};
const rawToDer = (raw: Uint8Array) => {
  const r = derInteger(raw.slice(0, 32));
  const s = derInteger(raw.slice(32));
  return Uint8Array.from([0x30, r.length + s.length, ...r, ...s]);
};

const makeKey = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  const body = toBase64(spki)
    .match(/.{1,64}/g)!
    .join('\n');
  const pem = `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
  return { privateKey: pair.privateKey, key: { keyId: KEY_ID, pem } as SsvKey };
};

const MESSAGE =
  'ad_network=5450213213286189855&ad_unit=1234567890&custom_data=hello%20world' +
  `&reward_amount=1&reward_item=recipe&timestamp=1760950000000&transaction_id=abc123&user_id=${UID}`;

const sign = async (privateKey: CryptoKey, message: string) => {
  const raw = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      new TextEncoder().encode(message)
    )
  );
  return toBase64Url(rawToDer(raw));
};

const signedQuery = async (privateKey: CryptoKey, message = MESSAGE, keyId = KEY_ID) =>
  `${message}&signature=${await sign(privateKey, message)}&key_id=${keyId}`;

describe('parseSsvQuery', () => {
  it('signature 앞까지를 서명 대상 메시지로 잘라내고 값을 매핑한다', () => {
    const parsed = parseSsvQuery(`${MESSAGE}&signature=abc_-&key_id=${KEY_ID}`);
    expect(parsed).toEqual({
      signedMessage: MESSAGE,
      params: {
        adUnit: '1234567890',
        rewardAmount: 1,
        rewardItem: 'recipe',
        transactionId: 'abc123',
        userId: UID,
        keyId: KEY_ID,
        signature: 'abc_-',
      },
    });
  });

  it('user_id가 없으면 userId는 null', () => {
    const parsed = parseSsvQuery(
      'ad_network=1&ad_unit=2&reward_amount=1&reward_item=r&timestamp=1&transaction_id=t&signature=s&key_id=1'
    );
    expect(parsed?.params.userId).toBeNull();
  });

  it('업무 파라미터는 서명 대상 메시지에서만 읽는다', () => {
    expect(parseSsvQuery('ad_unit=2&transaction_id=t&signature=s&key_id=1&user_id=x')).toBeNull();
    expect(parseSsvQuery('ad_unit=2&transaction_id=t&signature=s&user_id=x&key_id=1')).toBeNull();
    expect(parseSsvQuery('ad_unit=2&transaction_id=t&signature=s&key_id=1&')).toBeNull();
  });

  it('signature나 key_id가 없으면 null', () => {
    expect(parseSsvQuery(MESSAGE)).toBeNull();
    expect(parseSsvQuery(`${MESSAGE}&signature=abc`)).toBeNull();
    expect(parseSsvQuery(`${MESSAGE}&key_id=${KEY_ID}`)).toBeNull();
    expect(parseSsvQuery(`${MESSAGE}&signature=abc&key_id=nope`)).toBeNull();
  });
});

describe('verifySsv', () => {
  it('올바른 서명이면 params를 돌려준다', async () => {
    const { privateKey, key } = await makeKey();
    const params = await verifySsv(await signedQuery(privateKey), [key]);
    expect(params).toMatchObject({
      adUnit: '1234567890',
      rewardAmount: 1,
      rewardItem: 'recipe',
      transactionId: 'abc123',
      userId: UID,
      keyId: KEY_ID,
    });
  });

  it('앞에 붙은 ?는 무시한다', async () => {
    const { privateKey, key } = await makeKey();
    expect(await verifySsv(`?${await signedQuery(privateKey)}`, [key])).not.toBeNull();
  });

  it('쿼리 값 하나라도 변조되면 null', async () => {
    const { privateKey, key } = await makeKey();
    const query = await signedQuery(privateKey);
    const tampered = query.replace('reward_amount=1', 'reward_amount=9');
    expect(tampered).not.toBe(query);
    expect(await verifySsv(tampered, [key])).toBeNull();
  });

  it('서명 뒤에 user_id를 덧붙이면 null (서명 범위 밖 파라미터 거부)', async () => {
    const { privateKey, key } = await makeKey();
    const message =
      'ad_network=1&ad_unit=2&reward_amount=1&reward_item=r&timestamp=1&transaction_id=t';
    const query = await signedQuery(privateKey, message);
    expect(await verifySsv(query, [key])).not.toBeNull();
    expect(await verifySsv(`${query}&user_id=${UID}`, [key])).toBeNull();
  });

  it('key_id 뒤에 어떤 파라미터든 붙으면 null', async () => {
    const { privateKey, key } = await makeKey();
    const query = await signedQuery(privateKey);
    expect(await verifySsv(`${query}&foo=bar`, [key])).toBeNull();
    expect(await verifySsv(`${query}&reward_amount=9`, [key])).toBeNull();
  });

  it('모르는 key_id면 null', async () => {
    const { privateKey, key } = await makeKey();
    expect(await verifySsv(await signedQuery(privateKey, MESSAGE, 42), [key])).toBeNull();
  });

  it('다른 키로 서명됐으면 null', async () => {
    const { privateKey } = await makeKey();
    const { key: otherKey } = await makeKey();
    expect(await verifySsv(await signedQuery(privateKey), [otherKey])).toBeNull();
  });

  it('signature/key_id 누락이나 깨진 서명은 null', async () => {
    const { key } = await makeKey();
    expect(await verifySsv(MESSAGE, [key])).toBeNull();
    expect(await verifySsv(`${MESSAGE}&signature=AAAA&key_id=${KEY_ID}`, [key])).toBeNull();
  });
});

describe('derToRawEcdsa', () => {
  it('r/s 앞 0x00 패딩은 떼고 짧은 값은 앞을 0으로 채워 각 32바이트로 맞춘다', () => {
    const r = new Uint8Array(32).fill(0xff); // 최상위 비트가 1 → DER에서 0x00 패딩 붙음
    const s = new Uint8Array(32);
    s[30] = 0x01;
    s[31] = 0x02; // 짧은 값 → DER에서 2바이트
    const der = rawToDer(Uint8Array.from([...r, ...s]));
    expect(der[3]).toBe(33); // r 길이 33 (패딩 포함)

    const raw = derToRawEcdsa(der);
    expect(raw.length).toBe(64);
    expect(Array.from(raw.slice(0, 32))).toEqual(Array.from(r));
    expect(Array.from(raw.slice(32))).toEqual(Array.from(s));
  });

  it('DER 형식이 아니면 예외', () => {
    expect(() => derToRawEcdsa(Uint8Array.from([1, 2, 3]))).toThrow();
  });
});

describe('createKeyFetcher', () => {
  const keysResponse = () =>
    new Response(JSON.stringify({ keys: [{ keyId: KEY_ID, pem: 'PEM', base64: 'B64' }] }), {
      status: 200,
    });

  it('키를 받아서 캐시하고 두 번째 호출엔 fetch하지 않는다', async () => {
    const fetchFn = vi.fn(async () => keysResponse());
    const getKeys = createKeyFetcher(fetchFn as unknown as typeof fetch);

    expect(await getKeys()).toEqual([{ keyId: KEY_ID, pem: 'PEM' }]);
    expect(await getKeys()).toEqual([{ keyId: KEY_ID, pem: 'PEM' }]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith('https://www.gstatic.com/admob/reward/verifier-keys.json');
  });

  it('TTL이 지나면 다시 받는다', async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn(async () => keysResponse());
      const getKeys = createKeyFetcher(fetchFn as unknown as typeof fetch, 1000);
      await getKeys();
      vi.advanceTimersByTime(1001);
      await getKeys();
      expect(fetchFn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('forceRefresh면 최소 간격이 지난 뒤에만 다시 받는다', async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn(async () => keysResponse());
      const getKeys = createKeyFetcher(fetchFn as unknown as typeof fetch);
      await getKeys();
      await getKeys(true); // 60초 안 → 캐시
      expect(fetchFn).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(60_001);
      await getKeys(true);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('강제 갱신 최소 간격은 인자로 바꿀 수 있다', async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn(async () => keysResponse());
      const getKeys = createKeyFetcher(fetchFn as unknown as typeof fetch, 24 * 3600_000, 1000);
      await getKeys();
      vi.advanceTimersByTime(999);
      await getKeys(true);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(2);
      await getKeys(true);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('캐시가 없으면 forceRefresh도 바로 받는다', async () => {
    const fetchFn = vi.fn(async () => keysResponse());
    const getKeys = createKeyFetcher(fetchFn as unknown as typeof fetch);
    await getKeys(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('응답이 실패면 예외', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 503 }));
    const getKeys = createKeyFetcher(fetchFn as unknown as typeof fetch);
    await expect(getKeys()).rejects.toThrow();
  });
});

describe('isAllowedAdUnit', () => {
  it('목록에 있으면 true', () => {
    expect(isAllowedAdUnit('5224354917', '5224354917')).toBe(true);
    expect(isAllowedAdUnit('222', '111,222')).toBe(true);
  });

  it('목록에 없으면 false', () => {
    expect(isAllowedAdUnit('333', '111,222')).toBe(false);
    expect(isAllowedAdUnit('', '111,222')).toBe(false);
  });

  it('env가 없거나 비어 있으면 false (fail closed)', () => {
    expect(isAllowedAdUnit('111', undefined)).toBe(false);
    expect(isAllowedAdUnit('111', '')).toBe(false);
    expect(isAllowedAdUnit('', ' , ')).toBe(false);
  });

  it('목록의 공백은 무시한다', () => {
    expect(isAllowedAdUnit('222', ' 111 , 222 ')).toBe(true);
    expect(isAllowedAdUnit('111', '111 ,\n222')).toBe(true);
  });
});
