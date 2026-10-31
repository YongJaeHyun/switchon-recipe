import type { KakaoFeedTemplate, KakaoTemplateLink } from '@react-native-kakao/share';
import { STORE_URL } from 'const/const';
import { APP_LOGO_URL } from 'const/kakaoTemplates';
import type { Nullable } from 'types/common';
import type { CompletionCalendar } from './completionCalendar';
import {
  addDaysToDay,
  daysUntilStart,
  MAINTENANCE_WEEK,
  programWeekAndDay,
  startDateForWeekDay,
} from './programStart';
import type { ProgramProgress } from './todoRateWeeks';
import { round1, weightChange, type WeightPoint } from './weight';

// 카톡으로 보내는 메시지 내용 (순수). 보내기는 utils/shareKakao, 받은 링크 해석은 utils/kakaoLink

export interface KakaoShareMessage {
  title: string;
  description: string;
  buttonTitle: string;
  imageUrl: string;
  // 버튼·내용을 누르면 앱에 넘길 실행 파라미터 (app/kakaolink가 읽는다)
  params: Record<string, string>;
}

// yyyy-MM-dd 이면서 실제로 있는 날짜인지
export function isDayString(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return addDaysToDay(value, 0) === value;
}

const monthDay = (day: string) => {
  const [, m, d] = day.slice(0, 10).split('-').map(Number);
  return { m, d };
};

// '2026-11-02' → '11월 2일'
export function monthDayLabel(day: string): string {
  const { m, d } = monthDay(day);
  return `${m}월 ${d}일`;
}

// '2026-11-02' → '11/2'
const slashLabel = (day: string) => {
  const { m, d } = monthDay(day);
  return `${m}/${d}`;
};

// 지금 주차·일차 문구 (유지기는 '유지기')
const progressLabel = (startDate: string, today: string) => {
  const { week, day } = programWeekAndDay(startDate, today);
  return week >= MAINTENANCE_WEEK ? '유지기' : `${week}주차 ${day}일`;
};

// 받침에 따라 '이야/야', '이에요/예요'
const withCopula = (word: string, afterConsonant: string, afterVowel: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (hasFinal ? afterConsonant : afterVowel);
};

// ── 같이 하자 초대 (invite=<시작일>)

const startWord = (startDate: string, today: string) => {
  const until = daysUntilStart(startDate, today);
  if (until === 0) return '오늘';
  if (until === 1) return '내일';
  return monthDayLabel(startDate);
};

export function inviteMessage({
  startDate,
  today,
}: {
  startDate: string;
  today: string;
}): KakaoShareMessage {
  const start = startDate.slice(0, 10);
  const started = daysUntilStart(start, today) < 0;
  return {
    title: started
      ? `나 ${monthDayLabel(start)}부터 스위치온 하는 중이야!`
      : `나 ${startWord(start, today)}부터 스위치온 시작해!`,
    description: started
      ? `같이 할래? 지금 ${withCopula(progressLabel(start, today), '이야', '야')}`
      : `같이 할래? ${monthDayLabel(start)}부터 1주차`,
    buttonTitle: '같이 시작하기',
    imageUrl: APP_LOGO_URL,
    params: { invite: start },
  };
}

export type InviteStartChoice = { kind: 'same' | 'align'; startDate: string; label: string };

// 초대받은 새 사용자의 온보딩 "언제부터 시작" 맨 위 선택지.
// 친구 시작일이 오늘·미래면 같은 날, 지났으면 친구와 같은 주차·일차(startDateForWeekDay, 시작일도 친구와 같다).
// 친구가 이미 유지기면 맞출 주차가 없어 null
export function inviteStartChoice(
  invite: string | null | undefined,
  today: string
): InviteStartChoice | null {
  if (!isDayString(invite)) return null;
  if (daysUntilStart(invite, today) >= 0) {
    return {
      kind: 'same',
      startDate: invite,
      label: `친구와 같은 날 시작 (${slashLabel(invite)})`,
    };
  }
  const { week, day } = programWeekAndDay(invite, today);
  if (week >= MAINTENANCE_WEEK) return null;
  return {
    kind: 'align',
    startDate: startDateForWeekDay(today, week, day),
    label: `친구와 같은 주차로 맞추기 (${week}주차 ${day}일)`,
  };
}

// 이미 시작일이 있는 사람이 초대를 받으면 시작일은 그대로 두고 안내만 한다
export function inviteNotice(
  invite: string | null | undefined,
  today: string
): { title: string; subtitle: string } | null {
  if (!isDayString(invite)) return null;
  const friend =
    daysUntilStart(invite, today) >= 0
      ? `친구는 ${monthDayLabel(invite)}부터 시작해요`
      : `친구는 지금 ${withCopula(progressLabel(invite, today), '이에요', '예요')}`;
  return {
    title: '친구가 같이 하자고 초대했어요',
    subtitle: `${friend}. 시작일은 오늘 탭 설정에서 바꿀 수 있어요`,
  };
}

// ── 완주 인증 (자랑하기). 받은 사람은 앱만 연다 (share=completion → app/kakaolink → 시작 화면)

// week = 그 주차를 마침, day = 완주 축하 시트(그날 일차), ongoing = 아직 이번 주 중
export type CompletionShare =
  | { kind: 'week'; week: number; fullDays: number }
  | { kind: 'day'; week: number; day: number; fullDays: number }
  | { kind: 'ongoing'; week: number; fullDays: number };

export function completionMessage(
  share: CompletionShare & { weightLossKg?: number | null }
): KakaoShareMessage {
  const title =
    share.kind === 'day'
      ? `스위치온 ${share.week}주차 ${share.day}일차 완주! 🔥`
      : share.kind === 'week'
        ? `스위치온 ${share.week}주차 완주! 🔥`
        : `스위치온 ${share.week}주차 도전 중! 🔥`;
  // 체중은 사용자가 켠 경우만 (기본 꺼짐)
  const weight = share.weightLossKg ? ` · 감량 -${round1(share.weightLossKg).toFixed(1)}kg` : '';
  return {
    title,
    description: `7일 중 ${share.fullDays}일 완주${weight}`,
    buttonTitle: '나도 스위치온 해보기',
    imageUrl: APP_LOGO_URL,
    params: { share: 'completion' },
  };
}

// 이번 회차(program_start부터) 첫 체중 기록 대비 최근 기록이 준 만큼 (kg). 기록이 둘 미만이거나 줄지 않았으면 null
// (null이면 "감량한 체중도 함께 보내기"를 숨긴다)
export function programWeightLoss(
  logs: WeightPoint[],
  startDate: string | null | undefined,
  programStart: string | null | undefined
): number | null {
  if (!startDate) return null;
  const change = weightChange(logs, startDate, { programStart });
  if (!change || change.diff >= 0) return null;
  return round1(-change.diff);
}

// 완주 축하 시트: 오늘(day일차, 방금 100%)까지 이번 주 완주한 날. 오늘 통계는 아직 안 올라갔을 수 있어 오늘은 센다
export function dayFullCount(weekRates: Nullable<number>[] | undefined, day: number): number {
  const before = (weekRates ?? []).slice(0, day - 1).filter((rate) => (rate ?? 0) >= 100).length;
  return before + 1;
}

const PROGRAM_WEEKS = 4;

// 완주 달력의 자랑하기: 마친 주차 중 가장 최근(유지기면 4주차), 1주차 중이면 이번 주(도전 중).
// 시작 전이거나 그 주에 완주한 날이 없으면 null (버튼을 숨긴다)
export function completionShareTarget(
  calendar: CompletionCalendar,
  progress: ProgramProgress
): Extract<CompletionShare, { kind: 'week' | 'ongoing' }> | null {
  if (progress.beforeStart) return null;
  const finished = Math.min(progress.week - 1, PROGRAM_WEEKS);
  const week = finished >= 1 ? finished : 1;
  const fullDays = calendar.weeks[week - 1]?.counts.full ?? 0;
  if (fullDays === 0) return null;
  return finished >= 1 ? { kind: 'week', week, fullDays } : { kind: 'ongoing', week, fullDays };
}

// ── 기본 피드 메시지 (콘솔 템플릿이 없을 때)

// 내용·버튼 모두 앱을 연다 (실행 파라미터 → app/kakaolink). 앱을 못 여는 곳(PC 카톡 등)은 스토어
export function feedTemplate(message: KakaoShareMessage): KakaoFeedTemplate {
  const link: KakaoTemplateLink = {
    androidExecutionParams: message.params,
    iosExecutionParams: message.params,
    webUrl: STORE_URL,
    mobileWebUrl: STORE_URL,
  };
  return {
    content: {
      title: message.title,
      description: message.description,
      imageUrl: message.imageUrl,
      link,
    },
    buttons: [{ title: message.buttonTitle, link }],
  };
}
