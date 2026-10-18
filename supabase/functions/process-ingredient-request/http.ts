const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

export interface RetryOptions {
  retryDelayMs?: number;
}

const isTransient = (status: number) => status === 429 || status >= 500;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 일시적 오류(429, 5xx)는 최대 3번까지 재시도. 실패하면 마지막 응답 그대로 반환
export const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  { retryDelayMs = DEFAULT_RETRY_DELAY_MS }: RetryOptions = {}
) => {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, init);
    if (res.ok || !isTransient(res.status) || attempt >= MAX_ATTEMPTS) return res;
    await sleep(retryDelayMs * attempt);
  }
};
