import { describe, expect, it } from 'vitest';
import {
  buildFeedbackSlackText,
  FEEDBACK_MAX_LENGTH,
  isFeedbackRateLimited,
  parseFeedbackRequest,
  sanitizeFeedbackMessage,
} from '../../_shared/feedback.ts';

describe('sanitizeFeedbackMessage', () => {
  it('앞뒤 공백을 지우고 제어 문자를 빼며 줄바꿈은 남긴다', () => {
    expect(sanitizeFeedbackMessage('  재료가\u0000 적어요\r\n더 있으면\t좋겠어요  ')).toBe(
      '재료가 적어요\n더 있으면 좋겠어요'
    );
  });

  it('빈 줄이 여러 개면 하나로 줄인다', () => {
    expect(sanitizeFeedbackMessage('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('최대 길이를 넘으면 자른다', () => {
    const long = '가'.repeat(FEEDBACK_MAX_LENGTH + 50);
    expect(sanitizeFeedbackMessage(long)).toHaveLength(FEEDBACK_MAX_LENGTH);
  });

  it('이모지(서로게이트 쌍)를 반만 자르지 않는다', () => {
    const text = 'a'.repeat(FEEDBACK_MAX_LENGTH - 1) + '😊😊';
    const result = sanitizeFeedbackMessage(text);
    expect(result.endsWith('\uD83D')).toBe(false);
    expect([...result].length).toBeLessThanOrEqual(FEEDBACK_MAX_LENGTH);
  });
});

describe('parseFeedbackRequest', () => {
  const valid = {
    message: '레시피가 너무 짜요',
    trigger: 'week2',
    app_version: '6.0.0',
    week: 3,
    has_pass: true,
  };

  it('올바른 요청', () => {
    expect(parseFeedbackRequest(valid)).toEqual({
      ok: true,
      value: {
        message: '레시피가 너무 짜요',
        trigger: 'week2',
        appVersion: '6.0.0',
        week: 3,
        hasPass: true,
      },
    });
  });

  it('본문이 객체가 아니면 거절', () => {
    expect(parseFeedbackRequest(null).ok).toBe(false);
    expect(parseFeedbackRequest('hi').ok).toBe(false);
  });

  it('내용이 비었거나 공백뿐이면 거절', () => {
    expect(parseFeedbackRequest({ ...valid, message: '   \n ' }).ok).toBe(false);
    expect(parseFeedbackRequest({ ...valid, message: 3 }).ok).toBe(false);
  });

  it('너무 긴 원문(크게 넘는 것)은 거절', () => {
    expect(parseFeedbackRequest({ ...valid, message: 'a'.repeat(5000) }).ok).toBe(false);
  });

  it('조금 넘는 내용은 잘라서 받는다', () => {
    const result = parseFeedbackRequest({ ...valid, message: 'a'.repeat(FEEDBACK_MAX_LENGTH + 5) });
    expect(result.ok && result.value.message.length).toBe(FEEDBACK_MAX_LENGTH);
  });

  it('모르는 trigger는 거절 (뺀 report 포함)', () => {
    expect(parseFeedbackRequest({ ...valid, trigger: 'evil' }).ok).toBe(false);
    expect(parseFeedbackRequest({ ...valid, trigger: 'report' }).ok).toBe(false);
  });

  it('버전·주차·패스가 이상하면 null로 둔다 (의견은 받는다)', () => {
    const result = parseFeedbackRequest({
      ...valid,
      app_version: '<script>',
      week: 'x',
      has_pass: 'yes',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        message: valid.message,
        trigger: 'week2',
        appVersion: null,
        week: null,
        hasPass: null,
      },
    });
    expect(parseFeedbackRequest({ ...valid, week: 999 }).ok && true).toBe(true);
    const week = parseFeedbackRequest({ ...valid, week: 999 });
    expect(week.ok && week.value.week).toBe(null);
  });
});

describe('isFeedbackRateLimited', () => {
  it('같은 KST 날에 보낸 적이 있으면 막는다', () => {
    // 2026-11-20 00:30 KST
    expect(isFeedbackRateLimited('2026-11-19T15:30:00Z', new Date('2026-11-20T14:00:00Z'))).toBe(
      true
    );
  });

  it('KST로 전날이면 막지 않는다', () => {
    // 2026-11-19 23:50 KST → 2026-11-20 00:10 KST
    expect(isFeedbackRateLimited('2026-11-19T14:50:00Z', new Date('2026-11-19T15:10:00Z'))).toBe(
      false
    );
  });

  it('보낸 적이 없으면 막지 않는다', () => {
    expect(isFeedbackRateLimited(null, new Date())).toBe(false);
  });
});

describe('buildFeedbackSlackText', () => {
  it('정해진 모양으로 만든다', () => {
    expect(
      buildFeedbackSlackText({
        message: '재료 검색이 느려요',
        trigger: 'saved3',
        appVersion: '6.0.0',
        week: 2,
        hasPass: false,
      })
    ).toBe('💬 사용자 의견 (레시피 3개 저장)\n재료 검색이 느려요\n앱 6.0.0 · 2주차 · 패스 없음');
  });

  it('모르는 값은 ?로, 패스 있음', () => {
    expect(
      buildFeedbackSlackText({
        message: 'x',
        trigger: 'week2',
        appVersion: null,
        week: null,
        hasPass: true,
      })
    ).toBe('💬 사용자 의견 (2주차 진입)\nx\n앱 ? · ?주차 · 패스 있음');
  });

  it('Slack 특수 문법(<!channel>, 링크)을 무력화한다', () => {
    const text = buildFeedbackSlackText({
      message: '<!channel> <https://evil.example|클릭> & 끝',
      trigger: 'week2',
      appVersion: '6.0.0',
      week: 3,
      hasPass: null,
    });
    expect(text).toContain('&lt;!channel&gt; &lt;https://evil.example|클릭&gt; &amp; 끝');
    expect(text).toContain('패스 ?');
  });
});
