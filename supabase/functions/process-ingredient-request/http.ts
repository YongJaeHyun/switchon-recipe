const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_TIMEOUT_MS = 30000;

export interface RetryOptions {
  retryDelayMs?: number;
  timeoutMs?: number;
}

const isTransient = (status: number) => status === 429 || status >= 500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 요청마다 시간 제한을 두고, 시간 초과·네트워크 오류·일시적 오류(429, 5xx)는 최대 3번까지 시도
export const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  { retryDelayMs = DEFAULT_RETRY_DELAY_MS, timeoutMs = DEFAULT_TIMEOUT_MS }: RetryOptions = {}
) => {
  for (let attempt = 1; ; attempt++) {
    const isLastAttempt = attempt >= MAX_ATTEMPTS;

    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok || !isTransient(res.status) || isLastAttempt) return res;
    } catch (error) {
      if (isLastAttempt) throw error;
    }

    await sleep(retryDelayMs * attempt);
  }
};
