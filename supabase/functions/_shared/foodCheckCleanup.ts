// 편의점 판정 원본 사진 정리 기준: 만든 지 days일이 지난(정확히 days일 포함) 원본만 대상

export const DAY_MS = 24 * 60 * 60 * 1000;
export const RETENTION_DAYS = 30;

export const selectExpired = (
  rows: { id: number; image_path: string | null; created_at: string }[],
  now: Date,
  days = RETENTION_DAYS
): { id: number; image_path: string }[] => {
  const cutoff = now.getTime() - days * DAY_MS;
  const expired: { id: number; image_path: string }[] = [];
  for (const row of rows) {
    if (!row.image_path) continue;
    if (new Date(row.created_at).getTime() <= cutoff) {
      expired.push({ id: row.id, image_path: row.image_path });
    }
  }
  return expired;
};

// storage.remove는 실제로 지운 객체만 돌려준다. 돌려받지 못한 경로의 행은 image_path를 비우지 않는다
// (객체가 아직 남아 있을 수 있어 경로를 잃으면 영영 못 지움)
export const partitionRemoved = (
  requested: { id: number; image_path: string }[],
  removedNames: string[]
): { removedIds: number[]; notRemoved: { id: number; image_path: string }[] } => {
  const removed = new Set(removedNames);
  const removedIds: number[] = [];
  const notRemoved: { id: number; image_path: string }[] = [];
  for (const row of requested) {
    if (removed.has(row.image_path)) removedIds.push(row.id);
    else notRemoved.push(row);
  }
  return { removedIds, notRemoved };
};
