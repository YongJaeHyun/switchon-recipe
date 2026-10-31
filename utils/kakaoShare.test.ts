import { describe, expect, it } from 'vitest';
import { STORE_URL } from 'const/const';
import { APP_LOGO_URL } from 'const/kakaoTemplates';
import {
  feedTemplate,
  inviteMessage,
  inviteNotice,
  inviteStartChoice,
  isDayString,
  monthDayLabel,
} from './kakaoShare';

describe('isDayString', () => {
  it('yyyy-MM-dd 실제 날짜만', () => {
    expect(isDayString('2026-11-02')).toBe(true);
    expect(isDayString('2026-02-30')).toBe(false);
    expect(isDayString('2026-1-2')).toBe(false);
    expect(isDayString('2026-11-02T00:00')).toBe(false);
    expect(isDayString('')).toBe(false);
    expect(isDayString(null)).toBe(false);
  });
});

describe('monthDayLabel', () => {
  it('M월 D일 (앞 0 없이)', () => {
    expect(monthDayLabel('2026-11-02')).toBe('11월 2일');
    expect(monthDayLabel('2026-01-10T09:00:00')).toBe('1월 10일');
  });
});

describe('inviteMessage (같이 하자 초대)', () => {
  const today = '2026-10-31';

  it('내일 시작이면 "내일부터"', () => {
    expect(inviteMessage({ startDate: '2026-11-01', today })).toEqual({
      title: '나 내일부터 스위치온 시작해!',
      description: '같이 할래? 11월 1일부터 1주차',
      buttonTitle: '같이 시작하기',
      imageUrl: APP_LOGO_URL,
      params: { invite: '2026-11-01' },
    });
  });

  it('오늘 시작이면 "오늘부터"', () => {
    const message = inviteMessage({ startDate: '2026-10-31', today });
    expect(message.title).toBe('나 오늘부터 스위치온 시작해!');
    expect(message.description).toBe('같이 할래? 10월 31일부터 1주차');
  });

  it('모레 이후면 날짜로, 시작일 뒤 시각은 떼고 보낸다', () => {
    const message = inviteMessage({ startDate: '2026-11-05T00:00:00', today });
    expect(message.title).toBe('나 11월 5일부터 스위치온 시작해!');
    expect(message.params).toEqual({ invite: '2026-11-05' });
  });

  it('이미 시작했으면 지금 주차·일차를 알려 준다', () => {
    const message = inviteMessage({ startDate: '2026-10-20', today });
    expect(message.title).toBe('나 10월 20일부터 스위치온 하는 중이야!');
    expect(message.description).toBe('같이 할래? 지금 2주차 5일이야');
    expect(message.params).toEqual({ invite: '2026-10-20' });
  });

  it('유지기면 "유지기"', () => {
    expect(inviteMessage({ startDate: '2026-09-01', today }).description).toBe(
      '같이 할래? 지금 유지기야'
    );
  });
});

describe('inviteStartChoice (온보딩 "언제부터 시작"의 친구 선택지)', () => {
  const today = '2026-10-31';

  it('친구 시작일이 오늘·미래면 같은 날 시작', () => {
    expect(inviteStartChoice('2026-11-02', today)).toEqual({
      kind: 'same',
      startDate: '2026-11-02',
      label: '친구와 같은 날 시작 (11/2)',
    });
    expect(inviteStartChoice('2026-10-31', today)).toEqual({
      kind: 'same',
      startDate: '2026-10-31',
      label: '친구와 같은 날 시작 (10/31)',
    });
  });

  it('지났으면 친구와 같은 주차·일차로 맞춘다 (startDateForWeekDay)', () => {
    expect(inviteStartChoice('2026-10-20', today)).toEqual({
      kind: 'align',
      startDate: '2026-10-20',
      label: '친구와 같은 주차로 맞추기 (2주차 5일)',
    });
  });

  it('친구가 유지기(4주 지남)면 선택지 없음', () => {
    expect(inviteStartChoice('2026-10-03', today)).toBeNull();
  });

  it('초대가 없거나 날짜가 깨졌으면 없음', () => {
    expect(inviteStartChoice(null, today)).toBeNull();
    expect(inviteStartChoice('oops', today)).toBeNull();
  });
});

describe('inviteNotice (이미 시작한 사람이 초대를 받으면 안내만)', () => {
  const today = '2026-10-31';

  it('친구가 시작 전이면 시작일을 알려 준다', () => {
    expect(inviteNotice('2026-11-02', today)).toEqual({
      title: '친구가 같이 하자고 초대했어요',
      subtitle: '친구는 11월 2일부터 시작해요. 시작일은 오늘 탭 설정에서 바꿀 수 있어요',
    });
  });

  it('친구가 이미 시작했으면 지금 주차', () => {
    expect(inviteNotice('2026-10-20', today)?.subtitle).toBe(
      '친구는 지금 2주차 5일이에요. 시작일은 오늘 탭 설정에서 바꿀 수 있어요'
    );
  });

  it('날짜가 깨졌으면 없음', () => {
    expect(inviteNotice('x', today)).toBeNull();
  });
});

describe('feedTemplate (템플릿 ID가 없을 때 기본 피드)', () => {
  it('내용·버튼 모두 앱 실행 파라미터로 열고, 앱을 못 열면 스토어', () => {
    const template = feedTemplate({
      title: 't',
      description: 'd',
      buttonTitle: 'b',
      imageUrl: 'https://img/a.png',
      params: { invite: '2026-11-02' },
    });
    const link = {
      androidExecutionParams: { invite: '2026-11-02' },
      iosExecutionParams: { invite: '2026-11-02' },
      webUrl: STORE_URL,
      mobileWebUrl: STORE_URL,
    };
    expect(template).toEqual({
      content: { title: 't', description: 'd', imageUrl: 'https://img/a.png', link },
      buttons: [{ title: 'b', link }],
    });
  });
});
