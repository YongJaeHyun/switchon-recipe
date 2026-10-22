import { describe, expect, it } from 'vitest';
import type { ReportContent as ServerReportContent } from '../supabase/functions/_shared/weeklyReport.ts';
import type { WeeklyStats as ServerWeeklyStats } from '../supabase/functions/_shared/weeklyStats.ts';
import type { ReportContent, WeeklyStats } from './report';

// 앱 복사본과 서버 타입이 서로 대입 가능한지 tsc(npx tsc --noEmit)가 확인한다
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const contentSame: Same<ReportContent, ServerReportContent> = true;
const statsSame: Same<WeeklyStats, ServerWeeklyStats> = true;

describe('리포트 타입 서버 복사본', () => {
  it('서버 타입과 같은 모양이다 (tsc가 검사)', () => {
    expect(contentSame && statsSame).toBe(true);
  });
});
