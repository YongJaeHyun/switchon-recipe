// 인터넷이 끊겨 요청이 아예 못 나간 오류인지. supabase는 fetch 실패를 Error가 아닌
// { message: 'TypeError: Network request failed', ... } 객체로 돌려주기도 해서 둘 다 본다
export const isNetworkError = (error: unknown): boolean => {
  if (error === null || error === undefined) return false;
  const message =
    typeof error === 'object' && 'message' in error
      ? (error as { message?: unknown }).message
      : error;
  return String(message).includes('Network request failed');
};
