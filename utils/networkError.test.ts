import { describe, expect, it } from 'vitest';
import { isNetworkError } from './networkError';

describe('isNetworkError', () => {
  it('fetch 실패 Error', () => {
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true);
  });

  it('supabase가 돌려주는 { message } 객체 (Error가 아님)', () => {
    expect(
      isNetworkError({
        message: 'TypeError: Network request failed',
        details: 'TypeError: Network request failed\n    at anonymous',
        hint: '',
        code: '',
      })
    ).toBe(true);
  });

  it('supabase.functions.invoke가 요청을 못 보냈을 때의 FunctionsFetchError (GitHub #30)', () => {
    const error = Object.assign(new Error('Failed to send a request to the Edge Function'), {
      name: 'FunctionsFetchError',
      context: new TypeError('Network request failed'),
    });
    expect(isNetworkError(error)).toBe(true);
  });

  it('다른 오류는 아님', () => {
    expect(isNetworkError(new Error('permission denied'))).toBe(false);
    expect(isNetworkError({ message: 'JWT expired', code: 'PGRST301' })).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
    expect(isNetworkError('Network request failed')).toBe(true);
  });
});
