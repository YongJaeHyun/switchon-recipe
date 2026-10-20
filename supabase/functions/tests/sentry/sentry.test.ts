import { describe, expect, it, vi } from 'vitest';
import {
  buildIssue,
  exceedsBodyLimit,
  makeSignatureVerifier,
  MAX_BODY_BYTES,
  isProductionEvent,
  type SentryEvent,
  verifySentrySignature,
} from '../../_shared/sentry.ts';

const SECRET = 'test-client-secret';

const sign = async (body: string, secret = SECRET) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const frame = (n: number, inApp: boolean) => ({
  filename: `file${n}.js`,
  function: `fn${n}`,
  lineno: n,
  in_app: inApp,
});

const baseEvent = (overrides: Partial<SentryEvent> = {}): SentryEvent => ({
  title: "TypeError: Cannot read property 'id' of undefined",
  culprit: 'app/(tabs)/index.tsx in RecipeList',
  issue_id: '1117540176',
  web_url: 'https://sentry.io/organizations/switchon/issues/1117540176/events/abc123/',
  issue_url: 'https://sentry.io/api/0/issues/1117540176/',
  environment: 'production',
  release: 'com.switchon.recipe@1.4.0+42',
  level: 'error',
  platform: 'javascript',
  datetime: '2026-10-20T01:02:03.000000Z',
  tags: [
    ['os', 'Android 14'],
    ['device', 'SM-S918N'],
    ['app.version', '1.4.0'],
    ['handled', 'no'],
  ],
  exception: {
    values: [
      {
        type: 'TypeError',
        value: "Cannot read property 'id' of undefined",
        stacktrace: { frames: [frame(1, false), frame(2, true), frame(3, true)] },
      },
    ],
  },
  ...overrides,
});

describe('verifySentrySignature', () => {
  const body = JSON.stringify({ action: 'triggered', data: {} });

  it('accepts a valid signature', async () => {
    expect(await verifySentrySignature(body, await sign(body), SECRET)).toBe(true);
  });

  it('rejects a tampered body', async () => {
    const signature = await sign(body);
    expect(await verifySentrySignature(body + ' ', signature, SECRET)).toBe(false);
  });

  it('rejects a signature made with another secret', async () => {
    expect(await verifySentrySignature(body, await sign(body, 'other'), SECRET)).toBe(false);
  });

  it('rejects a missing header', async () => {
    expect(await verifySentrySignature(body, null, SECRET)).toBe(false);
    expect(await verifySentrySignature(body, '', SECRET)).toBe(false);
  });

  it('rejects when the secret is empty', async () => {
    expect(await verifySentrySignature(body, 'a'.repeat(64), '')).toBe(false);
  });
});

describe('isProductionEvent', () => {
  it('treats production and missing environment as production', () => {
    expect(isProductionEvent(baseEvent())).toBe(true);
    expect(isProductionEvent(baseEvent({ environment: undefined }))).toBe(true);
    expect(isProductionEvent(baseEvent({ environment: null }))).toBe(true);
  });

  it('rejects other environments', () => {
    expect(isProductionEvent(baseEvent({ environment: 'development' }))).toBe(false);
    expect(isProductionEvent(baseEvent({ environment: 'staging' }))).toBe(false);
  });
});

describe('buildIssue', () => {
  it('prefixes and truncates the title to 200 chars', () => {
    const { title } = buildIssue(baseEvent({ title: 'x'.repeat(500) }));
    expect(title.startsWith('[Sentry] x')).toBe(true);
    expect(title.length).toBe(200);
  });

  it('keeps short titles intact', () => {
    expect(buildIssue(baseEvent({ title: 'Boom' })).title).toBe('[Sentry] Boom');
  });

  it('falls back when the title is missing', () => {
    expect(buildIssue(baseEvent({ title: undefined })).title).toBe('[Sentry] (제목 없음)');
  });

  it('includes links, metadata, culprit, exception and selected tags', () => {
    const { body } = buildIssue(baseEvent());
    expect(body).toContain('https://sentry.io/organizations/switchon/issues/1117540176/');
    expect(body).toContain(
      'https://sentry.io/organizations/switchon/issues/1117540176/events/abc123/'
    );
    expect(body).toContain('production');
    expect(body).toContain('com.switchon.recipe@1.4.0+42');
    expect(body).toContain('error');
    expect(body).toContain('javascript');
    expect(body).toContain('2026-10-20T01:02:03.000000Z');
    expect(body).toContain('app/(tabs)/index.tsx in RecipeList');
    expect(body).toContain("TypeError: Cannot read property 'id' of undefined");
    expect(body).toContain('Android 14');
    expect(body).toContain('SM-S918N');
    expect(body).toContain('1.4.0');
    expect(body).not.toContain('handled');
  });

  it('shows only in-app frames, newest first, at most 10', () => {
    const frames = [...Array.from({ length: 15 }, (_, i) => frame(i + 1, true)), frame(99, false)];
    const { body } = buildIssue(
      baseEvent({
        exception: { values: [{ type: 'E', value: 'v', stacktrace: { frames } }] },
      })
    );
    // Sentry 프레임은 오래된 것 → 최신 순. 최신(15)부터 10개
    expect(body).toContain('fn15');
    expect(body).toContain('fn6');
    expect(body).not.toContain('fn5 ');
    expect(body).not.toMatch(/fn5\b/);
    expect(body).not.toContain('fn99');
  });

  it('falls back to all frames when none are in-app', () => {
    const frames = Array.from({ length: 12 }, (_, i) => frame(i + 1, false));
    const { body } = buildIssue(
      baseEvent({
        exception: { values: [{ type: 'E', value: 'v', stacktrace: { frames } }] },
      })
    );
    expect(body).toContain('fn12');
    expect(body).toContain('fn3');
    expect(body).not.toMatch(/fn2\b/);
  });

  it('survives an event with almost no fields', () => {
    const { title, body } = buildIssue({});
    expect(title).toBe('[Sentry] (제목 없음)');
    expect(typeof body).toBe('string');
  });

  it('strips user PII: user tags, emails and IP addresses', () => {
    const { body } = buildIssue(
      baseEvent({
        title: 'Failed for kim@example.com from 192.168.0.12',
        culprit: 'login 10.0.0.1',
        tags: [
          ['os', 'iOS 18'],
          ['device', 'iPhone16,1'],
          ['app.version', '1.4.0'],
          ['user', 'email:kim@example.com'],
          ['user.email', 'kim@example.com'],
        ],
        exception: {
          values: [
            {
              type: 'Error',
              value: 'bad user lee@test.co.kr at 2001:db8::1 and 203.0.113.7',
              stacktrace: { frames: [frame(1, true)] },
            },
          ],
        },
        user: { email: 'kim@example.com', ip_address: '203.0.113.7', id: 'u1' },
      } as Partial<SentryEvent>)
    );
    const all = buildIssue(baseEvent()).title + body;
    expect(all).not.toContain('kim@example.com');
    expect(body).not.toContain('kim@example.com');
    expect(body).not.toContain('lee@test.co.kr');
    expect(body).not.toContain('192.168.0.12');
    expect(body).not.toContain('10.0.0.1');
    expect(body).not.toContain('203.0.113.7');
    expect(body).not.toContain('2001:db8::1');
    expect(body).not.toContain('email:');
    expect(body).toContain('iOS 18');
  });

  it('strips PII from the title too', () => {
    const { title } = buildIssue(baseEvent({ title: 'Failed for kim@example.com 1.2.3.4' }));
    expect(title).not.toContain('kim@example.com');
    expect(title).not.toContain('1.2.3.4');
  });

  it('caps the body at 60k characters', () => {
    const { body } = buildIssue(
      baseEvent({
        exception: { values: [{ type: 'E', value: 'v'.repeat(200_000) }] },
      })
    );
    expect(body.length).toBeLessThanOrEqual(60_000);
  });
});

describe('isProductionEvent with environment tag fallback', () => {
  it('skips when top-level environment is missing but the tag says development', () => {
    expect(
      isProductionEvent(
        baseEvent({ environment: undefined, tags: [['environment', 'development']] })
      )
    ).toBe(false);
  });

  it('uses the tag when top-level is missing and the tag says production', () => {
    expect(
      isProductionEvent(baseEvent({ environment: null, tags: [['environment', 'production']] }))
    ).toBe(true);
  });

  it('prefers the top-level value over the tag', () => {
    expect(
      isProductionEvent(
        baseEvent({ environment: 'production', tags: [['environment', 'development']] })
      )
    ).toBe(true);
  });

  it('treats the event as production only when both are missing', () => {
    expect(isProductionEvent(baseEvent({ environment: undefined, tags: [] }))).toBe(true);
  });

  it('shows the tag environment in the body', () => {
    const { body } = buildIssue(
      baseEvent({ environment: undefined, tags: [['environment', 'production']] })
    );
    expect(body).toMatch(/\| 환경 \| production \|/);
  });
});

describe('buildIssue body safety', () => {
  const fenceBlocks = (body: string) => {
    // 여는 펜스와 같은 길이의 닫는 펜스까지를 한 블록으로 본다 (GitHub/CommonMark 규칙)
    const blocks: { fence: string; content: string[] }[] = [];
    let open: { fence: string; content: string[] } | null = null;
    for (const line of body.split('\n')) {
      const m = line.match(/^(`{3,})\s*$/);
      if (open) {
        if (m && m[1].length >= open.fence.length) {
          blocks.push(open);
          open = null;
        } else open.content.push(line);
      } else if (m) open = { fence: m[1], content: [] };
    }
    expect(open).toBeNull();
    return blocks;
  };

  it('keeps an exception value containing ``` inside its fence', () => {
    const value = 'bad\n```\n## injected heading\n````` more';
    const { body } = buildIssue(
      baseEvent({ exception: { values: [{ type: 'Error', value, stacktrace: { frames: [] } }] } })
    );
    const blocks = fenceBlocks(body);
    const exceptionBlock = blocks.find((b) => b.content.join('\n').includes('injected'));
    expect(exceptionBlock).toBeDefined();
    expect(exceptionBlock!.content.join('\n')).toBe(`Error: ${value}`);
    expect(exceptionBlock!.fence.length).toBe(6);
  });

  it('uses a 3-backtick fence when the content has no backticks', () => {
    const { body } = buildIssue(baseEvent());
    expect(fenceBlocks(body).every((b) => b.fence === '```')).toBe(true);
  });

  it('neutralizes @mentions', () => {
    const { body } = buildIssue(
      baseEvent({
        title: 'ping @octocat',
        culprit: 'from @octocat',
        exception: { values: [{ type: 'Error', value: 'hi @octocat and @org/team' }] },
      })
    );
    expect(body).not.toMatch(/(^|[^\w])@octocat/);
    expect(body).not.toMatch(/(^|[^\w])@org\/team/);
    expect(body).toContain('@​octocat');
  });

  it('leaves non-mention @ such as release names alone', () => {
    expect(buildIssue(baseEvent()).body).toContain('com.switchon.recipe@1.4.0+42');
  });

  it('escapes | in table cells', () => {
    const { body } = buildIssue(baseEvent({ release: 'a|b', platform: 'x\ny' }));
    expect(body).toContain('| 릴리즈 | a\\|b |');
    expect(body).toContain('| 플랫폼 | x y |');
  });

  it('labels the datetime as 발생 시각', () => {
    const { body } = buildIssue(baseEvent());
    expect(body).toContain('| 발생 시각 | 2026-10-20T01:02:03.000000Z |');
    expect(body).not.toContain('최초 발생');
  });
});

describe('exceedsBodyLimit', () => {
  it('rejects a content-length over 1MB', () => {
    expect(MAX_BODY_BYTES).toBe(1024 * 1024);
    expect(exceedsBodyLimit(String(MAX_BODY_BYTES + 1))).toBe(true);
  });

  it('allows up to 1MB and a missing or invalid header', () => {
    expect(exceedsBodyLimit(String(MAX_BODY_BYTES))).toBe(false);
    expect(exceedsBodyLimit('1234')).toBe(false);
    expect(exceedsBodyLimit(null)).toBe(false);
    expect(exceedsBodyLimit('abc')).toBe(false);
  });
});

describe('makeSignatureVerifier', () => {
  const body = '{"a":1}';

  it('logs once per instance when the secret is unset and still rejects', async () => {
    const logError = vi.fn();
    const verify = makeSignatureVerifier(() => undefined, logError);
    expect(await verify(body, await sign(body))).toBe(false);
    expect(await verify(body, await sign(body))).toBe(false);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith('SENTRY_CLIENT_SECRET not set');
  });

  it('verifies with the secret and does not log', async () => {
    const logError = vi.fn();
    const verify = makeSignatureVerifier(() => SECRET, logError);
    expect(await verify(body, await sign(body))).toBe(true);
    expect(await verify(body, 'bad')).toBe(false);
    expect(logError).not.toHaveBeenCalled();
  });
});
