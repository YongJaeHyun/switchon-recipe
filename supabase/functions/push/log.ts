// 푸시 발송 결과를 push_log에 남길 행 만들기 (순수 로직, Deno 함수와 Vitest 양쪽에서 로드).
// 알림을 못 받았다는 말이 오면 이 기록으로 어디서 끊겼는지(토큰 없음 / Expo 거절 / 오류) 본다

export type PushLogStatus = 'sent' | 'no_token' | 'expo_error' | 'failed';

export interface PushLogRow {
  notification_id: number | null;
  uid: string;
  type: string | null;
  status: PushLogStatus;
  ticket_id: string | null;
  error: string | null;
}

interface PushLogBase {
  notificationId: number | null;
  uid: string;
  type: string | null;
}

const ERROR_MAX = 500;
const clip = (text: string) => text.slice(0, ERROR_MAX);

const row = (
  base: PushLogBase,
  status: PushLogStatus,
  ticketId: string | null,
  error: string | null
): PushLogRow => ({
  notification_id: base.notificationId,
  uid: base.uid,
  type: base.type,
  status,
  ticket_id: ticketId,
  error: error === null ? null : clip(error),
});

// Expo push/send 응답 (메시지 1개): { data: { status: 'ok', id } } 또는 { data: { status: 'error', message, details } },
// 요청 자체가 틀리면 { errors: [{ code, message }] }
export function pushLogFromExpo(base: PushLogBase, response: unknown): PushLogRow {
  const res = (response ?? {}) as {
    data?: { status?: string; id?: string; message?: string; details?: { error?: string } };
    errors?: { code?: string; message?: string }[];
  };
  const ticket = Array.isArray(res.data) ? res.data[0] : res.data;
  if (ticket?.status === 'ok') return row(base, 'sent', ticket.id ?? null, null);
  if (ticket?.status === 'error') {
    const code = ticket.details?.error;
    return row(base, 'expo_error', null, code ? `${code}: ${ticket.message}` : `${ticket.message}`);
  }
  const first = res.errors?.[0];
  if (first) return row(base, 'expo_error', null, `${first.code}: ${first.message}`);
  return row(base, 'expo_error', null, JSON.stringify(response));
}

export function pushLogFromFailure(
  base: PushLogBase,
  status: 'no_token' | 'failed',
  error: unknown
): PushLogRow {
  if (status === 'no_token') return row(base, 'no_token', null, null);
  return row(base, 'failed', null, error instanceof Error ? error.message : String(error));
}
