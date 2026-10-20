import { isOnline } from './network';

export class OfflineError extends Error {
  constructor() {
    super('offline');
    this.name = 'OfflineError';
  }
}

// 오프라인이면 Supabase 요청이 토큰 갱신 재시도 동안 오래 멈추므로, 요청하지 않고 바로 실패시킴
export const failFastWhenOffline =
  <T>(fetcher: () => Promise<T>) =>
  async (): Promise<T> => {
    if (!(await isOnline())) throw new OfflineError();
    return fetcher();
  };
