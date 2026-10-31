// 인터넷이 끊겨 요청이 아예 못 나간 오류인지. supabase는 fetch 실패를 Error가 아닌
// { message: 'TypeError: Network request failed', ... } 객체로 돌려주기도 해서 둘 다 본다
// supabase.functions.invoke는 fetch가 실패하면 FunctionsFetchError('Failed to send a request to the Edge Function')로
// 감싸서 던진다 (원래 오류는 context). 요청이 서버에 닿지 못한 경우라 같은 네트워크 오류로 본다
export const isNetworkError = (error: unknown): boolean => {
  if (error === null || error === undefined) return false;
  if (typeof error === 'object' && (error as { name?: unknown }).name === 'FunctionsFetchError') {
    return true;
  }
  const message =
    typeof error === 'object' && 'message' in error
      ? (error as { message?: unknown }).message
      : error;
  return String(message).includes('Network request failed');
};
