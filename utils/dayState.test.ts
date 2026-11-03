import { describe, expect, it } from 'vitest';
import { firstSeenTodoPlan, pickPrevDay, rememberDay, todoStep } from './dayState';

describe('pickPrevDay', () => {
  const global = { globalKnown: true, globalWeek: 2, globalDay: 3 };

  it('이 계정 기억이 있으면 그걸 쓴다 (기기 전역 값은 다른 계정 것일 수 있다)', () => {
    expect(
      pickPrevDay({
        uid: 'a',
        dayByUid: { a: { week: 1, day: 5 }, b: { week: 2, day: 3 } },
        ownerUid: 'b',
        ...global,
      })
    ).toEqual({ week: 1, day: 5 });
  });

  it('업데이트 직후(계정별 기억이 비어 있음): 남긴 계정을 모르거나 이 계정이면 전역 값을 이 계정 것으로', () => {
    expect(pickPrevDay({ uid: 'a', dayByUid: {}, ownerUid: null, ...global })).toEqual({
      week: 2,
      day: 3,
    });
    expect(pickPrevDay({ uid: 'a', dayByUid: {}, ownerUid: 'a', ...global })).toEqual({
      week: 2,
      day: 3,
    });
  });

  it('새로 깐 앱(전역 값이 기본값일 뿐)은 처음 보는 계정이다', () => {
    expect(
      pickPrevDay({ uid: 'a', dayByUid: {}, ownerUid: null, ...global, globalKnown: false })
    ).toBeNull();
  });

  it('업데이트 직후라도 전역 값을 다른 계정이 남겼으면 모른다(null)', () => {
    expect(pickPrevDay({ uid: 'a', dayByUid: {}, ownerUid: 'b', ...global })).toBeNull();
  });

  it('계정별 기억이 생긴 뒤 처음 보는 계정은 전역 값을 쓰지 않는다 (남긴 계정이 이 계정으로 바뀌었어도)', () => {
    const dayByUid = { b: { week: 3, day: 1 } };
    expect(pickPrevDay({ uid: 'a', dayByUid, ownerUid: 'b', ...global })).toBeNull();
    expect(pickPrevDay({ uid: 'a', dayByUid, ownerUid: 'a', ...global })).toBeNull();
    expect(pickPrevDay({ uid: 'a', dayByUid, ownerUid: null, ...global })).toBeNull();
  });
});

describe('rememberDay', () => {
  it('이 계정 값을 넣고 다른 계정 값은 그대로 둔다', () => {
    expect(rememberDay({ b: { week: 3, day: 1 } }, 'a', { week: 1, day: 2 })).toEqual({
      b: { week: 3, day: 1 },
      a: { week: 1, day: 2 },
    });
  });

  it('최근 계정만 남긴다 (가장 오래 안 들른 계정부터 뺀다)', () => {
    let map = {};
    for (const uid of ['a', 'b', 'c']) map = rememberDay(map, uid, { week: 1, day: 1 }, 2);
    expect(Object.keys(map)).toEqual(['b', 'c']);
    map = rememberDay(map, 'b', { week: 1, day: 2 }, 2); // 다시 들른 계정은 맨 뒤로
    map = rememberDay(map, 'd', { week: 1, day: 1 }, 2);
    expect(Object.keys(map)).toEqual(['b', 'd']);
  });

  it('같은 값이면 그대로 돌려준다 (저장을 줄인다)', () => {
    const map = { a: { week: 1, day: 2 } };
    expect(rememberDay(map, 'a', { week: 1, day: 2 })).toBe(map);
  });
});

describe('todoStep', () => {
  it('1주차는 1~3일 1단계, 4일부터 2단계, 2주차부터는 주차+1', () => {
    expect(todoStep(1, 3)).toBe(1);
    expect(todoStep(1, 4)).toBe(2);
    expect(todoStep(2, 1)).toBe(3);
    expect(todoStep(4, 7)).toBe(5);
  });
});

describe('firstSeenTodoPlan', () => {
  const todos = [
    { id: 0, value: '아침' },
    { id: 1, value: '점심' },
    { id: 2, value: '저녁' },
  ];

  it('오늘 기록이 없으면 초기화 (남은 체크는 어제 것)', () => {
    expect(firstSeenTodoPlan(null, todos)).toEqual({ kind: 'reset' });
  });

  it('오늘 기록이 있으면 그 체크로 맞춘다 (기록의 위치 → 할 일 id, 문구로 찾는다)', () => {
    // 단식일이라 점심이 빠진 목록: items[1] = 저녁
    expect(firstSeenTodoPlan({ items: ['아침', '저녁'], checked: [1] }, todos)).toEqual({
      kind: 'sync',
      checkedIds: [2],
    });
  });

  it('오늘 기록에 체크가 없으면 서버 체크를 건드리지 않는다 (빈 기록이 실제 체크보다 늦을 수 있다)', () => {
    expect(firstSeenTodoPlan({ items: ['아침', '점심', '저녁'], checked: [] }, todos)).toEqual({
      kind: 'keep',
    });
  });

  it('지금 목록에 없는 문구·범위 밖 위치는 건너뛴다', () => {
    expect(firstSeenTodoPlan({ items: ['아침', '옛 문구'], checked: [0, 1, 5] }, todos)).toEqual({
      kind: 'sync',
      checkedIds: [0],
    });
  });
});
