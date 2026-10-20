// 편의점 판정 원본 사진 정리 기준: 만든 지 days일이 지난(정확히 days일 포함) 원본만 대상

const DAY_MS = 24 * 60 * 60 * 1000;

export const selectExpired = (
  rows: { id: number; image_path: string | null; created_at: string }[],
  now: Date,
  days = 30
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
