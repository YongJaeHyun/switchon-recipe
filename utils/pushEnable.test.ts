import { describe, expect, it } from 'vitest';
import { pushEnableResult } from './pushEnable';

describe('pushEnableResult', () => {
  it('토큰을 받았으면 켜짐', () => {
    expect(pushEnableResult({ isDevice: true, registered: true, permission: 'granted' })).toBe(
      'enabled'
    );
  });

  it('알림 권한을 거부했으면 denied (켜지 않고 설정 안내)', () => {
    expect(pushEnableResult({ isDevice: true, registered: false, permission: 'denied' })).toBe(
      'denied'
    );
    expect(
      pushEnableResult({ isDevice: true, registered: false, permission: 'undetermined' })
    ).toBe('denied');
  });

  it('권한은 있는데 토큰을 못 받았거나 실기기가 아니면 unavailable (설정은 그대로 켠다)', () => {
    expect(pushEnableResult({ isDevice: true, registered: false, permission: 'granted' })).toBe(
      'unavailable'
    );
    expect(pushEnableResult({ isDevice: false, registered: false, permission: 'granted' })).toBe(
      'unavailable'
    );
  });
});
