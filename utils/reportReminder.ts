// 리포트 알림 켜짐 (user_setting.report_reminder, 기본 켜짐).
// 행이 없거나(null) 아직 안 불러왔거나(undefined) 마이그레이션 전 행(열 없음)이면 켜짐 (서버도 false 행만 끈 것으로 본다)
export function reportReminderOnFrom(
  setting: { report_reminder?: boolean | null } | null | undefined
): boolean {
  return setting?.report_reminder ?? true;
}
