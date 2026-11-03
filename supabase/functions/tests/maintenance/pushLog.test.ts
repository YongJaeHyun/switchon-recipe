import { describe, expect, it } from 'vitest';
import { pushLogFromExpo, pushLogFromFailure } from '../../push/log.ts';

const base = { notificationId: 30, uid: 'u1', type: 'report_eve' };

describe('pushLogFromExpo', () => {
  it('Expo가 받았으면 sent와 티켓 id', () => {
    expect(pushLogFromExpo(base, { data: { status: 'ok', id: 'tk-1' } })).toEqual({
      notification_id: 30,
      uid: 'u1',
      type: 'report_eve',
      status: 'sent',
      ticket_id: 'tk-1',
      error: null,
    });
  });

  it('Expo가 거절하면 expo_error와 이유 (앱 삭제 등 DeviceNotRegistered)', () => {
    expect(
      pushLogFromExpo(base, {
        data: {
          status: 'error',
          message: 'not a registered push notification recipient',
          details: { error: 'DeviceNotRegistered' },
        },
      })
    ).toMatchObject({
      status: 'expo_error',
      ticket_id: null,
      error: 'DeviceNotRegistered: not a registered push notification recipient',
    });
  });

  it('요청 자체가 거절되면(errors 배열) expo_error', () => {
    expect(
      pushLogFromExpo(base, { errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS', message: 'x' }] })
    ).toMatchObject({ status: 'expo_error', error: 'PUSH_TOO_MANY_EXPERIENCE_IDS: x' });
  });

  it('모르는 모양이면 expo_error로 원문 일부', () => {
    expect(pushLogFromExpo(base, null)).toMatchObject({ status: 'expo_error', error: 'null' });
  });
});

describe('pushLogFromFailure', () => {
  it('토큰 없음', () => {
    expect(pushLogFromFailure(base, 'no_token', null)).toMatchObject({
      status: 'no_token',
      error: null,
    });
  });

  it('예외는 failed와 메시지 (길면 자름)', () => {
    const row = pushLogFromFailure(base, 'failed', new Error('x'.repeat(600)));
    expect(row.status).toBe('failed');
    expect(row.error?.length).toBe(500);
  });
});
