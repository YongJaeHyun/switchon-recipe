import { describe, expect, it } from 'vitest';
import { resolveNotificationHref } from './notificationHref';

describe('resolveNotificationHref', () => {
  it('/weight는 기록 탭 체중 칸 (탭 이동)', () =>
    expect(resolveNotificationHref('/weight')).toEqual({
      href: '/(tabs)/records?view=weight',
      tab: true,
    }));
  it('/report는 기록 탭 리포트 칸 (탭 이동)', () =>
    expect(resolveNotificationHref('/report')).toEqual({
      href: '/(tabs)/records?view=report',
      tab: true,
    }));
  it('/report/ 끝 슬래시도 리포트 칸', () =>
    expect(resolveNotificationHref('/report/')).toEqual({
      href: '/(tabs)/records?view=report',
      tab: true,
    }));
  it('/home은 오늘 탭 (끼니 알림)', () =>
    expect(resolveNotificationHref('/home')).toEqual({ href: '/(tabs)/home', tab: true }));
  it('/profile은 내 정보 탭 (탭 이동)', () =>
    expect(resolveNotificationHref('/profile')).toEqual({ href: '/(tabs)/me', tab: true }));
  it('리포트 상세는 그대로 push', () =>
    expect(resolveNotificationHref('/report/2026-10-21/1')).toEqual({
      href: '/report/2026-10-21/1',
      tab: false,
    }));
  it('모르는 주소는 그대로 push', () =>
    expect(resolveNotificationHref('/recipeDetail?id=3')).toEqual({
      href: '/recipeDetail?id=3',
      tab: false,
    }));
});
