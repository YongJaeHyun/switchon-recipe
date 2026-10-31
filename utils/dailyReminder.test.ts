import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  celebrationKey,
  markCelebratedDay,
  nextMorningReminder,
  shouldCelebrate,
  weightReminderOnFrom,
} from './dailyReminder';

const kst = (iso: string) => new Date(`${iso}+09:00`);

describe('nextMorningReminder (내일 09:00 KST 아침 리마인드)', () => {
  const startDate = '2026-10-30'; // 1주차 1일

  it('내일이 1주차 2일이면 내일 09:00 KST에 "2일차가 시작됐어요"', () => {
    expect(
      nextMorningReminder({ startDate, weightReminderOn: false, now: kst('2026-10-30T10:00') })
    ).toEqual({
      date: kst('2026-10-31T09:00'),
      title: '1주차 2일차',
      body: '2일차가 시작됐어요. 오늘 할 일을 확인해 보세요',
    });
  });

  it('내일이 1주차 7일이면 7일차', () => {
    expect(
      nextMorningReminder({ startDate, weightReminderOn: false, now: kst('2026-11-04T20:00') })
    ).toEqual({
      date: kst('2026-11-05T09:00'),
      title: '1주차 7일차',
      body: '7일차가 시작됐어요. 오늘 할 일을 확인해 보세요',
    });
  });

  it('내일이 2주차 1일이면 2주차 시작 알림', () => {
    expect(
      nextMorningReminder({ startDate, weightReminderOn: false, now: kst('2026-11-05T20:00') })
    ).toEqual({
      date: kst('2026-11-06T09:00'),
      title: '2주차 1일차',
      body: '2주차가 시작됐어요. 오늘 할 일을 확인해 보세요',
    });
  });

  it('내일이 2주차 2일 이후면 없다', () => {
    expect(
      nextMorningReminder({ startDate, weightReminderOn: false, now: kst('2026-11-06T10:00') })
    ).toBeNull();
    expect(
      nextMorningReminder({ startDate, weightReminderOn: false, now: kst('2026-12-01T10:00') })
    ).toBeNull();
  });

  it('시작 전날이면 시작일 09:00 KST에 1주차 시작 알림', () => {
    expect(
      nextMorningReminder({ startDate, weightReminderOn: false, now: kst('2026-10-29T10:00') })
    ).toEqual({
      date: kst('2026-10-30T09:00'),
      title: '1주차 1일차',
      body: '1주차가 시작됐어요. 오늘 할 일을 확인해 보세요',
    });
  });

  it('시작까지 이틀 이상 남았으면 없다', () => {
    expect(
      nextMorningReminder({ startDate, weightReminderOn: false, now: kst('2026-10-28T10:00') })
    ).toBeNull();
    expect(
      nextMorningReminder({ startDate, weightReminderOn: false, now: kst('2026-10-20T10:00') })
    ).toBeNull();
  });

  it('체중 기록 알림(09:00 서버 푸시)이 켜져 있으면 없다 (같은 시각 배너 두 개 방지)', () => {
    expect(
      nextMorningReminder({ startDate, weightReminderOn: true, now: kst('2026-10-30T10:00') })
    ).toBeNull();
    expect(
      nextMorningReminder({ startDate, weightReminderOn: true, now: kst('2026-10-29T10:00') })
    ).toBeNull();
  });

  it('체중 기록 알림 설정을 아직 모르면(불러오는 중·실패) 없다', () => {
    expect(
      nextMorningReminder({ startDate, weightReminderOn: undefined, now: kst('2026-10-30T10:00') })
    ).toBeNull();
  });

  it('시작일이 없으면 없다', () => {
    expect(
      nextMorningReminder({
        startDate: null,
        weightReminderOn: false,
        now: kst('2026-10-30T10:00'),
      })
    ).toBeNull();
    expect(
      nextMorningReminder({
        startDate: undefined,
        weightReminderOn: false,
        now: kst('2026-10-30T10:00'),
      })
    ).toBeNull();
  });

  it('시작일에 시각이 붙어 있어도 날짜만 본다', () => {
    expect(
      nextMorningReminder({
        startDate: '2026-10-30T00:00:00+09:00',
        weightReminderOn: false,
        now: kst('2026-10-30T10:00'),
      })?.date
    ).toEqual(kst('2026-10-31T09:00'));
  });

  describe('KST 날짜 경계 (기기 시간대가 KST가 아님)', () => {
    const originalTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = 'America/Los_Angeles';
    });
    afterAll(() => {
      process.env.TZ = originalTz;
    });

    it('KST 자정 직전이면 내일은 다음 KST 날짜', () => {
      // KST 10/30 23:59 = LA 10/30 07:59
      expect(
        nextMorningReminder({ startDate, weightReminderOn: false, now: kst('2026-10-30T23:59') })
          ?.date
      ).toEqual(kst('2026-10-31T09:00'));
    });

    it('KST 자정 직후면 하루 더 뒤 (LA는 아직 전날이어도)', () => {
      // KST 10/31 00:01 = LA 10/30 08:01
      expect(
        nextMorningReminder({ startDate, weightReminderOn: false, now: kst('2026-10-31T00:01') })
      ).toEqual({
        date: kst('2026-11-01T09:00'),
        title: '1주차 3일차',
        body: '3일차가 시작됐어요. 오늘 할 일을 확인해 보세요',
      });
    });

    it('KST 2주차 1일 자정 직후면 내일이 2주차 2일이라 없다', () => {
      expect(
        nextMorningReminder({ startDate, weightReminderOn: false, now: kst('2026-11-06T00:01') })
      ).toBeNull();
      expect(
        nextMorningReminder({ startDate, weightReminderOn: false, now: kst('2026-11-05T23:59') })
          ?.date
      ).toEqual(kst('2026-11-06T09:00'));
    });

    it('시작일·시작 전날 KST 자정 경계', () => {
      expect(
        nextMorningReminder({ startDate, weightReminderOn: false, now: kst('2026-10-30T00:00') })
          ?.date
      ).toEqual(kst('2026-10-31T09:00'));
      expect(
        nextMorningReminder({ startDate, weightReminderOn: false, now: kst('2026-10-29T23:59') })
          ?.date
      ).toEqual(kst('2026-10-30T09:00'));
      expect(
        nextMorningReminder({ startDate, weightReminderOn: false, now: kst('2026-10-28T23:59') })
      ).toBeNull();
      expect(
        nextMorningReminder({ startDate, weightReminderOn: false, now: kst('2026-10-29T00:01') })
          ?.date
      ).toEqual(kst('2026-10-30T09:00'));
    });
  });
});

describe('shouldCelebrate (1주차 완주 축하는 하루 한 번)', () => {
  const base = {
    week: 1,
    day: 3,
    completedRate: 100,
    prevRate: 75 as number | null,
    celebratedDays: [] as string[],
    today: '2026-11-01',
  };

  it('1주차에 오늘 할 일을 100% 끝내고 오늘 아직 안 봤으면 보여준다', () => {
    expect(shouldCelebrate(base)).toBe(true);
  });

  it('이번에 100%가 된 것만 (처음 읽은 값이 이미 100%거나, 자정에 어제 100%가 남아 있으면 아니다)', () => {
    expect(shouldCelebrate({ ...base, prevRate: null })).toBe(false);
    expect(shouldCelebrate({ ...base, prevRate: 100 })).toBe(false);
    expect(shouldCelebrate({ ...base, prevRate: 0 })).toBe(true);
  });

  it('100%가 아니면 아니다', () => {
    expect(shouldCelebrate({ ...base, completedRate: 75 })).toBe(false);
    expect(shouldCelebrate({ ...base, completedRate: Number.NaN })).toBe(false);
  });

  it('오늘 이미 봤으면 (체크를 풀었다 다시 100%가 돼도) 다시 안 보여준다', () => {
    expect(shouldCelebrate({ ...base, celebratedDays: ['2026-11-01'] })).toBe(false);
  });

  it('어제 본 건 오늘과 상관없다', () => {
    expect(shouldCelebrate({ ...base, celebratedDays: ['2026-10-31'] })).toBe(true);
  });

  it('1주차 1~7일이 아니면 아니다', () => {
    expect(shouldCelebrate({ ...base, week: 2, day: 1 })).toBe(false);
    expect(shouldCelebrate({ ...base, day: 0 })).toBe(false);
    expect(shouldCelebrate({ ...base, day: 8 })).toBe(false);
  });

  it('100% → 체크 풀기 → 다시 100%여도 축하는 한 번 (보여줄 때 오늘을 남긴다)', () => {
    let celebratedDays: string[] = [];
    let shown = 0;
    let prevRate: number | null = null;
    for (const completedRate of [50, 100, 75, 100, 100]) {
      if (shouldCelebrate({ ...base, completedRate, prevRate, celebratedDays })) {
        shown += 1;
        celebratedDays = markCelebratedDay(celebratedDays, base.today);
      }
      prevRate = completedRate;
    }
    expect(shown).toBe(1);
  });
});

describe('완주 축하: 같은 날 처음부터 다시 시작하면 새 1일차로 다시 축하', () => {
  const base = {
    week: 1,
    day: 1,
    completedRate: 100,
    prevRate: 50 as number | null,
    today: '2026-11-01',
  };

  it('축하 기록은 날짜 + 시작일 (오늘 다시 시작하면 다른 키)', () => {
    expect(celebrationKey('2026-11-01', '2026-10-30')).toBe('2026-11-01@2026-10-30');
    expect(celebrationKey('2026-11-01', '2026-10-30T00:00:00+09:00')).toBe('2026-11-01@2026-10-30');
    expect(celebrationKey('2026-11-01', null)).toBe('2026-11-01');
  });

  it('3일차에 축하를 봤어도, 오늘부터 다시 시작해 1일차를 끝내면 다시 축하', () => {
    const celebratedDays = [celebrationKey('2026-11-01', '2026-10-30')];
    expect(shouldCelebrate({ ...base, celebratedDays, startDate: '2026-11-01' })).toBe(true);
    expect(shouldCelebrate({ ...base, celebratedDays, startDate: '2026-10-30' })).toBe(false);
  });
});

describe('markCelebratedDay', () => {
  it('같은 날은 한 번만 남기고, 최근 14일만 둔다', () => {
    expect(markCelebratedDay(['a'], 'a')).toEqual(['a']);
    const days = Array.from({ length: 14 }, (_, i) => `d${i}`);
    expect(markCelebratedDay(days, 'new')).toEqual([...days.slice(1), 'new']);
  });
});

describe('weightReminderOnFrom (user_setting 캐시 → 체중 기록 알림 켜짐)', () => {
  it('아직 안 불러왔으면 모른다 (undefined)', () => {
    expect(weightReminderOnFrom(undefined)).toBeUndefined();
  });

  it('행이 없으면(null) 기본값 꺼짐', () => {
    expect(weightReminderOnFrom(null)).toBe(false);
  });

  it('행이 있으면 weight_reminder 그대로', () => {
    expect(weightReminderOnFrom({ weight_reminder: true })).toBe(true);
    expect(weightReminderOnFrom({ weight_reminder: false })).toBe(false);
  });
});
