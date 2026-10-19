interface PushRecord {
  title: string;
  body: string;
  href: string | null;
  channel_id: string;
}

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
