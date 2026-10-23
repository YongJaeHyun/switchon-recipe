import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 아직 원격에 적용하지 않은 주간 리포트 마이그레이션과 엣지 함수 연결을 글자 단위로 확인한다
// (로컬 DB 없이 돌리는 테스트라 SQL 동작 자체는 db push 전 dry-run으로 본다)
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const schema = () => read('../../../migrations/20261021020000_weight_report.sql');
const cron = () => read('../../../migrations/20261021020100_cron_weekly_report.sql');
const flat = (sql: string) => sql.replace(/\s+/g, ' ');

describe('weekly_report_candidates (리뷰 M1: 주차 일차 필터를 SQL로)', () => {
  it('service role 전용 security definer 함수로 오늘이 새 주차 1~3일차인 유저만 돌려준다', () => {
    const sql = flat(schema());
    expect(sql).toMatch(
      /create or replace function public\.weekly_report_candidates\(p_today date\) returns table \(uid uuid, start_date date\)/
    );
    expect(sql).toMatch(/weekly_report_candidates[\s\S]*security definer/);
    expect(sql).toMatch(/\(p_today - [^)]*\) % 7 < 3/);
    expect(sql).toMatch(/<= p_today - 7/);
    expect(sql).toContain(
      'revoke all on function public.weekly_report_candidates(date) from public, anon, authenticated;'
    );
    expect(sql).toContain(
      'grant execute on function public.weekly_report_candidates(date) to service_role;'
    );
  });

  it('엣지 함수는 user 테이블 전체 대신 rpc로 후보만 읽는다', () => {
    const src = read('../../generate-weekly-reports/index.ts');
    expect(src).toContain(".rpc('weekly_report_candidates', { p_today: today })");
    expect(src).not.toContain(".from('user')");
  });
});

describe('weight_reminder_sent (리뷰 M4: 같은 날 중복 알림 차단)', () => {
  it('(uid, day) 기본키 테이블, RLS 켜고 정책 없음', () => {
    const sql = flat(schema());
    expect(sql).toMatch(
      /create table public\.weight_reminder_sent \( uid uuid not null references public\.user \(id\) on delete cascade, day date not null, created_at timestamptz not null default now\(\), primary key \(uid, day\) \);/
    );
    expect(sql).toContain('alter table public.weight_reminder_sent enable row level security;');
    expect(sql).not.toMatch(/on public\.weight_reminder_sent/);
  });

  it('엣지 함수는 on conflict do nothing으로 새로 잡은 유저에게만 알림을 넣는다', () => {
    const src = read('../../weight-reminder/index.ts');
    expect(src).toContain(".from('weight_reminder_sent')");
    expect(src).toContain("onConflict: 'uid,day', ignoreDuplicates: true");
  });
});

describe('체중 알림 정리 cron (리뷰 M-e)', () => {
  it('7일 지난 WEIGHT_REMINDER 알림과 weight_reminder_sent 행을 매일 지운다', () => {
    const sql = flat(cron());
    expect(sql).toMatch(/cron\.schedule\( 'cleanup-weight-reminders', '40 19 \* \* \*'/);
    expect(sql).toMatch(
      /delete from public\.notifications where type = 'WEIGHT_REMINDER' and created_at < now\(\) - interval '7 days';/
    );
    expect(sql).toMatch(
      /delete from public\.weight_reminder_sent where day < \(now\(\) at time zone 'Asia\/Seoul'\)::date - 7;/
    );
  });
});

describe('fasting_result.fasted_minutes (일찍 끝낸 단식의 단식 시간)', () => {
  it('0~1440분 null 허용 열을 더한다 (result는 그대로)', () => {
    const sql = flat(read('../../../migrations/20261023010000_fasting_result_fasted_minutes.sql'));
    expect(sql).toMatch(
      /alter table public\.fasting_result add column if not exists fasted_minutes integer null check \(fasted_minutes between 0 and 1440\);/
    );
  });

  it('엣지 함수가 fasted_minutes를 읽는다', () => {
    const src = read('../../generate-weekly-reports/index.ts');
    expect(src).toContain(".select('day, result, fasted_minutes')");
  });
});
