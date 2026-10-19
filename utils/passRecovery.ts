// 결제 누락 복구 실행 조건 (훅에서 분리한 순수 로직).
// - 오프라인이면 건너뛰고 완료로 보지 않는다 → 온라인이 된 뒤 다음 트리거에서 실행
// - 실제로 실행을 마친 뒤에만 완료 시각을 기록한다 (throw하면 다음 트리거에서 다시)
// - 같은 uid는 RECOVERY_THROTTLE_MS 안에 다시 실행하지 않는다. uid가 바뀌면 바로 실행
// - 실행 중에 겹친 트리거는 건너뛴다

export const RECOVERY_THROTTLE_MS = 60 * 1000;

interface RecoveryRunnerDeps {
  isOnline(): Promise<boolean>;
  now(): number;
  run(uid: string): Promise<unknown>;
  throttleMs?: number;
}

export const createRecoveryRunner = ({
  isOnline,
  now,
  run,
  throttleMs = RECOVERY_THROTTLE_MS,
}: RecoveryRunnerDeps) => {
  let running = false;
  let last: { uid: string; at: number } | null = null;

  // 실행했으면 true
  return async (uid: string): Promise<boolean> => {
    if (!uid || running) return false;
    if (last && last.uid === uid && now() - last.at < throttleMs) return false;

    running = true;
    try {
      if (!(await isOnline())) return false;
      await run(uid);
      last = { uid, at: now() };
      return true;
    } finally {
      running = false;
    }
  };
};
