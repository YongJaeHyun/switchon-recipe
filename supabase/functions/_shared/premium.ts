// 구독(패스) 전용 기능 가드. 서버 최종 판단은 DB 함수 has_premium_access_for(uid) 하나로만 한다
// (앱이나 이 파일에서 권한을 다시 계산하지 않는다). URL import 없이 구조적 타입만 써서
// Deno 엣지 함수와 Vitest(node) 양쪽에서 테스트/사용 가능하게 유지한다.

export class PremiumRequiredError extends Error {
  constructor(message = '패스가 필요한 기능입니다.') {
    super(message);
    this.name = 'PremiumRequiredError';
  }
}

// SupabaseClient의 rpc 메서드만 구조적으로 타이핑: 실제 SupabaseClient도 이 타입을 만족한다.
export interface PremiumCheckClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

// has_premium_access_for(uid) RPC로만 판단한다. RPC 자체가 실패하면(네트워크/권한 오류 등)
// "접근 불가"로 뭉개지 않고 그대로 다시 던진다 (일시적 오류를 패스 없음으로 오판하면 안 되므로).
export async function assertPremium(supabase: PremiumCheckClient, uid: string): Promise<void> {
  const { data, error } = await supabase.rpc('has_premium_access_for', { p_uid: uid });
  if (error) throw error;
  if (data !== true) throw new PremiumRequiredError();
}

// PremiumRequiredError를 402(결제/구독 필요) JSON 응답으로 변환한다.
// 구독 전용 기능 엣지 함수들이 동일한 형식으로 응답하도록 여기서 공통으로 제공한다.
export function premiumRequiredResponse(error: PremiumRequiredError): Response {
  return new Response(JSON.stringify({ error: error.message }), {
    status: 402,
    headers: { 'Content-Type': 'application/json' },
  });
}
