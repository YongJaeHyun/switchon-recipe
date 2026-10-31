// notifications.type. WEEKLY_REPORT·WEIGHT_REMINDER·REPORT_EVE_REMINDER는 cron 배치
// (generate-weekly-reports, weight-reminder, report-eve-reminder)가 넣는다
export type NotificationType =
  | 'INQUIRY'
  | 'INGREDIENT_REQUEST'
  | 'WEEKLY_REPORT'
  | 'WEIGHT_REMINDER'
  | 'REPORT_EVE_REMINDER';
// Android 알림 채널 (앱 const/channels.ts와 같은 값)
export type ChannelType = 'INQUIRY' | 'FASTING' | 'INGREDIENT' | 'REPORT';

interface PushRecord {
  title: string;
  body: string;
  href: string | null;
  channel_id: string;
}

// 알림을 누르면 앱(useNotificationObserver)이 data.href로 이동한다
// 푸시 토큰이 없는 유저(알림 미허용)에게는 보내지 않음. Expo가 "to: null" 오류를 돌려주기 때문
export const buildPushMessage = (record: PushRecord, pushToken: string | null | undefined) => {
  if (!pushToken) return null;
  return {
    to: pushToken,
    sound: 'default',
    title: record.title,
    body: record.body,
    data: { href: record.href },
    channelId: record.channel_id,
  };
};
