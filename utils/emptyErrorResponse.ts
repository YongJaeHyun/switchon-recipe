// Supabase 앞단(게이트웨이)이 잠깐 실패하면 본문 없는 5xx를 준다. supabase-js는 그 본문으로 오류를 만들어
// `{"message":""}`만 남고 상태 코드가 사라진다 (Sentry [IngredientAPI.selectAll]: {"message":""}).
// 클라이언트 fetch에서 빈 실패 응답의 본문을 상태 코드로 채워, 모든 API 오류에 코드가 남게 한다.

export const fillEmptyErrorResponse = async (res: Response): Promise<Response> => {
  // 빈 404는 라이브러리가 "결과 없음(204)"으로 다루므로 건드리지 않는다
  if (res.ok || res.status === 404) return res;
  const body = await res.clone().text();
  if (body !== '') return res;
  return new Response(
    JSON.stringify({
      code: `HTTP_${res.status}`,
      message: `HTTP ${res.status} (빈 응답)`,
      details: null,
      hint: null,
    }),
    { status: res.status, statusText: res.statusText, headers: res.headers }
  );
};

// 위에서 채운 빈 5xx 오류 = 서버 앞단의 일시적인 문제 (앱이 고칠 수 없어 Sentry 오류로 보내지 않는다)
export const isTransientServerError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^HTTP_5\d\d$/.test(code);
};
