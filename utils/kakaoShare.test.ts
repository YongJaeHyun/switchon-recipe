import { describe, expect, it } from 'vitest';
import { STORE_URL } from 'const/const';
import { APP_LOGO_URL } from 'const/kakaoTemplates';
import {
  completionMessage,
  completionShareTarget,
  dayFullCount,
  feedTemplate,
  inviteMessage,
  inviteNotice,
  inviteStartChoice,
  isDayString,
  monthDayLabel,
  programWeightLoss,
} from './kakaoShare';
import { buildCompletionCalendar } from './completionCalendar';

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

describe('completionMessage (완주 인증)', () => {
  it('주차를 마쳤으면 "N주차 완주"와 7일 중 완주한 날', () => {
    expect(completionMessage({ kind: 'week', week: 2, fullDays: 6 })).toEqual({
      title: '스위치온 2주차 완주! 🔥',
      description: '7일 중 6일 완주',
      buttonTitle: '나도 스위치온 해보기',
      imageUrl: APP_LOGO_URL,
      params: { share: 'completion' },
    });
  });

  it('완주 축하 시트는 그날 일차', () => {
    expect(completionMessage({ kind: 'day', week: 1, day: 3, fullDays: 3 }).title).toBe(
      '스위치온 1주차 3일차 완주! 🔥'
    );
  });

  it('아직 주차를 마치지 않았으면 도전 중', () => {
    expect(completionMessage({ kind: 'ongoing', week: 1, fullDays: 2 }).title).toBe(
      '스위치온 1주차 도전 중! 🔥'
    );
  });

  it('체중은 켠 경우만 붙인다', () => {
    expect(
      completionMessage({ kind: 'week', week: 1, fullDays: 7, weightLossKg: 2.04 }).description
    ).toBe('7일 중 7일 완주 · 감량 -2.0kg');
    expect(
      completionMessage({ kind: 'week', week: 1, fullDays: 7, weightLossKg: null }).description
    ).toBe('7일 중 7일 완주');
  });
});

describe('programWeightLoss (회차 첫 기록 대비 최근 감량)', () => {
  const logs = [
    { day: '2026-09-20', weight_kg: 80 },
    { day: '2026-10-07', weight_kg: 72.5 },
    { day: '2026-10-20', weight_kg: 71 },
    { day: '2026-10-30', weight_kg: 70.2 },
  ];

  it('회차 시작일 이후 첫 기록 − 최근 기록', () => {
    expect(programWeightLoss(logs, '2026-10-07', '2026-10-07')).toBe(2.3);
  });

  it('회차 시작일(program_start)이 시작일보다 앞이면 그때부터', () => {
    expect(programWeightLoss(logs, '2026-10-14', '2026-10-07')).toBe(2.3);
  });

  it('기록이 하나뿐이거나 줄지 않았으면 null (체크박스를 숨긴다)', () => {
    expect(programWeightLoss([logs[1]], '2026-10-07', null)).toBeNull();
    expect(
      programWeightLoss(
        [
          { day: '2026-10-07', weight_kg: 70 },
          { day: '2026-10-10', weight_kg: 70.4 },
        ],
        '2026-10-07',
        null
      )
    ).toBeNull();
    expect(programWeightLoss([], '2026-10-07', null)).toBeNull();
    expect(programWeightLoss(logs, null, null)).toBeNull();
  });
});

describe('dayFullCount (완주 축하 시트: 오늘까지 이번 주 완주한 날)', () => {
  it('오늘 앞 날 중 100%인 날 + 오늘', () => {
    expect(dayFullCount([100, 50, 100, 0, 0, 0, 0], 4)).toBe(3);
    expect(dayFullCount([100, 50, 100, 0, 0, 0, 0], 1)).toBe(1);
    expect(dayFullCount(undefined, 3)).toBe(1);
  });
});

describe('completionShareTarget (완주 달력에서 무엇을 자랑할지)', () => {
  const rates = [
    [100, 100, 100, 100, 50, 100, 100],
    [100, 0, 100, 100, 100, 100, 100],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ];
  const calendarAt = (week: number, day: number) =>
    buildCompletionCalendar(rates, { week, day, beforeStart: false });

  it('지난 주차 중 가장 최근 주차', () => {
    expect(
      completionShareTarget(calendarAt(3, 2), { week: 3, day: 2, beforeStart: false })
    ).toEqual({ kind: 'week', week: 2, fullDays: 6 });
  });

  it('1주차 중이면 도전 중', () => {
    expect(
      completionShareTarget(calendarAt(1, 4), { week: 1, day: 4, beforeStart: false })
    ).toEqual({ kind: 'ongoing', week: 1, fullDays: 4 });
  });

  it('유지기면 4주차', () => {
    const calendar = buildCompletionCalendar([rates[0], rates[1], rates[0], rates[1]], {
      week: 6,
      day: 1,
      beforeStart: false,
    });
    expect(completionShareTarget(calendar, { week: 6, day: 1, beforeStart: false })).toEqual({
      kind: 'week',
      week: 4,
      fullDays: 6,
    });
  });

  it('시작 전이거나 완주한 날이 없으면 null', () => {
    expect(
      completionShareTarget(calendarAt(1, 1), { week: 1, day: 1, beforeStart: true })
    ).toBeNull();
    expect(
      completionShareTarget(calendarAt(4, 2), { week: 4, day: 2, beforeStart: false })
    ).toBeNull();
  });
});
