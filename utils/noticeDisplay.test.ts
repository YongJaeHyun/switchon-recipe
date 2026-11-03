import { describe, expect, it } from 'vitest';
import { formatNoticeDate, noticeChangeText } from './noticeDisplay';

describe('noticeChangeText', () => {
  it('앞에 붙은 이모지를 뗀다', () => {
    expect(noticeChangeText('💎 스위치온 패스: 음식 판정')).toBe('스위치온 패스: 음식 판정');
    expect(noticeChangeText('⚖️ 체중 기록')).toBe('체중 기록');
    expect(noticeChangeText('⚡️ 재료 목록을 서버에서')).toBe('재료 목록을 서버에서');
  });

  it('이모지가 없으면 그대로', () => {
    expect(noticeChangeText('레시피 인분 조절')).toBe('레시피 인분 조절');
    expect(noticeChangeText('[v6] 업데이트')).toBe('[v6] 업데이트');
    expect(noticeChangeText('4주 완주 달력')).toBe('4주 완주 달력');
  });
});

describe('formatNoticeDate', () => {
  it('올해면 월·일만, 다른 해면 연도까지', () => {
    expect(formatNoticeDate('2026.10.31', 2026)).toBe('10월 31일');
    expect(formatNoticeDate('2025.08.08', 2026)).toBe('2025년 8월 8일');
  });

  it('모르는 모양이면 그대로', () => {
    expect(formatNoticeDate('곧', 2026)).toBe('곧');
  });
});
