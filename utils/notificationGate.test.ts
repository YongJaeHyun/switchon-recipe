import { describe, expect, it } from 'vitest';
import { afterLoginLinkAction, notificationTapAction, startupPhase } from './notificationGate';

const user = { userId: 'u1', isOnboarded: true };

describe('notificationTapAction (알림을 눌러 열 때 언제 이동할지)', () => {
  it('앱을 막 켜 사용자 정보를 불러오는 중이면 기다린다 (오늘 탭이 빈 시작일로 뜨지 않게)', () => {
    expect(notificationTapAction({ phase: 'starting', userId: '', isOnboarded: false })).toBe(
      'wait'
    );
    expect(notificationTapAction({ phase: 'starting', ...user })).toBe('wait');
  });

  it('탭 화면이 떠 있고 사용자 정보가 있으면 이동한다', () => {
    expect(notificationTapAction({ phase: 'tabs', ...user })).toBe('open');
  });

  it('탭 화면이어도 사용자 정보가 없거나 온보딩 전이면 기다린다', () => {
    expect(notificationTapAction({ phase: 'tabs', userId: '', isOnboarded: true })).toBe('wait');
    expect(notificationTapAction({ phase: 'tabs', userId: 'u1', isOnboarded: false })).toBe('wait');
  });

  it('로그인·온보딩·첫 안내 화면이면 버린다 (갈 곳은 앱 시작 화면이 정한다)', () => {
    expect(notificationTapAction({ phase: 'outside', ...user })).toBe('drop');
    expect(notificationTapAction({ phase: 'outside', userId: '', isOnboarded: false })).toBe(
      'drop'
    );
  });
});

describe('startupPhase (앱 시작 화면이 탭으로 보내는지)', () => {
  it('로그인·온보딩을 마쳤고 첫 실행이 아니면 탭으로 간다 → 탭이 뜰 때까지 기다린다', () => {
    expect(startupPhase({ isFirstLaunch: false, isLoggedIn: true, isOnboarded: true })).toBe(
      'starting'
    );
  });

  it('첫 실행·로그아웃·온보딩 전이면 탭 밖', () => {
    expect(startupPhase({ isFirstLaunch: true, isLoggedIn: true, isOnboarded: true })).toBe(
      'outside'
    );
    expect(startupPhase({ isFirstLaunch: false, isLoggedIn: false, isOnboarded: false })).toBe(
      'outside'
    );
    expect(startupPhase({ isFirstLaunch: false, isLoggedIn: true, isOnboarded: false })).toBe(
      'outside'
    );
  });
});

describe('afterLoginLinkAction (카톡 링크처럼 로그인·온보딩 뒤로 미룬 이동)', () => {
  it('탭 화면이 떠 있고 로그인·온보딩을 마쳤으면 연다', () => {
    expect(afterLoginLinkAction({ phase: 'tabs', ...user })).toBe('open');
  });

  it('로그인·온보딩 화면(탭 밖)이어도 버리지 않고 기다린다', () => {
    expect(afterLoginLinkAction({ phase: 'outside', userId: '', isOnboarded: false })).toBe('wait');
    expect(afterLoginLinkAction({ phase: 'outside', ...user })).toBe('wait');
  });

  it('앱 시작 중이거나 사용자 정보가 아직 없으면 기다린다', () => {
    expect(afterLoginLinkAction({ phase: 'starting', ...user })).toBe('wait');
    expect(afterLoginLinkAction({ phase: 'tabs', userId: 'u1', isOnboarded: false })).toBe('wait');
    expect(afterLoginLinkAction({ phase: 'tabs', userId: null, isOnboarded: true })).toBe('wait');
  });
});
