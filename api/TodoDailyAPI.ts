import { supabase } from 'lib/supabase';
import { useUserStore } from 'stores/userStore';
import { isNetworkError } from 'utils/networkError';
import { captureError } from 'utils/sendError';

// 오늘 할 일 기록(주간 리포트 재료). 할 일 체크는 오프라인에서도 되므로
// 실패해도 토스트 없이 넘어간다 (네트워크 오류는 Sentry에도 보내지 않음). 성공하면 true (실패하면 다시 보낼 수 있게)
const upsert = async ({
  day,
  items,
  checked,
}: {
  day: string;
  items: string[];
  checked: number[];
}): Promise<boolean> => {
  try {
    const uid = useUserStore.getState().id;
    if (!uid || items.length === 0) return false;

    const { error } = await supabase
      .from('todo_daily')
      .upsert(
        { uid, day, items, checked, updated_at: new Date().toISOString() },
        { onConflict: 'uid,day' }
      );

    if (error) throw error;
    return true;
  } catch (error) {
    if (!isNetworkError(error)) captureError({ error, prefix: '[TodoDailyAPI.upsert]: ' });
    return false;
  }
};

// 그날 첫 화면 진입 시 목록만 남긴다. 이미 행이 있으면(체크 기록) 건드리지 않는다
const insertIfAbsent = async ({
  day,
  items,
}: {
  day: string;
  items: string[];
}): Promise<boolean> => {
  try {
    const uid = useUserStore.getState().id;
    if (!uid || items.length === 0) return false;

    const { error } = await supabase
      .from('todo_daily')
      .upsert({ uid, day, items, checked: [] }, { onConflict: 'uid,day', ignoreDuplicates: true });

    if (error) throw error;
    return true;
  } catch (error) {
    if (!isNetworkError(error)) captureError({ error, prefix: '[TodoDailyAPI.insertIfAbsent]: ' });
    return false;
  }
};

// from~to(yyyy-MM-dd, 포함) 날짜의 할 일 기록 (주간 리포트 요일별 막대). 실패 시 throw: 호출부는 그래프를 숨긴다
const selectRange = async (
  from: string,
  to: string
): Promise<{ day: string; items: string[]; checked: number[] }[]> => {
  const uid = useUserStore.getState().id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from('todo_daily')
    .select('day, items, checked')
    .eq('uid', uid)
    .gte('day', from)
    .lte('day', to);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    day: String(row.day),
    items: row.items ?? [],
    checked: row.checked ?? [],
  }));
};

export const TodoDailyAPI = { upsert, insertIfAbsent, selectRange };
