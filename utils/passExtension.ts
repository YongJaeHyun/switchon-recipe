// 한 주 더 하기 뒤 패스 7일 연장 (서버 extend_pass_for_week_repeat). 한 주 더 하기는 이미 끝났으므로
// 여기서 무엇이 실패해도 throw하지 않는다. 서버가 늘렸으면 true
export async function extendPassAfterRepeat(
  newStartDate: string,
  deps: {
    extend(newStartDate: string): Promise<string | null>; // 새 만료일(ISO) 또는 늘리지 않음(null)
    onExtended(passExpiresAt: string): void; // 패스 상태 새로고침, 토스트
  }
): Promise<boolean> {
  let expiresAt: string | null;
  try {
    expiresAt = await deps.extend(newStartDate);
  } catch (error) {
    console.error('[extendPassAfterRepeat]', error);
    return false;
  }
  if (!expiresAt) return false;
  try {
    deps.onExtended(expiresAt);
  } catch (error) {
    console.error('[extendPassAfterRepeat] onExtended', error);
  }
  return true;
}
