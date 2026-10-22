import { FASTING_DAYS, type FastingTime } from 'const/fastingDays';
import { fastingResultWindow, getFastingStatus, type FastingWeekContext } from 'utils/dietGuide';

// 오늘 탭 목록에서 식단 할 일 말고 더 보여줄 줄들
export interface TodayExtraRows {
  fastingProgress: boolean; // 단식 진행 중 → 목록 위 남은 시간 줄
  fastingResultDay: string | null; // 결과 질문 줄 (답했어도 창 안이면 결과+바꾸기로 표시)
  weight: true; // 체중 줄은 항상
  fastingDayLine: 'set' | 'unset' | null; // 목록 아래 단식 요일 줄: 설정됨 / 미설정 안내 / 단식 없는 주차
}

const MAINTENANCE_WEEK = 5;

export function todayExtraRows(input: {
  week: number;
  now: Date;
  fastingDays: number[];
  startTime: FastingTime | null | undefined;
  weekContext?: FastingWeekContext;
}): TodayExtraRows {
  const { week, now, fastingDays, startTime, weekContext } = input;
  // 1주차는 단식이 없다
  if (week < 2) {
    return { fastingProgress: false, fastingResultDay: null, weight: true, fastingDayLine: null };
  }

  const status = getFastingStatus(now, fastingDays, startTime);
  const resultDay = fastingResultWindow(now, fastingDays, startTime, weekContext)?.day ?? null;

  // 단식 요일 설정은 할 일 목록이 있는 2~4주차에만 (유지기는 할 일이 없어 설정 줄도 없었다)
  const fastingDayLine =
    week < MAINTENANCE_WEEK ? (fastingDays.length > 0 ? 'set' : 'unset') : null;

  return {
    fastingProgress: status.phase === 'fasting',
    fastingResultDay: resultDay,
    weight: true,
    fastingDayLine,
  };
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const kstDay = (date: Date) => new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

// 결과 질문 문구: 어제 시작한 단식이면 "어제", 아니면 시작일 날짜
export function fastingResultQuestion(day: string, now: Date): string {
  const yesterday = kstDay(new Date(now.getTime() - DAY_MS));
  if (day === yesterday) return '어제 단식 어땠나요?';
  const [, month, date] = day.split('-').map(Number);
  return `${month}월 ${date}일 단식 어땠나요?`;
}

// "목 저녁 식후", "화 & 금 점심 식후"
export function fastingDayText(days: number[], startTime: FastingTime | null | undefined): string {
  const dayText = days.map((d) => FASTING_DAYS[d]).join(' & ');
  return startTime ? `${dayText} ${startTime}` : dayText;
}
