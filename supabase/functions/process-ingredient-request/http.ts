const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_TIMEOUT_MS = 30000;

export interface RetryOptions {
  retryDelayMs?: number;
  timeoutMs?: number;
  // 재시도까지 끝난 최종 응답을 받는다. index.ts는 장애 알림(_shared/providerAlert.ts)을 넘긴다
  // (중간에 재시도로 넘어간 429·5xx는 알리지 않으려고 fetch를 감싸지 않고 여기서 받는다)
  onFinalResponse?: (url: string, res: Response) => void;
}

export const redactSecrets = (message: string) => message.replace(/key=[^&\s)]+/g, 'key=***');

const isTransient = (status: number) => status === 429 || status >= 500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 요청마다 시간 제한을 두고, 시간 초과·네트워크 오류·일시적 오류(429, 5xx)는 최대 3번까지 시도
export const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  {
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onFinalResponse,
  }: RetryOptions = {}
) => {
  for (let attempt = 1; ; attempt++) {
    const isLastAttempt = attempt >= MAX_ATTEMPTS;

    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok || !isTransient(res.status) || isLastAttempt) {
        onFinalResponse?.(url, res);
        return res;
      }
    } catch (error) {
      if (isLastAttempt) {
        throw new Error(redactSecrets(error instanceof Error ? error.message : String(error)));
      }
    }

    await sleep(retryDelayMs * attempt);
  }
};
