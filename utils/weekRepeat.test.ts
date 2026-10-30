import { weekRepeatCopy, weekRepeatToast } from 'const/weekRepeat';
import { describe, expect, it } from 'vitest';
import {
  addWeekRepeatAskedKey,
  shouldAskWeekRepeat,
  weekRepeatAdvice,
  weekRepeatKey,
} from './weekRepeat';

// 시작일 2026-10-01: 1주차 10-01~10-07, 2주차 10-08~10-14, 3주차 10-15~10-21, 4주차 10-22~10-28
const START = '2026-10-01';

const log = (day: string, muscle_kg: number | null, fat_kg: number | null = null) => ({
  day,
  muscle_kg,
  fat_kg,
});

describe('weekRepeatAdvice — 대상 주차', () => {
  const logs = [log('2026-10-01', 27.0, 20.0), log('2026-10-20', 26.0, 21.0)];

  it('1주차·2주차 진입, 5주차 이후는 none', () => {
    for (const enteringWeek of [1, 2, 5, 6]) {
      expect(weekRepeatAdvice({ logs, startDate: START, enteringWeek })).toEqual({ kind: 'none' });
    }
  });

  it('시작일이 없으면 none', () => {
    expect(weekRepeatAdvice({ logs, startDate: null, enteringWeek: 4 })).toEqual({ kind: 'none' });
  });

  it('3주차 진입 → 2주차를, 4주차 진입 → 3주차를 다시 할지 묻는다', () => {
    expect(weekRepeatAdvice({ logs: [], startDate: START, enteringWeek: 3 })).toEqual({
      kind: 'noData',
      repeatWeek: 2,
    });
    expect(weekRepeatAdvice({ logs: [], startDate: START, enteringWeek: 4 })).toEqual({
      kind: 'noData',
      repeatWeek: 3,
    });
  });
});

describe('weekRepeatAdvice — 판정', () => {
  it('골격근이 줄면 suggestRepeat (차이는 소수 한 자리)', () => {
    const logs = [log('2026-10-01', 27.3, 20.0), log('2026-10-20', 26.7, 18.8)];
    expect(weekRepeatAdvice({ logs, startDate: START, enteringWeek: 4 })).toEqual({
      kind: 'suggestRepeat',
      repeatWeek: 3,
      muscleDiff: -0.6,
      fatDiff: -1.2,
    });
  });

  it('3주차 끝: 골격근 유지·증가 + 체지방 감소면 onTrack', () => {
    const logs = [log('2026-10-01', 27.0, 20.0), log('2026-10-20', 27.0, 18.8)];
    expect(weekRepeatAdvice({ logs, startDate: START, enteringWeek: 4 })).toEqual({
      kind: 'onTrack',
      repeatWeek: 3,
      muscleDiff: 0,
      fatDiff: -1.2,
    });
  });

  it('3주차 끝: 골격근은 늘었어도 체지방이 그대로거나 늘면 suggestRepeat', () => {
    const same = [log('2026-10-01', 27.0, 20.0), log('2026-10-20', 27.4, 20.0)];
    expect(weekRepeatAdvice({ logs: same, startDate: START, enteringWeek: 4 })).toMatchObject({
      kind: 'suggestRepeat',
      muscleDiff: 0.4,
      fatDiff: 0,
    });
    const more = [log('2026-10-01', 27.0, 20.0), log('2026-10-20', 27.4, 20.5)];
    expect(weekRepeatAdvice({ logs: more, startDate: START, enteringWeek: 4 })).toMatchObject({
      kind: 'suggestRepeat',
      fatDiff: 0.5,
    });
  });

  it('2주차 끝: 체지방은 보지 않고 골격근만 본다', () => {
    const logs = [log('2026-10-01', 27.0, 20.0), log('2026-10-13', 27.0, 20.5)];
    expect(weekRepeatAdvice({ logs, startDate: START, enteringWeek: 3 })).toEqual({
      kind: 'onTrack',
      repeatWeek: 2,
      muscleDiff: 0,
      fatDiff: 0.5,
    });
    const down = [log('2026-10-01', 27.0, 20.0), log('2026-10-13', 26.9, 19.0)];
    expect(weekRepeatAdvice({ logs: down, startDate: START, enteringWeek: 3 })).toMatchObject({
      kind: 'suggestRepeat',
      repeatWeek: 2,
      muscleDiff: -0.1,
    });
  });

  it('골격근만 입력했으면 골격근만으로 판정하고 fatDiff는 null', () => {
    const up = [log('2026-10-01', 27.0), log('2026-10-20', 27.2)];
    expect(weekRepeatAdvice({ logs: up, startDate: START, enteringWeek: 4 })).toEqual({
      kind: 'onTrack',
      repeatWeek: 3,
      muscleDiff: 0.2,
      fatDiff: null,
    });
    const down = [log('2026-10-01', 27.0), log('2026-10-20', 26.5)];
    expect(weekRepeatAdvice({ logs: down, startDate: START, enteringWeek: 4 })).toEqual({
      kind: 'suggestRepeat',
      repeatWeek: 3,
      muscleDiff: -0.5,
      fatDiff: null,
    });
  });

  it('체지방은 기준·최근 둘 다 있을 때만 비교한다', () => {
    const logs = [log('2026-10-01', 27.0), log('2026-10-20', 27.0, 18.0)];
    expect(weekRepeatAdvice({ logs, startDate: START, enteringWeek: 4 })).toMatchObject({
      kind: 'onTrack',
      fatDiff: null,
    });
  });

  it('체지방만 있는 기록(골격근 없음)은 인바디 기록으로 치지 않는다', () => {
    const logs = [log('2026-10-01', null, 20.0), log('2026-10-20', null, 18.0)];
    expect(weekRepeatAdvice({ logs, startDate: START, enteringWeek: 4 })).toEqual({
      kind: 'noData',
      repeatWeek: 3,
    });
  });

  it('체중만 있는 기록(인바디 키 없음)도 무시한다', () => {
    const logs = [{ day: '2026-10-01' }, { day: '2026-10-20' }];
    expect(weekRepeatAdvice({ logs, startDate: START, enteringWeek: 4 })).toEqual({
      kind: 'noData',
      repeatWeek: 3,
    });
  });
});

describe('weekRepeatAdvice — 기준값 (시작 무렵)', () => {
  it('시작 7일 전 기록도 기준값이 된다 (경계 포함)', () => {
    const logs = [log('2026-09-24', 28.0), log('2026-10-20', 27.0)];
    expect(weekRepeatAdvice({ logs, startDate: START, enteringWeek: 4 })).toMatchObject({
      kind: 'suggestRepeat',
      muscleDiff: -1,
    });
  });

  it('시작 8일 전 기록은 기준값이 아니다 → 기간 안 첫 기록', () => {
    const logs = [log('2026-09-23', 28.0), log('2026-10-05', 26.5), log('2026-10-20', 27.0)];
    expect(weekRepeatAdvice({ logs, startDate: START, enteringWeek: 4 })).toMatchObject({
      kind: 'onTrack',
      muscleDiff: 0.5,
    });
  });

  it('시작 2일 뒤 기록까지 기준 구간 (경계 포함), 구간 안에서는 가장 늦은 것', () => {
    const logs = [log('2026-09-28', 30.0), log('2026-10-03', 27.0), log('2026-10-20', 26.8)];
    expect(weekRepeatAdvice({ logs, startDate: START, enteringWeek: 4 })).toMatchObject({
      kind: 'suggestRepeat',
      muscleDiff: -0.2,
    });
  });

  it('시작 3일 뒤 기록은 구간 밖: 구간에 없으면 기간 안 첫 기록을 쓴다', () => {
    const logs = [log('2026-10-04', 27.0), log('2026-10-09', 25.0), log('2026-10-20', 27.5)];
    expect(weekRepeatAdvice({ logs, startDate: START, enteringWeek: 4 })).toMatchObject({
      kind: 'onTrack',
      muscleDiff: 0.5,
    });
  });
});

describe('weekRepeatAdvice — 최근값', () => {
  it('지난 주 안의 마지막 기록을 쓴다 (지난 주 이후 기록은 보지 않음)', () => {
    const logs = [
      log('2026-10-01', 27.0),
      log('2026-10-15', 26.0),
      log('2026-10-21', 27.1),
      log('2026-10-22', 20.0),
    ];
    expect(weekRepeatAdvice({ logs, startDate: START, enteringWeek: 4 })).toMatchObject({
      kind: 'onTrack',
      muscleDiff: 0.1,
    });
  });

  it('지난 주에 기록이 없으면 그 전 주 마지막 기록', () => {
    const logs = [log('2026-10-01', 27.0), log('2026-10-10', 26.4)];
    expect(weekRepeatAdvice({ logs, startDate: START, enteringWeek: 4 })).toMatchObject({
      kind: 'suggestRepeat',
      muscleDiff: -0.6,
    });
  });

  it('최근값이 기준값과 같은 날이면 비교할 수 없어 noData', () => {
    const logs = [log('2026-10-02', 27.0)];
    expect(weekRepeatAdvice({ logs, startDate: START, enteringWeek: 4 })).toEqual({
      kind: 'noData',
      repeatWeek: 3,
    });
  });

  it('기준 구간에 없고 기간 안 기록이 하나뿐(지난 주)이면 noData', () => {
    const logs = [log('2026-10-20', 27.0)];
    expect(weekRepeatAdvice({ logs, startDate: START, enteringWeek: 4 })).toEqual({
      kind: 'noData',
      repeatWeek: 3,
    });
  });

  it('기록 순서가 뒤섞여 있어도 날짜로 고른다', () => {
    const logs = [log('2026-10-20', 26.7), log('2026-10-01', 27.3), log('2026-10-16', 30.0)];
    expect(weekRepeatAdvice({ logs, startDate: START, enteringWeek: 4 })).toMatchObject({
      kind: 'suggestRepeat',
      muscleDiff: -0.6,
    });
  });

  it('시작일에 시각이 붙어 있어도 날짜만 본다', () => {
    const logs = [log('2026-10-01', 27.3), log('2026-10-20', 26.7)];
    expect(
      weekRepeatAdvice({ logs, startDate: '2026-10-01T00:00:00', enteringWeek: 4 })
    ).toMatchObject({ kind: 'suggestRepeat', muscleDiff: -0.6 });
  });
});

describe('같은 전환에서 한 번만 묻기', () => {
  it('키 = 시작일 + 진입 주차', () => {
    expect(weekRepeatKey('2026-10-01', 4)).toBe('2026-10-01:4');
    expect(weekRepeatKey('2026-10-01T00:00:00', 3)).toBe('2026-10-01:3');
  });

  it('3·4주차 진입이고 아직 안 물었을 때만 묻는다', () => {
    expect(shouldAskWeekRepeat({ startDate: START, week: 3, askedKeys: [] })).toBe(true);
    expect(shouldAskWeekRepeat({ startDate: START, week: 4, askedKeys: [] })).toBe(true);
    expect(shouldAskWeekRepeat({ startDate: START, week: 2, askedKeys: [] })).toBe(false);
    expect(shouldAskWeekRepeat({ startDate: START, week: 5, askedKeys: [] })).toBe(false);
    expect(shouldAskWeekRepeat({ startDate: null, week: 4, askedKeys: [] })).toBe(false);
  });

  it('물은 키를 더하면 같은 전환에서는 다시 묻지 않는다', () => {
    const asked = addWeekRepeatAskedKey([], weekRepeatKey(START, 4));
    expect(shouldAskWeekRepeat({ startDate: START, week: 4, askedKeys: asked })).toBe(false);
    // 다른 전환(3주차 진입)은 따로
    expect(shouldAskWeekRepeat({ startDate: START, week: 3, askedKeys: asked })).toBe(true);
  });

  it('한 주 더 해서 시작일이 바뀌면 새 전환으로 본다', () => {
    const asked = addWeekRepeatAskedKey([], weekRepeatKey(START, 4));
    expect(shouldAskWeekRepeat({ startDate: '2026-10-08', week: 4, askedKeys: asked })).toBe(true);
  });

  it('같은 키는 한 번만 저장하고, 오래된 키는 잘라 낸다 (최근 20개)', () => {
    expect(addWeekRepeatAskedKey(['a'], 'a')).toEqual(['a']);
    let keys: string[] = [];
    for (let i = 0; i < 25; i++) keys = addWeekRepeatAskedKey(keys, `k${i}`);
    expect(keys).toHaveLength(20);
    expect(keys[0]).toBe('k5');
    expect(keys[19]).toBe('k24');
  });
});

describe('weekRepeatCopy (팝업 문구)', () => {
  it('골격근 감소 → 감소량 + p018 근거 (3주차)', () => {
    const c = weekRepeatCopy({
      kind: 'suggestRepeat',
      repeatWeek: 3,
      muscleDiff: -0.6,
      fatDiff: -1.2,
    });
    expect(c.message).toBe('골격근이 시작할 때보다 0.6kg 적어요.');
    expect(c.basis).toContain('욕심내지 말고 3주 차를 한 주 더 하는 게 좋습니다');
    expect(c.stats).toEqual([
      { label: '골격근', value: '-0.6kg' },
      { label: '체지방', value: '-1.2kg' },
    ]);
    expect(c.repeatLabel).toBe('3주차 한 주 더 하기');
    expect(c.nextLabel).toBe('4주차로 넘어가기');
  });

  it('골격근은 지켰지만 체지방이 안 줄었으면 p011 근거', () => {
    const c = weekRepeatCopy({ kind: 'suggestRepeat', repeatWeek: 3, muscleDiff: 0.4, fatDiff: 0 });
    expect(c.message).toBe('골격근은 지켰지만 체지방이 그대로예요.');
    expect(c.basis).toContain('무리하지 말고 4주 차에도 3주 차를 한 번 더 실행하면 됩니다');
  });

  it('2주차 끝 제안은 p023 사례를 근거로', () => {
    const c = weekRepeatCopy({
      kind: 'suggestRepeat',
      repeatWeek: 2,
      muscleDiff: -0.3,
      fatDiff: null,
    });
    expect(c.basis).toContain('2주 차를 한 번 더');
    expect(c.stats).toEqual([{ label: '골격근', value: '-0.3kg' }]);
    expect(c.nextLabel).toBe('3주차로 넘어가기');
  });

  it('차이가 0이면 "그대로", 늘면 +', () => {
    const c = weekRepeatCopy({ kind: 'onTrack', repeatWeek: 3, muscleDiff: 0, fatDiff: 0.5 });
    expect(c.stats).toEqual([
      { label: '골격근', value: '그대로' },
      { label: '체지방', value: '+0.5kg' },
    ]);
  });

  it('onTrack: 축하 한 줄', () => {
    expect(
      weekRepeatCopy({ kind: 'onTrack', repeatWeek: 3, muscleDiff: 0, fatDiff: -1.2 }).message
    ).toBe('골격근은 지키고 체지방은 1.2kg 줄었어요. 4주차로 넘어가도 좋아요.');
    expect(
      weekRepeatCopy({ kind: 'onTrack', repeatWeek: 2, muscleDiff: 0.2, fatDiff: null }).message
    ).toBe('골격근을 잘 지켰어요. 3주차로 넘어가도 좋아요.');
  });

  it('noData: 측정 권유', () => {
    const c = weekRepeatCopy({ kind: 'noData', repeatWeek: 3 });
    expect(c.title).toBe('인바디 기록이 없어요');
    expect(c.message).toBe(
      '인바디를 재 봤다면 체중 기록에 골격근량·체지방량을 넣어 보세요. 골격근이 시작할 때만큼 회복되지 않았다면 한 주 더 해도 괜찮아요.'
    );
    expect(c.stats).toBeNull();
  });

  it('한 주 더 하기 성공 토스트', () => {
    expect(weekRepeatToast(3, '2026-10-08')).toEqual({
      title: '3주차를 한 주 더 해요',
      subtitle: '시작일을 10월 8일로 옮겼어요',
    });
  });
});

describe('weekRepeatCopy 기록을 못 불러왔을 때', () => {
  it('"기록이 없어요"라고 단정하지 않고 중립 문구 + 같은 두 버튼', () => {
    const c = weekRepeatCopy({ kind: 'noData', repeatWeek: 3 }, { loadFailed: true });
    expect(c.title).toBe('기록을 불러오지 못했어요');
    expect(c.title).not.toContain('없어요');
    expect(c.message).not.toContain('없어요');
    expect(c.stats).toBeNull();
    expect(c.repeatLabel).toBe('3주차 한 주 더 하기');
    expect(c.nextLabel).toBe('4주차로 넘어가기');
  });

  it('불러온 경우(loadFailed 없음)는 그대로 "인바디 기록이 없어요"', () => {
    expect(weekRepeatCopy({ kind: 'noData', repeatWeek: 3 }, { loadFailed: false }).title).toBe(
      '인바디 기록이 없어요'
    );
  });
});
