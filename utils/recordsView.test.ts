import { describe, expect, it } from 'vitest';
import { parseRecordsView } from './recordsView';

describe('parseRecordsView', () => {
  it('report는 리포트 칸', () => expect(parseRecordsView('report')).toBe('report'));
  it('fasting은 단식 칸', () => expect(parseRecordsView('fasting')).toBe('fasting'));
  it('weight는 체중 칸', () => expect(parseRecordsView('weight')).toBe('weight'));
  it('없으면 체중 칸', () => expect(parseRecordsView(undefined)).toBe('weight'));
  it('모르는 값이면 체중 칸', () => expect(parseRecordsView('x')).toBe('weight'));
  it('배열이면 체중 칸', () => expect(parseRecordsView(['report'])).toBe('weight'));
});
