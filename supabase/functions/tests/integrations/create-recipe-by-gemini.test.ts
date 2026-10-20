import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { requestRecipeImage } from '../../_shared/recipeImage.ts';

const TIMEOUT_MS = 60000;
const geminiKey = process.env.GEMINI_API_KEY;
// 실제 Gemini를 호출해 이미지 1장당 비용(약 90원)이 들므로 평소 테스트에서는 건너뛴다.
// 실행: RUN_PAID_TESTS=1 npx vitest run supabase/functions/tests/integrations
const runPaid = process.env.RUN_PAID_TESTS === '1';

describe.skipIf(!runPaid || !geminiKey)('create recipe image (실제 API 호출)', () => {
  it(
    '실서비스 이미지 모델로 레시피 이미지를 만든다',
    async () => {
      const imageBase64 = await requestRecipeImage('계란프라이', geminiKey as string);
      expect(imageBase64.length).toBeGreaterThan(1000);
    },
    TIMEOUT_MS
  );
});
