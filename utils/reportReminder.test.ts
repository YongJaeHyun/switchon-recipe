import { describe, expect, it } from 'vitest';
import { reportReminderOnFrom } from './reportReminder';

describe('reportReminderOnFrom (user_setting → 리포트 알림 켜짐)', () => {
  it('아직 안 불러왔거나 행이 없으면 기본값 켜짐', () => {
    expect(reportReminderOnFrom(undefined)).toBe(true);
    expect(reportReminderOnFrom(null)).toBe(true);
  });

  it('마이그레이션 전 행(열 없음)도 켜짐', () => {
    expect(reportReminderOnFrom({})).toBe(true);
  });

  it('행이 있으면 report_reminder 그대로', () => {
    expect(reportReminderOnFrom({ report_reminder: true })).toBe(true);
    expect(reportReminderOnFrom({ report_reminder: false })).toBe(false);
  });
});
