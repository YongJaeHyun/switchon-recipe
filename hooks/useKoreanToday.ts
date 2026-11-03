import { useMutation } from '@tanstack/react-query';
import { TodoAPI } from 'api/TodoAPI';
import { TodoDailyAPI } from 'api/TodoDailyAPI';
import { BASE_TODOS } from 'const/baseTodos';
import { QueryKey } from 'const/queryKey';
import { addDays, startOfDay } from 'date-fns';
import { queryClient } from 'lib/queryClient';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import { getKoreanDate, getKoreanDateString } from 'utils/date';
import { firstSeenTodoPlan, pickPrevDay, todoStep, type DayMark } from 'utils/dayState';
import { BEFORE_START_DAY, revalidateTodayPlan } from 'utils/programStart';
import { decideWeekPopup, weekPopupKey } from 'utils/weekPopup';
import { useFasting } from './useFasting';
import { RESET_TODOS_MUTATION_KEY, useTodos } from './useTodos';

// 처음 보는 계정 맞추기가 도는 중인 계정 (앱 복귀가 겹쳐도 한 번만)
let firstSeenSyncingUid: string | null = null;

// 이 기기에서 처음 보는 계정: 서버 할 일 체크를 지우지 않고 오늘(KST) todo_daily 기록으로 맞춘다.
// 기록이 있으면 그 체크로, 없으면 남은 체크는 지난 날 것이라 비운다. 읽기·저장이 실패하면 아무것도 하지 않고
// 계정별 기억도 남기지 않아 다음 앱 복귀 때 다시 한다. 끝나면 이 계정의 오늘 주차·일차를 남긴다
async function syncFirstSeenDay({
  uid,
  today,
  mark,
}: {
  uid: string;
  today: string;
  mark: DayMark;
}) {
  if (firstSeenSyncingUid === uid) return;
  firstSeenSyncingUid = uid;
  try {
    let rows: Awaited<ReturnType<typeof TodoDailyAPI.selectRange>>;
    try {
      rows = await TodoDailyAPI.selectRange(today, today);
    } catch {
      return;
    }
    if (useUserStore.getState().id !== uid) return;

    const todos = (BASE_TODOS[todoStep(mark.week, mark.day)] ?? []).map((value, id) => ({
      id,
      value,
    }));
    const plan = firstSeenTodoPlan(
      rows.find((row) => row.day.slice(0, 10) === today),
      todos
    );
    // 오늘 빈 기록만 있으면 서버 체크를 그대로 두고 오늘 날짜만 기억한다
    if (plan.kind === 'keep') {
      useWeekCompletePopupStore.getState().rememberDay(uid, mark);
      return;
    }
    const checkedIds = plan.kind === 'sync' ? plan.checkedIds : [];

    const queryKey = [QueryKey.todos, uid];
    await queryClient.cancelQueries({ queryKey });
    const previous = queryClient.getQueryData<number[]>(queryKey);
    queryClient.setQueryData(queryKey, checkedIds);
    const saved = await TodoAPI.upsert(checkedIds);
    if (!saved) {
      if (previous) queryClient.setQueryData(queryKey, previous);
      return;
    }
    // 저장 전에 다시 읽은 값이 덮었을 수 있어 저장된 값으로 한 번 더
    queryClient.setQueryData(queryKey, saved.checked_ids ?? checkedIds);
    useWeekCompletePopupStore.getState().rememberDay(uid, mark);
  } finally {
    if (firstSeenSyncingUid === uid) firstSeenSyncingUid = null;
  }
}

export default function useKoreanToday() {
  const { isHydrated } = useWeekCompletePopupStore();
  const userId = useUserStore((state) => state.id);
  const start_date = useUserStore((state) => state.start_date);
  const { resetTodos } = useTodos();
  const { resetFasting } = useFasting();
  // 할 일 초기화와 같은 키: 맞추는 동안은 오늘 체크가 아직 오늘 것이 아닌 것으로 본다 (useTodos checksCurrent)
  const { mutate: syncFirstSeen } = useMutation({
    mutationKey: RESET_TODOS_MUTATION_KEY,
    mutationFn: syncFirstSeenDay,
  });

  const [today, setToday] = useState(getKoreanDateString({ formatType: 'date' }));

  const revalidateToday = useCallback(() => {
    const {
      close,
      week: globalWeek,
      day: globalDay,
      setWeek,
      setDay,
      isChecked,
      seenWeekKeys,
      ownerUid,
      setOwner,
      markWeekSeen,
      openWithKey,
      dayByUid,
      globalDayKnown,
      rememberDay,
    } = useWeekCompletePopupStore.getState();
    const newDay = getKoreanDateString({ formatType: 'date' });
    setToday(newDay);
    if (!userId) return;

    // 지난 주차·일차는 이 계정 기억으로 본다. null = 이 기기에서 처음 보는 계정
    const prev = pickPrevDay({
      uid: userId,
      dayByUid,
      ownerUid,
      globalKnown: globalDayKnown,
      globalWeek,
      globalDay,
    });

    // 시작 전에는 주차 팝업을 열지 않고 일차를 '시작 전'으로 둔다 (서버 초기화 없음) → 시작일에 할 일이 초기화된다.
    // 시작일을 아직 모르면(유저를 불러오기 전) 아무것도 하지 않는다: 빈 시작일을 1주차로 보면 저장 주차가 1로
    // 내려갔다가 진짜 시작일에서 다시 올라가 할 일·단식을 지우고 이미 본 주차 팝업을 다시 연다
    const next = revalidateTodayPlan({
      userId,
      startDate: start_date,
      today: newDay,
      prevWeek: prev?.week ?? globalWeek,
      prevDay: prev?.day ?? globalDay,
      isChecked,
    });
    if (!next) return;
    const mark = { week: next.week, day: next.day };

    // 전역 주차·일차는 언제나 지금 계정의 오늘 값으로 (화면 표시·할 일 목록·리뷰 묻기가 읽는다)
    if (next.week !== globalWeek) setWeek(next.week);
    if (next.day !== globalDay) setDay(next.day);

    if (prev) {
      // 같은 계정의 진짜 날짜 변경: 지금까지와 같다
      if (next.weekChanged) {
        if (next.resetFasting) resetFasting();
        if (next.closePopup) close();
      }
      // 한 주 더 하기처럼 같은 날 주차만 바뀌어도 할 일을 초기화한다
      if (next.resetTodos) resetTodos();
      rememberDay(userId, mark);
    } else if (next.day === BEFORE_START_DAY) {
      // 처음 보는 계정이 시작 전: 할 일·단식은 건드리지 않는다 (시작일에 초기화된다)
      rememberDay(userId, mark);
    } else {
      // 처음 보는 계정: 서버를 지우지 않고 오늘 기록으로 맞춘다. 단식 계획은 초기화하지 않는다
      syncFirstSeen({ uid: userId, today: newDay, mark });
    }

    // 팝업은 계정·프로그램·주차별로 한 번 (다른 계정에 들렀다 와도 이미 본 팝업은 다시 안 뜬다)
    if (start_date) {
      const decision = decideWeekPopup({
        uid: userId,
        startDate: start_date,
        week: next.week,
        beforeStart: false, // 시작 전이면 next.week가 1이라 열리지 않는다
        ruleOpen: next.openPopup,
        ownerUid,
        isChecked: next.weekChanged ? false : isChecked,
        seenKeys: seenWeekKeys,
      });
      if (decision.adoptOwner) setOwner(userId);
      if (decision.seenKey) markWeekSeen(decision.seenKey);
      if (decision.open) openWithKey(weekPopupKey(userId, start_date, next.week));
    }
  }, [userId, start_date, resetFasting, resetTodos, syncFirstSeen]);

  // 매일 자정에 다시 검증. 정리 함수를 돌려줘 언마운트·의존성 변경 시 타이머가 남지 않게 함
  const revalidateTodayInterval = useCallback(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNextMidnight = () => {
      const now = getKoreanDate();
      const nextMidnight = startOfDay(addDays(now, 1));

      timeoutId = setTimeout(() => {
        revalidateToday();
        scheduleNextMidnight();
      }, nextMidnight.getTime() - now.getTime());
    };

    scheduleNextMidnight();

    return () => clearTimeout(timeoutId);
  }, [revalidateToday]);

  useEffect(() => {
    if (!isHydrated) return;
    revalidateToday(); // 초기 검증

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        revalidateToday();
      }
    });

    const clearMidnightTimer = revalidateTodayInterval();

    return () => {
      subscription.remove();
      clearMidnightTimer();
    };
  }, [isHydrated, revalidateToday, revalidateTodayInterval]);

  return today;
}
