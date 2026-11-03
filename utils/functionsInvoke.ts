// supabase.functions.invoke 결과 다루기.
// 앱이 다시 열린 순간에는 로그인 토큰을 새로 받는 중이라, 그 사이 나간 요청이 401로 막힐 수 있다 (Sentry #31).
// 이때는 토큰을 새로 받고 한 번만 다시 부른다. 실패를 Sentry로 보낼 때는 함수 이름·상태 코드·본문을 담는다

interface InvokeResult {
  error: unknown;
}

interface HttpContext {
  status?: unknown;
  text?: () => Promise<string>;
}

// FunctionsHttpError(서버가 2xx가 아닌 응답)일 때 그 Response. 아니면 null
const httpContextOf = (error: unknown): HttpContext | null => {
  if (typeof error !== 'object' || error === null) return null;
  const { name, context } = error as { name?: unknown; context?: unknown };
  if (name !== 'FunctionsHttpError' || typeof context !== 'object' || context === null) {
    return null;
  }
  return context as HttpContext;
};

const statusOf = (error: unknown): number | undefined => {
  const status = httpContextOf(error)?.status;
  return typeof status === 'number' ? status : undefined;
};

export const invokeWithAuthRetry = async <Result extends InvokeResult>(
  call: () => Promise<Result>,
  refreshSession: () => Promise<unknown>
): Promise<Result> => {
  const first = await call();
  if (statusOf(first.error) !== 401) return first;
  try {
    await refreshSession();
  } catch {
    return first;
  }
  return call();
};

export const describeFunctionsError = async (fn: string, error: unknown): Promise<unknown> => {
  const context = httpContextOf(error);
  if (!context) return error;
  const status = typeof context.status === 'number' ? context.status : '?';
  let body = '';
  try {
    body = (await context.text?.()) ?? '';
  } catch {
    body = '';
  }
  return new Error(body ? `${fn} ${status}: ${body.slice(0, 300)}` : `${fn} ${status}`);
};
