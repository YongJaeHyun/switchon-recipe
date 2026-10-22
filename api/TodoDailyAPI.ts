import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { captureError } from 'utils/sendError';

// supabase는 fetch 실패를 Error가 아닌 { message } 객체로 돌려주기도 한다
const isOfflineError = (error: unknown) =>
  String((error as { message?: unknown })?.message ?? error).includes('Network request failed');

// 오늘 할 일 기록(주간 리포트 재료). 할 일 체크는 오프라인에서도 되므로
// 실패해도 토스트 없이 넘어간다 (네트워크 오류는 Sentry에도 보내지 않음)
const upsert = async ({
  day,
  items,
  checked,
}: {
  day: string;
  items: string[];
  checked: number[];
}): Promise<void> => {
  try {
    const uid = useUserStore.getState().id;
    if (!uid || items.length === 0) return;

    const { error } = await supabase
      .from('todo_daily')
      .upsert(
        { uid, day, items, checked, updated_at: new Date().toISOString() },
        { onConflict: 'uid,day' }
      );

    if (error) throw error;
  } catch (error) {
    if (!isOfflineError(error)) captureError({ error, prefix: '[TodoDailyAPI.upsert]: ' });
  }
};

export const TodoDailyAPI = { upsert };
