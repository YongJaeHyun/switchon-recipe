import { describe, expect, it } from 'vitest';
import { parseStoreUpdateMode, storeUpdatePrompt } from './storeUpdate';

describe('storeUpdatePrompt', () => {
  it('최신 스토어 빌드면 스위치와 상관없이 아무것도 안 띄운다', () => {
    for (const mode of ['off', 'suggest', 'force'] as const) {
      expect(storeUpdatePrompt({ mode, hasLatestNative: true, suggestDismissed: false })).toBe(
        'none'
      );
    }
  });

  it('옛 스토어 빌드: off면 없음, suggest면 안내(닫으면 이번 실행 동안 안 띄움), force면 필수', () => {
    const old = { hasLatestNative: false };
    expect(storeUpdatePrompt({ ...old, mode: 'off', suggestDismissed: false })).toBe('none');
    expect(storeUpdatePrompt({ ...old, mode: 'suggest', suggestDismissed: false })).toBe('suggest');
    expect(storeUpdatePrompt({ ...old, mode: 'suggest', suggestDismissed: true })).toBe('none');
    expect(storeUpdatePrompt({ ...old, mode: 'force', suggestDismissed: true })).toBe('force');
  });
});

describe('parseStoreUpdateMode', () => {
  it('모르는 값·열이 없을 때(반영 전)는 off', () => {
    expect(parseStoreUpdateMode('suggest')).toBe('suggest');
    expect(parseStoreUpdateMode('force')).toBe('force');
    expect(parseStoreUpdateMode('FORCE')).toBe('off');
    expect(parseStoreUpdateMode(undefined)).toBe('off');
    expect(parseStoreUpdateMode(null)).toBe('off');
  });
});
