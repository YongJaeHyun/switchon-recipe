// 기록 탭 위쪽 3칸 (쿼리 view=weight|fasting|report)
export type RecordsView = 'weight' | 'fasting' | 'report';

const VIEWS: readonly RecordsView[] = ['weight', 'fasting', 'report'];

// 모르는 값·배열·없음 → 체중 칸
export function parseRecordsView(v: unknown): RecordsView {
  return typeof v === 'string' && (VIEWS as readonly string[]).includes(v)
    ? (v as RecordsView)
    : 'weight';
}
