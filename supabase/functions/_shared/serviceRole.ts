// JWT role 클레임만으로 service role 요청인지 판별한다. verify_jwt가 서명 검증을 끝낸 뒤 쓰는
// 전제라 서명은 다시 확인하지 않는다 (anon 키·유저 토큰 차단용).
// Deno 엣지 함수와 Vitest(node) 양쪽에서 로드되므로 URL import를 두지 않는다.

export const isServiceRoleRequest = (authorization: string | null) => {
  const token = authorization?.replace(/^Bearer\s+/i, '');
  const payload = token?.split('.')[1];
  if (!payload) return false;

  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json).role === 'service_role';
  } catch {
    return false;
  }
};
