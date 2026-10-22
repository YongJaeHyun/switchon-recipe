export interface OtaDeps {
  checkForUpdate: () => Promise<boolean>;
  fetchUpdate: () => Promise<void>;
  reload: () => Promise<void>;
  // 시간 안에 다 받지 못한 업데이트가 나중에 준비됐을 때 (다음 포그라운드 복귀 때 적용)
  onReadyLater: () => void;
}

export type StartupUpdateResult = 'reloaded' | 'none' | 'pending' | 'error';

const TIMEOUT = Symbol('timeout');

// 앱 시작 시: 시간 안에 업데이트를 받으면 바로 재시작해 최신 버전으로 열고,
// 시간이 넘으면 현재 버전으로 열되 다운로드는 계속해서 다음 기회에 적용
export const runStartupUpdate = async (
  deps: OtaDeps,
  timeoutMs: number
): Promise<StartupUpdateResult> => {
  const download = (async () => {
    if (!(await deps.checkForUpdate())) return 'none' as const;
    await deps.fetchUpdate();
    return 'ready' as const;
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
  });

  try {
    const result = await Promise.race([download, timeout]);

    if (result === TIMEOUT) {
      download
        .then((later) => {
          if (later === 'ready') deps.onReadyLater();
        })
        .catch(() => {});
      return 'pending';
    }
    if (result === 'none') return 'none';

    await deps.reload();
    return 'reloaded';
  } catch {
    return 'error';
  } finally {
    clearTimeout(timer);
  }
};

// 백그라운드로 갈 때 네트워크가 끊기거나 느려서 업데이트 확인·다운로드가 실패한 경우.
// 다음 기회에 다시 시도하면 되는 일이라 오류로 보고하지 않는다
const UPDATE_NETWORK_ERROR =
  /Failed to check for update|Failed to download|Network request failed|timeout/i;

export const isUpdateNetworkError = (error: unknown): boolean =>
  error instanceof Error && UPDATE_NETWORK_ERROR.test(error.message);
