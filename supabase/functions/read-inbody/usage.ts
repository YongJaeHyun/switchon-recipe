// 인바디 결과지 읽기 하루 한도. 기존 premium_usage 테이블(uid, day, feature, used)을 feature
// 'inbody_read'로 재사용한다. consume_premium_quota rpc는 premium_quota_setting 행이 있어야 해서
// (새 행 = 마이그레이션) 쓰지 않고, 한도는 코드 상수로 두고 used를 비교 후 교체(compare-and-swap)로
// 올린다: update ... where used = 읽은 값. 동시 요청이 끼어들면 다시 읽는다.
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 외부 import를 두지 않는다.

export interface UsageStore {
  // 오늘 행이 없으면 used = 0으로 만든다 (있으면 그대로)
  ensure(): Promise<void>;
  // 오늘 행의 used. 행이 없으면 null
  read(): Promise<number | null>;
  // used가 from일 때만 to로 바꾼다. 바꿨으면 true
  swap(from: number, to: number): Promise<boolean>;
}

export interface UsageDecision {
  allowed: boolean;
  remaining: number;
  limit: number;
}

const MAX_ATTEMPTS = 5;

export async function consumeDailyUsage(store: UsageStore, limit: number): Promise<UsageDecision> {
  await store.ensure();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const used = (await store.read()) ?? 0;
    if (used >= limit) return { allowed: false, remaining: 0, limit };
    if (await store.swap(used, used + 1)) {
      return { allowed: true, remaining: limit - used - 1, limit };
    }
  }
  throw new Error('인바디 읽기 한도 차감 경합이 계속됩니다');
}

// 실패 시 차감을 되돌린다 (0 미만 금지)
export async function releaseDailyUsage(store: UsageStore): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const used = await store.read();
    if (!used) return;
    if (await store.swap(used, used - 1)) return;
  }
  throw new Error('인바디 읽기 한도 복구 경합이 계속됩니다');
}
