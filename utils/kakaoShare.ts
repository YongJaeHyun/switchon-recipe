import type { KakaoFeedTemplate, KakaoTemplateLink } from '@react-native-kakao/share';
import { STORE_URL } from 'const/const';
import { APP_LOGO_URL } from 'const/kakaoTemplates';
import {
  addDaysToDay,
  daysUntilStart,
  MAINTENANCE_WEEK,
  programWeekAndDay,
  startDateForWeekDay,
} from './programStart';

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
