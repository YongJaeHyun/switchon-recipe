import { describe, expect, it } from 'vitest';
// @ts-expect-error 서버 공용 모듈은 .ts 확장자 import(Deno)라 앱 tsconfig에서 TS5097. 이 테스트만 예외.
import { WEEK_CHANGES as SERVER_WEEK_CHANGES } from '../supabase/functions/_shared/weeklyReport.ts';
import { WEEK_CHANGES } from './dietGuide';

// 주간 리포트(Edge Function)의 "다음 주 달라지는 점"이 앱 문구와 어긋나지 않는지 확인한다.
describe('WEEK_CHANGES 서버 복사본 일치', () => {
  it('앱 utils/dietGuide.ts와 같다', () => {
    expect(SERVER_WEEK_CHANGES).toEqual(WEEK_CHANGES);
  });
});
