import { describe, expect, it, vi } from 'vitest';
import {
  handleSentryWebhook,
  LEASE_MS,
  MAX_ATTEMPTS,
  type PendingLink,
  type SentryLinkStore,
  type SentryWebhookDeps,
} from '../../sentry-to-github/handler.ts';

const alertBody = (event: Record<string, unknown>) =>
  JSON.stringify({
    action: 'triggered',
    data: { event, triggered_rule: 'New production issue' },
  });

const prodEvent = {
  title: 'TypeError: boom',
  issue_id: '42',
  web_url: 'https://sentry.io/organizations/o/issues/42/events/e1/',
  environment: 'production',
};

interface Row {
  attempts: number;
  attemptedAt: number;
  createdAt: number;
  payload: { title: string; body: string };
  number: number | null;
  lastError: string | null;
}

// sentry_github_link 테이블을 흉내 내는 메모리 저장소 (index.ts의 쿼리와 같은 조건)
const memoryStore = (clock: { now: number }) => {
  const rows = new Map<string, Row>();
  let seq = 0;
  const store: SentryLinkStore = {
    claim: vi.fn(async (id, payload) => {
      if (rows.has(id)) return false;
      rows.set(id, {
        attempts: 1,
        attemptedAt: clock.now,
        createdAt: seq++,
        payload,
        number: null,
        lastError: null,
      });
      return true;
    }),
    listPending: vi.fn(async (limit, maxAttempts, staleBefore) =>
      [...rows.entries()]
        .filter(
          ([, r]) => r.number === null && r.attempts < maxAttempts && r.attemptedAt < staleBefore
        )
        .sort(([, a], [, b]) => a.createdAt - b.createdAt)
        .slice(0, limit)
        .map(
          ([id, r]): PendingLink => ({
            sentryIssueId: id,
            attempts: r.attempts,
            payload: r.payload,
          })
        )
    ),
    lease: vi.fn(async (id, seenAttempts) => {
      const row = rows.get(id);
      if (!row || row.number !== null || row.attempts !== seenAttempts) return false;
      row.attempts = seenAttempts + 1;
      row.attemptedAt = clock.now;
      return true;
    }),
    markCreated: vi.fn(async (id, number) => {
      const row = rows.get(id)!;
      row.number = number;
      row.lastError = null;
    }),
    markFailed: vi.fn(async (id, error) => {
      rows.get(id)!.lastError = error;
    }),
  };
  return { store, rows };
};

const makeDeps = (overrides: Partial<SentryWebhookDeps> = {}) => {
  const clock = { now: 1_000_000 };
  const { store, rows } = memoryStore(clock);
  const tasks: Promise<unknown>[] = [];
  let nextNumber = 7;
  const deps: SentryWebhookDeps = {
    verify: vi.fn(async (_body: string, signature: string | null) => signature === 'good'),
    linkStore: store,
    createGithubIssue: vi.fn(async () => ({ number: nextNumber++ })),
    background: (p) => {
      tasks.push(p);
    },
    now: () => clock.now,
    env: {},
    ...overrides,
  };
  const flush = async () => {
    while (tasks.length > 0) await Promise.all(tasks.splice(0));
  };
  return { deps, rows, clock, flush, tasks };
};

const request = (body: string, resource = 'event_alert', signature: string | null = 'good') => ({
  body,
  signature,
  resource,
});

const ACCEPTED = { status: 200, body: { ok: true, accepted: true } };
const IGNORED = { status: 200, body: { ok: true, accepted: false } };

describe('handleSentryWebhook', () => {
  it('returns 401 for a bad or missing signature without doing anything', async () => {
    const { deps, tasks } = makeDeps();
    for (const signature of ['bad', null]) {
      const res = await handleSentryWebhook(
        deps,
        request(alertBody(prodEvent), 'event_alert', signature)
      );
      expect(res.status).toBe(401);
    }
    expect(tasks).toHaveLength(0);
    expect(deps.linkStore.listPending).not.toHaveBeenCalled();
    expect(deps.linkStore.claim).not.toHaveBeenCalled();
  });

  it('passes the raw body and signature to verify', async () => {
    const { deps } = makeDeps();
    const body = alertBody(prodEvent);
    await handleSentryWebhook(deps, request(body));
    expect(deps.verify).toHaveBeenCalledWith(body, 'good');
  });

  it('returns 200 and ignores the installation resource', async () => {
    const { deps, flush } = makeDeps();
    const res = await handleSentryWebhook(
      deps,
      request(JSON.stringify({ action: 'created', data: { installation: {} } }), 'installation')
    );
    expect(res).toEqual(IGNORED);
    await flush();
    expect(deps.linkStore.claim).not.toHaveBeenCalled();
    expect(deps.createGithubIssue).not.toHaveBeenCalled();
  });

  it('returns 200 and ignores issue and unknown resources', async () => {
    const { deps, flush } = makeDeps();
    for (const resource of ['issue', 'metric_alert', 'error', '']) {
      expect(await handleSentryWebhook(deps, request(alertBody(prodEvent), resource))).toEqual(
        IGNORED
      );
    }
    await flush();
    expect(deps.createGithubIssue).not.toHaveBeenCalled();
  });

  it('responds 200 before the GitHub call resolves, then finishes in the background', async () => {
    let resolveGithub: (v: { number: number }) => void = () => {};
    const createGithubIssue = vi.fn(
      () => new Promise<{ number: number }>((resolve) => (resolveGithub = resolve))
    );
    const { deps, rows, flush } = makeDeps({ createGithubIssue });

    const res = await handleSentryWebhook(deps, request(alertBody(prodEvent)));
    expect(res).toEqual(ACCEPTED);
    expect(rows.get('42')?.number ?? null).toBeNull();

    // 백그라운드 작업이 GitHub 호출까지 진행되도록 한 틱 넘긴다
    await vi.waitFor(() => expect(createGithubIssue).toHaveBeenCalled());
    resolveGithub({ number: 11 });
    await flush();
    expect(rows.get('42')?.number).toBe(11);
  });

  it('creates a labelled GitHub issue for a new production event and stores the payload', async () => {
    const { deps, rows, flush } = makeDeps();
    expect(await handleSentryWebhook(deps, request(alertBody(prodEvent)))).toEqual(ACCEPTED);
    await flush();
    expect(deps.createGithubIssue).toHaveBeenCalledWith(
      'YongJaeHyun/switchon-recipe',
      expect.objectContaining({ title: '[Sentry] TypeError: boom', labels: ['sentry'] })
    );
    const row = rows.get('42')!;
    expect(row.number).toBe(7);
    expect(row.attempts).toBe(1);
    expect(row.payload.title).toBe('[Sentry] TypeError: boom');
    expect(row.payload.body).toContain('https://sentry.io/organizations/o/issues/42/');
  });

  it('uses GITHUB_REPO from env when set', async () => {
    const { deps, flush } = makeDeps({ env: { GITHUB_REPO: 'me/other' } });
    await handleSentryWebhook(deps, request(alertBody(prodEvent)));
    await flush();
    expect(deps.createGithubIssue).toHaveBeenCalledWith('me/other', expect.anything());
  });

  it('treats a missing environment as production', async () => {
    const { deps, flush } = makeDeps();
    const { environment: _omit, ...event } = prodEvent;
    expect(await handleSentryWebhook(deps, request(alertBody(event)))).toEqual(ACCEPTED);
    await flush();
    expect(deps.createGithubIssue).toHaveBeenCalledTimes(1);
  });

  it('skips non-production events', async () => {
    const { deps, flush } = makeDeps();
    const res = await handleSentryWebhook(
      deps,
      request(alertBody({ ...prodEvent, environment: 'development' }))
    );
    expect(res).toEqual(IGNORED);
    await flush();
    expect(deps.linkStore.claim).not.toHaveBeenCalled();
    expect(deps.createGithubIssue).not.toHaveBeenCalled();
  });

  it('creates nothing for a duplicate issue_id', async () => {
    const { deps, flush } = makeDeps();
    await handleSentryWebhook(deps, request(alertBody(prodEvent)));
    await flush();
    const res = await handleSentryWebhook(deps, request(alertBody({ ...prodEvent, web_url: 'x' })));
    expect(res).toEqual(ACCEPTED);
    await flush();
    expect(deps.createGithubIssue).toHaveBeenCalledTimes(1);
  });

  it('keeps the row with attempts = 1 and last_error when GitHub fails', async () => {
    const createGithubIssue = vi.fn().mockRejectedValue(new Error('GitHub 502'));
    const { deps, rows, flush } = makeDeps({ createGithubIssue });

    expect(await handleSentryWebhook(deps, request(alertBody(prodEvent)))).toEqual(ACCEPTED);
    await flush();

    const row = rows.get('42')!;
    expect(row.number).toBeNull();
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain('GitHub 502');
  });

  it('retries pending rows on a later webhook and fills in the issue number', async () => {
    const createGithubIssue = vi
      .fn()
      .mockRejectedValueOnce(new Error('GitHub 502'))
      .mockResolvedValue({ number: 21 });
    const { deps, rows, clock, flush } = makeDeps({ createGithubIssue });

    await handleSentryWebhook(deps, request(alertBody(prodEvent)));
    await flush();
    clock.now += LEASE_MS + 1;

    // 아무 웹훅(여기선 installation)이 와도 복구가 돈다
    expect(await handleSentryWebhook(deps, request('{}', 'installation'))).toEqual(IGNORED);
    await flush();

    const row = rows.get('42')!;
    expect(row.number).toBe(21);
    expect(row.attempts).toBe(2);
    expect(row.lastError).toBeNull();
    expect(createGithubIssue).toHaveBeenLastCalledWith(
      'YongJaeHyun/switchon-recipe',
      expect.objectContaining({ title: '[Sentry] TypeError: boom', labels: ['sentry'] })
    );
  });

  it('retries pending rows before handling the current event', async () => {
    const createGithubIssue = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue({ number: 30 });
    const { deps, clock, flush } = makeDeps({ createGithubIssue });

    await handleSentryWebhook(deps, request(alertBody(prodEvent)));
    await flush();
    clock.now += LEASE_MS + 1;

    await handleSentryWebhook(
      deps,
      request(alertBody({ ...prodEvent, issue_id: '43', title: 'New' }))
    );
    await flush();

    const titles = createGithubIssue.mock.calls.map(([, issue]) => issue.title);
    expect(titles).toEqual([
      '[Sentry] TypeError: boom',
      '[Sentry] TypeError: boom',
      '[Sentry] New',
    ]);
  });

  it('records a failed retry and increments attempts', async () => {
    const createGithubIssue = vi.fn().mockRejectedValue(new Error('still down'));
    const { deps, rows, clock, flush } = makeDeps({ createGithubIssue });

    await handleSentryWebhook(deps, request(alertBody(prodEvent)));
    await flush();
    clock.now += LEASE_MS + 1;
    await handleSentryWebhook(deps, request('{}', 'installation'));
    await flush();

    expect(rows.get('42')).toMatchObject({ attempts: 2, number: null, lastError: 'still down' });
  });

  it('does not retry a row at max attempts', async () => {
    const createGithubIssue = vi.fn().mockRejectedValue(new Error('down'));
    const { deps, rows, clock, flush } = makeDeps({ createGithubIssue });

    await handleSentryWebhook(deps, request(alertBody(prodEvent)));
    await flush();
    rows.get('42')!.attempts = MAX_ATTEMPTS;
    clock.now += LEASE_MS + 1;
    createGithubIssue.mockClear();

    await handleSentryWebhook(deps, request('{}', 'installation'));
    await flush();

    expect(createGithubIssue).not.toHaveBeenCalled();
    expect(rows.get('42')!.attempts).toBe(MAX_ATTEMPTS);
  });

  it('does not retry a row whose attempt is still in flight (within the lease)', async () => {
    const createGithubIssue = vi.fn().mockRejectedValue(new Error('down'));
    const { deps, flush } = makeDeps({ createGithubIssue });

    await handleSentryWebhook(deps, request(alertBody(prodEvent)));
    await flush();
    createGithubIssue.mockClear();

    await handleSentryWebhook(deps, request('{}', 'installation'));
    await flush();
    expect(createGithubIssue).not.toHaveBeenCalled();
  });

  it('skips a pending row when another worker already leased it', async () => {
    const createGithubIssue = vi.fn().mockRejectedValueOnce(new Error('down'));
    const { deps, clock, flush } = makeDeps({ createGithubIssue });
    await handleSentryWebhook(deps, request(alertBody(prodEvent)));
    await flush();
    clock.now += LEASE_MS + 1;

    deps.linkStore.lease = vi.fn(async () => false);
    createGithubIssue.mockClear();
    await handleSentryWebhook(deps, request('{}', 'installation'));
    await flush();
    expect(createGithubIssue).not.toHaveBeenCalled();
  });

  it('retries at most 3 pending rows per webhook', async () => {
    const createGithubIssue = vi.fn().mockRejectedValue(new Error('down'));
    const { deps, clock, flush } = makeDeps({ createGithubIssue });
    for (const id of ['1', '2', '3', '4', '5']) {
      await handleSentryWebhook(deps, request(alertBody({ ...prodEvent, issue_id: id })));
    }
    await flush();
    clock.now += LEASE_MS + 1;
    createGithubIssue.mockClear();

    await handleSentryWebhook(deps, request('{}', 'installation'));
    await flush();
    expect(createGithubIssue).toHaveBeenCalledTimes(3);
  });

  it('keeps going when saving the issue number fails after GitHub succeeded', async () => {
    const { deps, flush } = makeDeps();
    deps.linkStore.markCreated = vi.fn(async () => {
      throw new Error('db down');
    });
    expect(await handleSentryWebhook(deps, request(alertBody(prodEvent)))).toEqual(ACCEPTED);
    await expect(flush()).resolves.toBeUndefined();
  });

  it('never rejects the background promise when the store fails', async () => {
    const { deps, flush } = makeDeps();
    deps.linkStore.listPending = vi.fn(async () => {
      throw new Error('db down');
    });
    deps.linkStore.claim = vi.fn(async () => {
      throw new Error('db down');
    });
    expect(await handleSentryWebhook(deps, request(alertBody(prodEvent)))).toEqual(ACCEPTED);
    await expect(flush()).resolves.toBeUndefined();
    expect(deps.createGithubIssue).not.toHaveBeenCalled();
  });

  it('ignores an event without an issue_id or with an unparseable body', async () => {
    const { deps, flush } = makeDeps();
    const { issue_id: _omit, ...event } = prodEvent;
    expect(await handleSentryWebhook(deps, request(alertBody(event)))).toEqual(IGNORED);
    expect((await handleSentryWebhook(deps, request('not json'))).status).toBe(400);
    expect(
      await handleSentryWebhook(deps, request(JSON.stringify({ action: 'triggered' })))
    ).toEqual(IGNORED);
    await flush();
    expect(deps.createGithubIssue).not.toHaveBeenCalled();
  });

  it('accepts a numeric issue_id', async () => {
    const { deps, flush } = makeDeps();
    await handleSentryWebhook(deps, request(alertBody({ ...prodEvent, issue_id: 42 })));
    await flush();
    expect(deps.linkStore.claim).toHaveBeenCalledWith('42', expect.anything());
  });
});
