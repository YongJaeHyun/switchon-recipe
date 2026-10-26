import { describe, expect, it } from 'vitest';
// @ts-expect-error 서버 공용 모듈은 .ts 확장자 import(Deno)라 앱 tsconfig에서 TS5097. 이 테스트만 예외.
import * as server from '../supabase/functions/_shared/fastingSchedule.ts';
import * as app from './fastingSchedule';

// 서버(Edge Function) 복사본이 앱 모듈과 같은 결과를 내는지 확인한다.
describe('fastingSchedule 서버 복사본 일치', () => {
  it('상수가 같다', () => {
    expect(server.FASTING_START_RANGE).toEqual(app.FASTING_START_RANGE);
    expect(server.QUICK_TIMES).toEqual(app.QUICK_TIMES);
  });

  it('함수 결과가 같다', () => {
    const rows = [
      { days: [4, 6], start_time: '저녁 식후', start_minutes: { '4': 780, '6': 1140 } },
      { days: [1, 3], start_time: '점심 식후' },
      { days: [1, 3], start_time: '저녁 식후', start_minutes: { '1': 600 } },
      { days: [1], start_time: null, start_minutes: { '1': '600', '5': 700 } },
      { days: [2], start_time: '아침 식후', start_minutes: [1, 2] },
      { days: null, start_time: null },
    ];
    for (const row of rows) expect(server.scheduleFrom(row)).toEqual(app.scheduleFrom(row));
    for (let m = 0; m < 1440; m += 30) {
      expect(server.legacyLabel(m)).toBe(app.legacyLabel(m));
      expect(server.formatMinutes(m)).toBe(app.formatMinutes(m));
    }
    expect(server.scheduleColumns([0, 4], { 0: 1140, 4: 780, 5: 600 })).toEqual(
      app.scheduleColumns([0, 4], { 0: 1140, 4: 780, 5: 600 })
    );
  });
});
