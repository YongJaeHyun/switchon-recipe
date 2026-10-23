import type { Href } from 'expo-router';

// 하단 탭으로 옮긴 예전 주소 → 탭 경로. 탭 경로는 router.navigate로 열어야
// 이미 있는 (tabs) 안에서 탭만 바뀌고 (tabs)가 두 번 쌓이지 않는다
export const LEGACY_TAB_HREFS = {
  '/weight': '/(tabs)/records?view=weight',
  '/report': '/(tabs)/records?view=report',
  '/profile': '/(tabs)/me',
} as const satisfies Record<string, Href>;

type LegacyPath = keyof typeof LEGACY_TAB_HREFS;

const isLegacyPath = (path: string): path is LegacyPath => path in LEGACY_TAB_HREFS;

// 알림 data.href → { 열 주소, 탭 이동인지 }. 모르는 주소는 그대로 (push)
export function resolveNotificationHref(href: string): { href: Href; tab: boolean } {
  const path = href.split(/[?#]/)[0].replace(/(.)\/+$/, '$1');
  if (isLegacyPath(path)) return { href: LEGACY_TAB_HREFS[path], tab: true };
  return { href: href as Href, tab: false };
}
