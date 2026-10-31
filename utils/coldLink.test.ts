import { describe, expect, it } from 'vitest';
import { coldLinkRedirect } from './coldLink';

const cold = (path: string) => coldLinkRedirect({ path, initial: true });

describe('coldLinkRedirect (앱이 꺼진 상태에서 링크로 열 때)', () => {
  it('앱 화면 링크는 시작 화면(/)으로 열고 그 주소를 미뤄 둔다 (사용자 정보를 불러온 뒤 이동)', () => {
    expect(cold('switchon-recipe://pass')).toEqual({ path: '/', pendingHref: '/pass' });
    expect(cold('switchon-recipe:///pass')).toEqual({ path: '/', pendingHref: '/pass' });
    expect(cold('switchon-recipe://report')).toEqual({ path: '/', pendingHref: '/report' });
    expect(cold('switchon-recipe://report/2026-10-01/3')).toEqual({
      path: '/',
      pendingHref: '/report/2026-10-01/3',
    });
    expect(cold('switchon-recipe://weight?from=push')).toEqual({
      path: '/',
      pendingHref: '/weight?from=push',
    });
    expect(cold('/pass')).toEqual({ path: '/', pendingHref: '/pass' });
  });

  it('카카오 링크는 자기 화면(app/kakaolink)이 처리하므로 그대로 둔다', () => {
    for (const path of [
      'switchon-recipe://kakaolink?recipe=abc',
      'kakao1234567890://kakaolink?recipe=abc',
      '/kakaolink?recipe=abc',
    ]) {
      expect(cold(path)).toEqual({ path, pendingHref: null });
    }
  });

  it('시작 화면 자체·빈 주소는 그대로 둔다', () => {
    for (const path of ['switchon-recipe://', 'switchon-recipe:///', '/', '']) {
      expect(cold(path)).toEqual({ path, pendingHref: null });
    }
  });

  it('개발 빌드 실행 주소(expo-development-client)는 그대로 둔다', () => {
    for (const path of [
      'exp+switchon-recipe://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081',
      'switchon-recipe://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081',
      'exp://10.0.2.2:8081',
    ]) {
      expect(cold(path)).toEqual({ path, pendingHref: null });
    }
  });

  it('앱이 이미 켜져 있을 때(initial 아님) 링크는 그대로 연다', () => {
    expect(coldLinkRedirect({ path: 'switchon-recipe://pass', initial: false })).toEqual({
      path: 'switchon-recipe://pass',
      pendingHref: null,
    });
  });
});
