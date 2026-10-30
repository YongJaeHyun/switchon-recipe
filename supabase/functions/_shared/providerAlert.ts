// 외부 AI·이미지 API(Gemini, Pixabay) 장애 운영자 Slack 알림.
// 2026-10 Gemini 선불 크레딧이 떨어져(HTTP 402) 레시피 생성이 4일 동안 조용히 실패한 일 이후 추가했다.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 import를 두지 않는다.
//
// 흐름: 각 함수는 Gemini/Pixabay 호출에 fetch 대신 withProviderAlert로 감싼 fetch를 쓴다.
// - 실패 응답이면 본문을 읽어 classifyProviderFailure로 분류하고, 운영자가 손써야 하는 유형이면 알림을 보낸다.
// - 응답·오류는 원래 그대로 호출부에 돌려주므로 유저가 받는 결과는 바뀌지 않는다.
// - 알림은 백그라운드(EdgeRuntime.waitUntil)로 돌고 전체 5초 제한을 두며, 절대 던지지 않는다.
// - (provider, model, kind, 시각(시간 단위))마다 provider_alert 테이블 한 행에 실패 횟수를 센다
//   (record_provider_failure RPC). billing·auth·model은 첫 실패에, outage(5xx·용량 부족 429)는 그 시간에
//   3번째 실패에 알리고, 한 요청만 "차지"해 Slack에 보낸다. 그래서 같은 유형 알림은 모델별로 1시간에 한 번이다.
// - 복구 알림: billing·auth 알림 뒤 24시간 안에 같은 provider·모델 호출이 성공하면 "복구됨"을 한 번 보낸다
//   (recovered_at이 빈 행을 update ... returning으로 차지한 요청만 보냄). 복구 뒤 같은 시간에 다시 실패하면
//   RPC가 그 행을 다시 차지해 또 알린다. outage·model은 일시적이거나 코드 수정이 필요한 문제라 복구 알림이 없다.
// - SLACK_WEBHOOK_URL이 없으면 아무것도 하지 않는다 (DB도 건드리지 않음).

export type AlertProvider = 'gemini' | 'pixabay';
export type AlertKind = 'billing' | 'auth' | 'outage' | 'model';

export interface ProviderFailure {
  provider: AlertProvider;
  // Gemini는 URL의 모델 이름(gemini-2.5-flash 등), Pixabay는 빈 문자열
  model: string;
  kind: AlertKind;
  functionName: string;
  status: number;
  detail: string;
}

// 크레딧·결제 문구 (Gemini 402 "Your prepayment credits are depleted", 403 BILLING_DISABLED 등)
const BILLING_PATTERN =
  /prepayment|prepaid|\bcredits?\b|billing|RESOURCE_EXHAUSTED|quota|insufficient[_ ]funds|payment required/i;
// 429 전용: 결제가 확실한 문구 또는 하루 할당량(PerDay quotaId)일 때만 billing.
// Google 429 안내문에 늘 붙는 "check your plan and billing details"는 결제 문제의 근거가 아니므로 먼저 지운다
const BILLING_429_PATTERN =
  /prepayment|prepaid|\bcredits?\b|billing|insufficient[_ ]funds|payment required|PerDay/i;
const GENERIC_429_BILLING_HINT = /check your plan and billing details/gi;
// 결제 문구 없는 RESOURCE_EXHAUSTED·quota 429: 공유 용량 부족·동적 할당량 등 일시적 용량 문제 (outage처럼 센다)
const CAPACITY_429_PATTERN = /RESOURCE_EXHAUSTED|quota/i;
// 키 자체가 잘못됐다는 확실한 문구 (Gemini 400 API_KEY_INVALID, Pixabay 400 "Invalid or missing API key")
const BAD_KEY_PATTERN =
  /API_KEY_(INVALID|EXPIRED)|API key not valid|API key expired|invalid or missing API key|invalid API key|leaked/i;
// 권한·API 비활성 문구 (403 PERMISSION_DENIED, SERVICE_DISABLED 등)
const PERMISSION_PATTERN =
  /PERMISSION_DENIED|UNAUTHENTICATED|SERVICE_DISABLED|has not been used in project|unregistered callers/i;
// 분 단위 호출 제한(순간 몰림)은 잠깐 기다리면 풀리고 process-ingredient-request는 재시도도 한다. 결제 문제가 아니다
const PER_MINUTE_RATE_LIMIT = /PerMinute|per minute/i;

// 실패한 외부 API 응답(상태 코드 + 본문)을 운영자 알림 유형으로 분류한다. 알림이 필요 없으면 null.
// - billing: 402, 400/403인데 크레딧·결제·할당량 문구가 있음,
//            429인데 선불·크레딧·결제 문구나 하루 할당량(PerDay) quotaId가 있음
// - auth:    401, 또는 400/403인데 API 키가 잘못됐거나 만료·유출, 권한 없음·API 비활성 문구가 있음 (그 밖의 403도 auth)
// - outage:  5xx(Gemini 과부하 503 포함), 결제 문구 없는 RESOURCE_EXHAUSTED·quota 429(용량 부족).
//            일시적인 경우가 많아 같은 시간에 여러 번 실패해야 알린다 (OUTAGE_THRESHOLD)
// - model:   404인데 모델 문구가 있음 (모델 폐기·이름 변경. 2026-10 Imagen 4 제거처럼 코드 수정이 필요)
// 무시하는 것: 그 밖의 400(잘못된 요청 형식 등 요청 내용 문제. 안전 필터 차단은 200으로 와서 여기 오지 않는다),
// 분 단위 429·할당량 문구 없는 429(Pixabay "API rate limit exceeded"), 시간 초과·네트워크 오류
// (응답이 없어서 감싼 fetch가 예외를 그대로 넘긴다. 각 함수가 이미 재시도·오류 응답으로 처리하고 대부분 일시적)
export function classifyProviderFailure(status: number, body: string): AlertKind | null {
  if (status < 400) return null;
  if (status >= 500) return 'outage';
  if (status === 402) return 'billing';
  if (status === 401) return 'auth';

  if (status === 429) {
    if (PER_MINUTE_RATE_LIMIT.test(body)) return null;
    if (BILLING_429_PATTERN.test(body.replace(GENERIC_429_BILLING_HINT, ''))) return 'billing';
    return CAPACITY_429_PATTERN.test(body) ? 'outage' : null;
  }

  if (status === 400 || status === 403) {
    // 키 문제를 먼저 본다. 그다음 결제(403 BILLING_DISABLED는 PERMISSION_DENIED와 같이 오므로 권한보다 먼저)
    if (BAD_KEY_PATTERN.test(body)) return 'auth';
    if (BILLING_PATTERN.test(body)) return 'billing';
    if (PERMISSION_PATTERN.test(body)) return 'auth';
    return status === 403 ? 'auth' : null;
  }

  if (status === 404 && /model/i.test(body)) return 'model';

  return null;
}

export const providerOfUrl = (url: string): AlertProvider | null => {
  if (url.startsWith('https://generativelanguage.googleapis.com/')) return 'gemini';
  if (url.startsWith('https://pixabay.com/api/')) return 'pixabay';
  return null;
};

// 알림·복구를 모델별로 나누는 키. Gemini는 .../models/<모델>:generateContent에서 뽑고, 그 밖은 빈 문자열
export const modelOfUrl = (url: string): string => {
  const match = /\/models\/([^/:?#]+)/.exec(url);
  return match ? decodeURIComponent(match[1]) : '';
};

// 응답 본문·URL에 들어 있을 수 있는 API 키를 지운다 (?key=..., "key": "...", "api_key": "...", AIza...)
export const redactSecrets = (text: string) =>
  text
    .replace(/key=[^&\s)"']+/gi, 'key=***')
    .replace(/("[\w-]*key"\s*:\s*")[^"]*"/gi, '$1***"')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '***');

const DETAIL_MAX = 300;

// 응답 본문에서 사람이 읽을 메시지만 짧게 뽑는다 (Google 오류 JSON이면 error.message)
export const summarizeDetail = (body: string) => {
  let text = body;
  try {
    const parsed = JSON.parse(body);
    const error = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error;
    if (typeof error?.message === 'string') {
      text = error.status ? `${error.status}: ${error.message}` : error.message;
    }
  } catch {
    // JSON이 아니면 본문 그대로
  }
  const compact = redactSecrets(text.replace(/\s+/g, ' ').trim());
  return compact.length > DETAIL_MAX ? `${compact.slice(0, DETAIL_MAX)}…` : compact;
};

const PROVIDER_LABEL: Record<AlertProvider, string> = { gemini: 'Gemini', pixabay: 'Pixabay' };

const GUIDE: Record<
  AlertProvider,
  Record<AlertKind, { title: string; cause: string; action: string }>
> = {
  gemini: {
    billing: {
      title: '결제·크레딧 문제로 호출 실패',
      cause: '선불 크레딧 소진, 결제 수단 문제 또는 하루 할당량 초과',
      action: 'AI Studio에서 선불 크레딧 충전·결제 상태 확인: https://ai.studio/projects',
    },
    auth: {
      title: 'API 키 문제로 호출 실패',
      cause: 'API 키가 잘못됐거나 만료·차단됨, 또는 프로젝트에서 API가 꺼짐',
      action:
        'AI Studio에서 키 확인 후 GEMINI_API_KEY 시크릿 교체: https://aistudio.google.com/apikey',
    },
    outage: {
      title: '서버 오류·과부하로 호출이 반복 실패',
      cause: 'Google 쪽 장애, 모델 과부하(5xx) 또는 공유 용량 부족(429) (보통 일시적)',
      action: '상태 페이지 확인 후 계속되면 대응: https://aistudio.google.com/status',
    },
    model: {
      title: '모델을 찾을 수 없어 호출 실패',
      cause: '사용 중인 모델이 폐기되었거나 이름이 바뀜',
      action:
        '코드의 모델 이름을 지원 모델로 바꿔 재배포: https://ai.google.dev/gemini-api/docs/models',
    },
  },
  pixabay: {
    billing: {
      title: '결제·한도 문제로 호출 실패',
      cause: '계정 요금·이용 한도 문제',
      action: 'Pixabay 계정·API 상태 확인: https://pixabay.com/api/docs/',
    },
    auth: {
      title: 'API 키 문제로 호출 실패',
      cause: 'API 키가 잘못됐거나 차단됨',
      action: 'Pixabay에서 키 확인 후 PIXABAY_API_KEY 시크릿 교체: https://pixabay.com/api/docs/',
    },
    outage: {
      title: '서버 오류로 호출이 반복 실패',
      cause: 'Pixabay 쪽 장애 (보통 일시적)',
      action: '계속되면 Pixabay 상태 확인. 재료 이미지는 AI 생성으로 대신 만들어진다',
    },
    model: {
      title: '요청 경로를 찾을 수 없어 호출 실패',
      cause: 'API 경로 변경',
      action: 'Pixabay API 문서 확인: https://pixabay.com/api/docs/',
    },
  },
};

// 이 횟수만큼 같은 (provider, model, kind)가 한 시간 안에 실패하면 알린다.
// outage는 Gemini 503처럼 한 번씩은 흔하고 손쓸 일이 없어 여러 번 실패해야 알린다
export const OUTAGE_THRESHOLD = 3;
export const alertThreshold = (kind: AlertKind) => (kind === 'outage' ? OUTAGE_THRESHOLD : 1);

export function buildFailureMessage(failure: ProviderFailure): string {
  const guide = GUIDE[failure.provider][failure.kind];
  const threshold = alertThreshold(failure.kind);
  return [
    `🚨 [${PROVIDER_LABEL[failure.provider]}] ${guide.title} (HTTP ${failure.status})`,
    `함수: ${failure.functionName}`,
    ...(failure.model ? [`모델: ${failure.model}`] : []),
    `추정 원인: ${guide.cause}`,
    `조치: ${guide.action}`,
    `응답: ${redactSecrets(failure.detail) || '(본문 없음)'}`,
    threshold > 1
      ? `1시간 안에 ${threshold}번 실패해서 보냅니다. 같은 유형 알림은 모델별로 1시간에 한 번만 보냅니다.`
      : '같은 유형 알림은 모델별로 1시간에 한 번만 보냅니다.',
  ].join('\n');
}

export function buildRecoveryMessage(
  provider: AlertProvider,
  model: string,
  kinds: AlertKind[],
  functionName: string
): string {
  const titles = [...new Set(kinds)].map((kind) => GUIDE[provider][kind].title).join(', ');
  const where = model ? `${functionName} 호출(${model})` : `${functionName} 호출`;
  return `✅ [${PROVIDER_LABEL[provider]}] 복구됨: ${where}이 다시 성공했습니다 (이전 알림: ${titles})`;
}

// ---- 중복 방지 저장소 ----

export interface AlertSlot {
  provider: AlertProvider;
  model: string;
  kind: AlertKind;
  hour: string;
}

export interface ProviderAlertStore {
  // 실패 한 번을 세고, 이 요청이 알림을 보내야 하면(횟수가 threshold 이상이고 아직 아무도 안 보냈거나
  // 복구 처리된 뒤 다시 실패) 차지하고 true. DB 오류는 던진다
  recordFailure(slot: AlertSlot, threshold: number): Promise<boolean>;
  // Slack 전송이 실패했을 때 다음 실패가 다시 알릴 수 있게 차지를 되돌린다
  releaseAlert(slot: AlertSlot): Promise<void>;
  // sinceIso 이후 알림을 보냈고 아직 복구 처리 안 된 billing·auth 행을 복구 처리하고, 처리한 kind 목록을 돌려준다
  resolve(
    provider: AlertProvider,
    model: string,
    sinceIso: string,
    nowIso: string
  ): Promise<AlertKind[]>;
}

type DbError = { code?: string; message: string } | null;

// supabase-js 클라이언트 중 여기서 쓰는 부분만 (Vitest에서 supabase-js를 불러오지 않으려고 구조 타입으로 둔다)
export interface AlertDbClient {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
  // deno-lint-ignore no-explicit-any
  rpc(fn: string, args: Record<string, unknown>): any;
}

const RECOVERABLE_KINDS: AlertKind[] = ['billing', 'auth'];

export const createSupabaseAlertStore = (client: AlertDbClient): ProviderAlertStore => ({
  async recordFailure(slot, threshold) {
    const { data, error } = (await client.rpc('record_provider_failure', {
      p_provider: slot.provider,
      p_model: slot.model,
      p_kind: slot.kind,
      p_hour: slot.hour,
      p_threshold: threshold,
    })) as { data: unknown; error: DbError };
    if (error) throw new Error(`provider_alert 기록 실패: ${error.message}`);
    return data === true;
  },

  async releaseAlert(slot) {
    const { error } = (await client
      .from('provider_alert')
      .update({ alerted_at: null })
      .eq('provider', slot.provider)
      .eq('model', slot.model)
      .eq('kind', slot.kind)
      .eq('hour', slot.hour)) as { error: DbError };
    if (error) throw new Error(`provider_alert 차지 되돌리기 실패: ${error.message}`);
  },

  async resolve(provider, model, sinceIso, nowIso) {
    const { data, error } = (await client
      .from('provider_alert')
      .update({ recovered_at: nowIso })
      .eq('provider', provider)
      .eq('model', model)
      .in('kind', RECOVERABLE_KINDS)
      .not('alerted_at', 'is', null)
      .is('recovered_at', null)
      .gte('hour', sinceIso)
      .select('kind')) as { data: { kind: AlertKind }[] | null; error: DbError };
    if (error) throw new Error(`provider_alert 복구 처리 실패: ${error.message}`);
    return (data ?? []).map((row) => row.kind);
  },
});

// ---- Slack ----

const SLACK_TIMEOUT_MS = 3000;

export const createSlackPoster =
  (webhookUrl: string | undefined, fetchFn: typeof fetch = fetch, timeoutMs = SLACK_TIMEOUT_MS) =>
  async (text: string): Promise<void> => {
    if (!webhookUrl) throw new Error('SLACK_WEBHOOK_URL not set');
    let res: Response;
    try {
      res = await fetchFn(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // 네트워크·시간 초과 오류 메시지에는 웹훅 URL(시크릿)이 들어 있을 수 있어 오류 이름만 남긴다
      const name = error instanceof Error ? error.name : typeof error;
      throw new Error(`Slack 전송 실패 (${name})`);
    }
    if (!res.ok) throw new Error(`Slack 전송 실패 (${res.status})`);
  };

// ---- 알림 본체 ----

export interface ProviderAlerterDeps {
  store: ProviderAlertStore;
  postSlack(text: string): Promise<void>;
  now?: () => Date;
  log?: (...args: unknown[]) => void;
}

export interface ProviderAlerter {
  notifyProviderFailure(failure: ProviderFailure): Promise<void>;
  notifyProviderSuccess(
    provider: AlertProvider,
    model: string,
    functionName: string
  ): Promise<void>;
}

const HOUR_MS = 60 * 60 * 1000;
const RECOVERY_WINDOW_MS = 24 * HOUR_MS;
// 성공할 때마다 DB를 보지 않도록 isolate마다 provider·모델당 5분에 한 번만 복구 여부를 확인한다
const RECOVERY_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const FALLBACK_MAX_KEYS = 200;

export const hourOf = (date: Date) =>
  new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS).toISOString();

const slotKey = (slot: AlertSlot) => `${slot.provider}|${slot.model}|${slot.kind}|${slot.hour}`;

export function createProviderAlerter({
  store,
  postSlack,
  now = () => new Date(),
  log = console.error,
}: ProviderAlerterDeps): ProviderAlerter {
  // 저장소(DB)가 안 될 때(마이그레이션 미적용 등)만 쓰는 isolate 메모리 대체 기록.
  // 평소에는 실패마다 DB에서 세고 차지한다 (메모리로 먼저 거르면 다른 isolate의 복구 처리를 못 봐서
  // 복구 뒤 재실패 알림을 놓친다)
  const fallback = new Map<string, { count: number; alerted: boolean }>();
  const lastRecoveryCheck = new Map<string, number>();

  const recordInMemory = (key: string, threshold: number) => {
    if (fallback.size > FALLBACK_MAX_KEYS) fallback.clear();
    const entry = fallback.get(key) ?? { count: 0, alerted: false };
    entry.count += 1;
    fallback.set(key, entry);
    if (entry.alerted || entry.count < threshold) return false;
    entry.alerted = true;
    return true;
  };

  return {
    async notifyProviderFailure(failure) {
      try {
        const slot: AlertSlot = {
          provider: failure.provider,
          model: failure.model,
          kind: failure.kind,
          hour: hourOf(now()),
        };
        const key = slotKey(slot);
        const threshold = alertThreshold(failure.kind);

        let claimed: boolean;
        let usedFallback = false;
        try {
          claimed = await store.recordFailure(slot, threshold);
        } catch (error) {
          // 중복 방지 저장소가 안 되면 알림을 아예 못 보내는 쪽보다 isolate 메모리 기준으로 보내는 쪽을 택한다
          log('[providerAlert] 중복 방지 저장 실패, 메모리 기준으로만 거른다:', error);
          claimed = recordInMemory(key, threshold);
          usedFallback = true;
        }
        if (!claimed) return;

        try {
          await postSlack(buildFailureMessage(failure));
        } catch (error) {
          log('[providerAlert] Slack 전송 실패:', error);
          const entry = fallback.get(key);
          if (entry) entry.alerted = false;
          if (!usedFallback) await store.releaseAlert(slot).catch((e) => log(e));
        }
      } catch (error) {
        log('[providerAlert] 알림 처리 실패:', error);
      }
    },

    async notifyProviderSuccess(provider, model, functionName) {
      try {
        const nowMs = now().getTime();
        const checkKey = `${provider}|${model}`;
        const last = lastRecoveryCheck.get(checkKey);
        if (last !== undefined && nowMs - last < RECOVERY_CHECK_INTERVAL_MS) return;
        lastRecoveryCheck.set(checkKey, nowMs);

        const kinds = await store.resolve(
          provider,
          model,
          hourOf(new Date(nowMs - RECOVERY_WINDOW_MS)),
          new Date(nowMs).toISOString()
        );
        if (kinds.length === 0) return;
        await postSlack(buildRecoveryMessage(provider, model, kinds, functionName));
      } catch (error) {
        log('[providerAlert] 복구 알림 처리 실패:', error);
      }
    },
  };
}

// ---- 응답 지켜보기 ----

type Schedule = (task: Promise<unknown>) => void;

// 알림 작업 전체(본문 읽기·DB·Slack) 제한. DB 호출이 멈춰도 isolate를 붙잡지 않게 한다
export const ALERT_TASK_TIMEOUT_MS = 5000;

export const withTimeout = <T>(task: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`알림 작업 시간 초과 (${ms}ms)`)), ms);
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
};

// 응답을 돌려준 뒤에도 알림 작업이 끝까지 돌게 한다 (Supabase Edge Runtime의 waitUntil). 없으면 그냥 둔다
export const runInBackground: Schedule = (task) => {
  const guarded = withTimeout(task, ALERT_TASK_TIMEOUT_MS).catch((error) =>
    console.error('[providerAlert] 백그라운드 작업 실패:', error)
  );
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
    .EdgeRuntime;
  try {
    runtime?.waitUntil(guarded);
  } catch {
    // 요청 밖(waitUntil 불가)이면 그냥 백그라운드로 둔다
  }
};

export interface ProviderMonitor {
  // 외부 API의 최종 응답을 넘긴다. Gemini/Pixabay가 아니면 무시. 응답 본문은 복제해서 읽으므로 호출부는 그대로 쓴다
  observe(url: string, res: Response): void;
}

export function createProviderMonitor({
  functionName,
  alerter,
  schedule = runInBackground,
}: {
  functionName: string;
  alerter: ProviderAlerter;
  schedule?: Schedule;
}): ProviderMonitor {
  return {
    observe(url, res) {
      const provider = providerOfUrl(url);
      if (!provider) return;
      const model = modelOfUrl(url);

      if (res.ok) {
        schedule(alerter.notifyProviderSuccess(provider, model, functionName));
        return;
      }

      const copy = res.clone();
      schedule(
        (async () => {
          const body = await copy.text().catch(() => '');
          const kind = classifyProviderFailure(res.status, body);
          if (!kind) return;
          await alerter.notifyProviderFailure({
            provider,
            model,
            kind,
            functionName,
            status: res.status,
            detail: summarizeDetail(body),
          });
        })()
      );
    },
  };
}

const urlOf = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

// 응답을 monitor에 넘기는 fetch. 응답·예외(시간 초과 등)는 그대로 돌려준다
export function withProviderAlert(fetchFn: typeof fetch, monitor: ProviderMonitor): typeof fetch {
  const watched = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await fetchFn(input, init);
    monitor.observe(urlOf(input), res);
    return res;
  };
  return watched as typeof fetch;
}

interface AlertWiring {
  functionName: string;
  client: AlertDbClient;
  webhookUrl: string | undefined;
  fetchFn?: typeof fetch;
}

const NOOP_MONITOR: ProviderMonitor = { observe() {} };
let warnedNoWebhook = false;

// 엣지 함수 index.ts용: service role 클라이언트와 SLACK_WEBHOOK_URL로 monitor를 만든다.
// isolate 안에서 복구 확인 간격을 공유하도록 모듈 최상단에서 한 번만 만든다.
// 재시도하는 호출부(process-ingredient-request)는 중간 실패가 아닌 최종 응답만 넘기도록 monitor를 직접 쓴다.
// 웹훅 URL이 없으면 보낼 곳이 없으니 DB 기록도 하지 않는 빈 monitor를 돌려준다 (부팅 때 한 번 로그)
export const createProviderAlertMonitor = ({
  functionName,
  client,
  webhookUrl,
  fetchFn = fetch,
}: AlertWiring): ProviderMonitor => {
  if (!webhookUrl) {
    if (!warnedNoWebhook) {
      warnedNoWebhook = true;
      console.warn('[providerAlert] SLACK_WEBHOOK_URL이 없어 장애 알림을 끈다');
    }
    return NOOP_MONITOR;
  }
  return createProviderMonitor({
    functionName,
    alerter: createProviderAlerter({
      store: createSupabaseAlertStore(client),
      postSlack: createSlackPoster(webhookUrl, fetchFn),
    }),
  });
};

// 재시도 없이 한 번 호출하는 곳용: fetch 대신 쓴다
export const createProviderAlertFetch = (wiring: AlertWiring): typeof fetch =>
  withProviderAlert(wiring.fetchFn ?? fetch, createProviderAlertMonitor(wiring));
