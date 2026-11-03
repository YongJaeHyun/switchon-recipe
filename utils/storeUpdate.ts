// 스토어 업데이트 안내 두 단계 스위치 (서버 version.store_update_mode, 운영자 결정 2026-11-04).
// off = 안 띄움, suggest = 닫을 수 있는 안내, force = 닫을 수 없는 필수 업데이트.
// "옛 스토어 빌드인지"는 앱이 OTA로 최신 JS를 받아도 바뀌지 않는 네이티브 부품으로 판단한다 (hasLatestNative)

export type StoreUpdateMode = 'off' | 'suggest' | 'force';
export type StoreUpdatePrompt = 'none' | 'suggest' | 'force';

export const parseStoreUpdateMode = (value: unknown): StoreUpdateMode =>
  value === 'suggest' || value === 'force' ? value : 'off';

export function storeUpdatePrompt({
  mode,
  hasLatestNative,
  suggestDismissed,
}: {
  mode: StoreUpdateMode;
  hasLatestNative: boolean;
  // 이번 실행에서 안내를 이미 닫았는지
  suggestDismissed: boolean;
}): StoreUpdatePrompt {
  if (hasLatestNative || mode === 'off') return 'none';
  if (mode === 'force') return 'force';
  return suggestDismissed ? 'none' : 'suggest';
}
