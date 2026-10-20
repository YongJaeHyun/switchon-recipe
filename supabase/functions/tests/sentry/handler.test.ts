import { describe, expect, it, vi } from 'vitest';
import { handleSentryWebhook, type SentryWebhookDeps } from '../../sentry-to-github/handler.ts';

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

const makeDeps = (overrides: Partial<SentryWebhookDeps> = {}) => {
  const linked = new Set<string>();
  const deps: SentryWebhookDeps = {
    verify: vi.fn(async (_body: string, signature: string | null) => signature === 'good'),
    linkStore: {
      claim: vi.fn(async (id: string) => {
        if (linked.has(id)) return false;
        linked.add(id);
        return true;
      }),
      setIssueNumber: vi.fn(async () => {}),
      release: vi.fn(async (id: string) => {
        linked.delete(id);
      }),
    },
    createGithubIssue: vi.fn(async () => ({ number: 7 })),
    env: {},
    ...overrides,
  };
  return { deps, linked };
};

const request = (body: string, resource = 'event_alert', signature: string | null = 'good') => ({
  body,
  signature,
  resource,
});

describe('handleSentryWebhook', () => {
  it('returns 401 for a bad or missing signature without doing anything', async () => {
    const { deps } = makeDeps();
    expect(
      (await handleSentryWebhook(deps, request(alertBody(prodEvent), 'event_alert', 'bad'))).status
    ).toBe(401);
    expect(
      (await handleSentryWebhook(deps, request(alertBody(prodEvent), 'event_alert', null))).status
    ).toBe(401);
    expect(deps.linkStore.claim).not.toHaveBeenCalled();
    expect(deps.createGithubIssue).not.toHaveBeenCalled();
  });

  it('passes the raw body and signature to verify', async () => {
    const { deps } = makeDeps();
    const body = alertBody(prodEvent);
    await handleSentryWebhook(deps, request(body));
    expect(deps.verify).toHaveBeenCalledWith(body, 'good');
  });

  it('returns 200 and ignores the installation resource', async () => {
    const { deps } = makeDeps();
    const res = await handleSentryWebhook(
      deps,
      request(JSON.stringify({ action: 'created', data: { installation: {} } }), 'installation')
    );
    expect(res).toEqual({ status: 200, body: { ok: true, created: false } });
    expect(deps.createGithubIssue).not.toHaveBeenCalled();
  });

  it('returns 200 and ignores issue and unknown resources', async () => {
    const { deps } = makeDeps();
    for (const resource of ['issue', 'metric_alert', 'error', '']) {
      const res = await handleSentryWebhook(deps, request(alertBody(prodEvent), resource));
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(false);
    }
    expect(deps.createGithubIssue).not.toHaveBeenCalled();
  });

  it('creates a labelled GitHub issue for a new production event', async () => {
    const { deps } = makeDeps();
    const res = await handleSentryWebhook(deps, request(alertBody(prodEvent)));
    expect(res).toEqual({ status: 200, body: { ok: true, created: true, issueNumber: 7 } });
    expect(deps.linkStore.claim).toHaveBeenCalledWith('42');
    expect(deps.createGithubIssue).toHaveBeenCalledWith(
      'YongJaeHyun/switchon-recipe',
      expect.objectContaining({ title: '[Sentry] TypeError: boom', labels: ['sentry'] })
    );
    expect(deps.linkStore.setIssueNumber).toHaveBeenCalledWith('42', 7);
  });

  it('uses GITHUB_REPO from env when set', async () => {
    const { deps } = makeDeps({ env: { GITHUB_REPO: 'me/other' } });
    await handleSentryWebhook(deps, request(alertBody(prodEvent)));
    expect(deps.createGithubIssue).toHaveBeenCalledWith('me/other', expect.anything());
  });

  it('treats a missing environment as production', async () => {
    const { deps } = makeDeps();
    const { environment: _omit, ...event } = prodEvent;
    const res = await handleSentryWebhook(deps, request(alertBody(event)));
    expect(res.body.created).toBe(true);
  });

  it('skips non-production events', async () => {
    const { deps } = makeDeps();
    const res = await handleSentryWebhook(
      deps,
      request(alertBody({ ...prodEvent, environment: 'development' }))
    );
    expect(res).toEqual({ status: 200, body: { ok: true, created: false } });
    expect(deps.linkStore.claim).not.toHaveBeenCalled();
    expect(deps.createGithubIssue).not.toHaveBeenCalled();
  });

  it('creates nothing for a duplicate issue_id', async () => {
    const { deps } = makeDeps();
    await handleSentryWebhook(deps, request(alertBody(prodEvent)));
    const res = await handleSentryWebhook(deps, request(alertBody({ ...prodEvent, web_url: 'x' })));
    expect(res).toEqual({ status: 200, body: { ok: true, created: false } });
    expect(deps.createGithubIssue).toHaveBeenCalledTimes(1);
  });

  it('deletes the dedupe row and returns 500 when GitHub fails, so a retry can succeed', async () => {
    const createGithubIssue = vi
      .fn()
      .mockRejectedValueOnce(new Error('GitHub 502'))
      .mockResolvedValueOnce({ number: 8 });
    const { deps, linked } = makeDeps({ createGithubIssue });

    const failed = await handleSentryWebhook(deps, request(alertBody(prodEvent)));
    expect(failed.status).toBe(500);
    expect(failed.body.ok).toBe(false);
    expect(deps.linkStore.release).toHaveBeenCalledWith('42');
    expect(linked.has('42')).toBe(false);

    const retried = await handleSentryWebhook(deps, request(alertBody(prodEvent)));
    expect(retried.body).toEqual({ ok: true, created: true, issueNumber: 8 });
  });

  it('still returns 200 when saving the issue number fails after GitHub succeeded', async () => {
    const { deps } = makeDeps();
    deps.linkStore.setIssueNumber = vi.fn(async () => {
      throw new Error('db down');
    });
    const res = await handleSentryWebhook(deps, request(alertBody(prodEvent)));
    expect(res).toEqual({ status: 200, body: { ok: true, created: true, issueNumber: 7 } });
    expect(deps.linkStore.release).not.toHaveBeenCalled();
  });

  it('skips an event without an issue_id or with an unparseable body', async () => {
    const { deps } = makeDeps();
    const { issue_id: _omit, ...event } = prodEvent;
    expect((await handleSentryWebhook(deps, request(alertBody(event)))).body.created).toBe(false);
    expect((await handleSentryWebhook(deps, request('not json'))).status).toBe(400);
    expect(
      (await handleSentryWebhook(deps, request(JSON.stringify({ action: 'triggered' })))).body
        .created
    ).toBe(false);
    expect(deps.createGithubIssue).not.toHaveBeenCalled();
  });

  it('accepts a numeric issue_id', async () => {
    const { deps } = makeDeps();
    await handleSentryWebhook(deps, request(alertBody({ ...prodEvent, issue_id: 42 })));
    expect(deps.linkStore.claim).toHaveBeenCalledWith('42');
  });
});
