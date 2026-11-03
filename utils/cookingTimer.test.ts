import { describe, expect, it } from 'vitest';
import {
  newTimer,
  pauseTimer,
  remainingMs,
  resetTimer,
  resumeTimer,
  timerKey,
  timerState,
} from './cookingTimer';

const base = { recipeId: 7, stepIndex: 2, label: '5분', seconds: 300 };

describe('cookingTimer', () => {
  it('레시피·단계로 키를 만든다', () => {
    expect(timerKey(7, 2)).toBe('7:2');
  });

  it('시작하면 끝나는 시각까지 남은 시간이 준다', () => {
    const t = newTimer(base, 1_000);
    expect(timerState(t, 1_000)).toBe('running');
    expect(remainingMs(t, 61_000)).toBe(240_000);
    expect(remainingMs(t, 400_000)).toBe(0);
    expect(timerState(t, 301_000)).toBe('done');
  });

  it('일시정지하면 남은 시간이 멈추고, 이어 하면 그만큼 다시 간다', () => {
    const paused = pauseTimer(newTimer(base, 0), 60_000);
    expect(timerState(paused, 60_000)).toBe('paused');
    expect(remainingMs(paused, 999_999)).toBe(240_000);
    const resumed = resumeTimer(paused, 100_000);
    expect(remainingMs(resumed, 100_000)).toBe(240_000);
    expect(remainingMs(resumed, 340_000)).toBe(0);
  });

  it('다시 하면 처음 시간부터 새로 간다', () => {
    const again = resetTimer(newTimer(base, 0), 500_000);
    expect(remainingMs(again, 500_000)).toBe(300_000);
    expect(timerState(again, 500_000)).toBe('running');
  });

  it('끝난 타이머는 일시정지·이어 하기를 해도 그대로', () => {
    const t = newTimer(base, 0);
    expect(pauseTimer(t, 400_000)).toBe(t);
    expect(resumeTimer(t, 400_000)).toBe(t);
  });
});
