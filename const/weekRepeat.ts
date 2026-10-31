import type { WeekRepeatAdvice } from 'utils/weekRepeat';

// 주차 진입 팝업의 '지난 주 돌아보기' 문구. 해요체, 측정값 차이만 말하고 의학적 단정은 하지 않는다.
// 책 근거(박용우 레시피북, 이미지 번호 기준)는 책 문장을 그대로 따온다:
const BOOK_BASIS = {
  // p018 왼쪽: 골격근이 충분히 회복되지 않았으면 "욕심내지 말고 3주 차를 한 주 더 하는 게 좋습니다."
  muscleWeek3:
    '책에서는 골격근이 충분히 회복되지 않았다면 "욕심내지 말고 3주 차를 한 주 더 하는 게 좋습니다"라고 해요.',
  // p011 왼쪽: 3주 차까지 골격근 유지·증가 + 체지방 감소일 때만 4주 차로. 아니면
  // "무리하지 말고 4주 차에도 3주 차를 한 번 더 실행하면 됩니다."
  resultWeek3:
    '책에서는 원하는 결과가 나오지 않았다면 "무리하지 말고 4주 차에도 3주 차를 한 번 더 실행하면 됩니다"라고 해요.',
  // p023 왼쪽 (사례): 2주 차에 근육이 회복되지 않아 3주 차에 2주 차를 한 번 더 했다
  week2: '책에도 2주 차에 근육이 회복되지 않아 3주 차에 2주 차를 한 번 더 한 사례가 나와요.',
} as const;

export interface WeekRepeatCopy {
  title: string;
  message: string;
  stats: { label: string; value: string }[] | null; // 시작 대비 차이: 골격근 -0.6kg, 체지방 -1.2kg
  basis: string | null; // 책 근거 한 줄
  repeatLabel: string;
  nextLabel: string;
}

const kg = (n: number) => `${Math.abs(n).toFixed(1).replace(/\.0$/, '')}kg`;
const signedKg = (n: number) => (n === 0 ? '그대로' : `${n > 0 ? '+' : '-'}${kg(n)}`);

const basisFor = (repeatWeek: number, muscleDiff: number | null) => {
  if (repeatWeek === 2) return BOOK_BASIS.week2;
  return muscleDiff == null || muscleDiff < 0 ? BOOK_BASIS.muscleWeek3 : BOOK_BASIS.resultWeek3;
};

// loadFailed: 체중 기록을 못 불러왔을 때(오프라인 등). 기록이 있을 수 있으니 "없어요"라고 하지 않는다
export function weekRepeatCopy(
  advice: Exclude<WeekRepeatAdvice, { kind: 'none' }>,
  options?: { loadFailed?: boolean }
): WeekRepeatCopy {
  const { repeatWeek } = advice;
  const nextWeek = repeatWeek + 1;
  const labels = {
    repeatLabel: `${repeatWeek}주차 한 주 더 하기`,
    nextLabel: `${nextWeek}주차로 넘어가기`,
  };

  if (advice.kind === 'noData' && options?.loadFailed) {
    return {
      title: '기록을 불러오지 못했어요',
      message:
        '시작할 때와 골격근을 비교하지 못했어요. 골격근이 시작할 때만큼 회복되지 않았다면 한 주 더 해도 괜찮아요.',
      stats: null,
      basis: basisFor(repeatWeek, null),
      ...labels,
    };
  }

  if (advice.kind === 'noData') {
    return {
      title: '인바디 기록이 없어요',
      message:
        '인바디를 재 봤다면 체중 기록에 골격근량·체지방량을 넣어 보세요. 골격근이 시작할 때만큼 회복되지 않았다면 한 주 더 해도 괜찮아요.',
      stats: null,
      basis: basisFor(repeatWeek, null),
      ...labels,
    };
  }

  const { muscleDiff, fatDiff } = advice;
  const stats = [{ label: '골격근', value: signedKg(muscleDiff) }];
  if (fatDiff != null) stats.push({ label: '체지방', value: signedKg(fatDiff) });

  if (advice.kind === 'onTrack') {
    const message =
      fatDiff != null && fatDiff < 0
        ? `골격근은 지키고 체지방은 ${kg(fatDiff)} 줄었어요. ${nextWeek}주차로 넘어가도 좋아요.`
        : `골격근을 잘 지켰어요. ${nextWeek}주차로 넘어가도 좋아요.`;
    return { title: '지난 주 돌아보기', message, stats, basis: null, ...labels };
  }

  const message =
    muscleDiff < 0
      ? `골격근이 시작할 때보다 ${kg(muscleDiff)} 적어요.`
      : `골격근은 지켰지만 체지방이 ${fatDiff === 0 || fatDiff == null ? '그대로예요' : `${kg(fatDiff)} 늘었어요`}.`;
  return {
    title: '지난 주 돌아보기',
    message,
    stats,
    basis: basisFor(repeatWeek, muscleDiff),
    ...labels,
  };
}

// "한 주 더 하기" 성공 토스트 (UserAPI.updateStartDate의 기본 "시작날짜 재설정" 문구 대신)
export function weekRepeatToast(repeatWeek: number, newStartDate: string) {
  const [, m, d] = newStartDate.slice(0, 10).split('-').map(Number);
  return {
    title: `${repeatWeek}주차를 한 주 더 해요`,
    subtitle: `시작일을 ${m}월 ${d}일로 옮겼어요`,
  };
}
