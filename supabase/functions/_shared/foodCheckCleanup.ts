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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 버킷 최상위 이름 중 uid(uuid) 모양만 남긴다. .emptyFolderPlaceholder 같은 이름을 user.id(uuid)
// 조회에 넣으면 쿼리 전체가 실패하므로 먼저 거른다
export const uidFolderNames = (names: string[]): string[] =>
  names.filter((name) => UUID_RE.test(name));

// 탈퇴 등으로 public.user 행이 없는 uid의 사진 폴더(food-check/{uid}/)를 고른다.
// uid 모양이 아닌 이름·중복은 뺀다
export const orphanFolders = (folderUids: string[], existingUids: Set<string>): string[] => {
  const seen = new Set<string>();
  const orphans: string[] = [];
  for (const uid of uidFolderNames(folderUids)) {
    if (seen.has(uid)) continue;
    seen.add(uid);
    if (!existingUids.has(uid)) orphans.push(uid);
  }
  return orphans;
};
