import { describe, expect, it } from 'vitest';
// @ts-expect-error 서버 공용 모듈은 .ts 확장자 import(Deno)라 앱 tsconfig에서 TS5097. 이 테스트만 예외.
import * as server from '../supabase/functions/_shared/pass.ts';
import * as app from './passOptions';

// 앱은 서버 코드를 import하지 않으므로 같은 값을 따로 둔다. 둘이 어긋나지 않게 확인한다
describe('passOptions 서버 값 일치', () => {
  it('한 주 더 하기 연장 상한이 서버(_shared/pass.ts)와 같다', () => {
    expect(app.FIVE_WEEK_MAX_EXTENSIONS).toBe(server.FIVE_WEEK_MAX_EXTENSIONS);
  });
});
