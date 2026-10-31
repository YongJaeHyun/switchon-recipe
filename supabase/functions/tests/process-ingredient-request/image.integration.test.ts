import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createImageDeps, findIngredientImage } from '../../process-ingredient-request/image.ts';
import type { CandidateIngredient } from '../../process-ingredient-request/types.ts';

const TIMEOUT_MS = 120000;
const geminiKey = process.env.GEMINI_API_KEY ?? '';
const pixabayKey = process.env.PIXABAY_API_KEY ?? '';
const OUTPUT_DIR = join(__dirname, '..', '.output');

const candidate = (name: string, imageQueryEn: string): CandidateIngredient => ({
  name,
  imageQueryEn,
  week: 1,
  isCarbohydrate: false,
  subKeywords: [],
  reason: '',
});

const save = (name: string, bytes: Uint8Array, mimeType: string) => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, `${name}.${mimeType === 'image/png' ? 'png' : 'jpg'}`), bytes);
};

// 실제 Gemini를 호출해 비용이 들므로 평소 테스트에서는 건너뛴다.
// 실행: RUN_PAID_TESTS=1 npx vitest run supabase/functions/tests/process-ingredient-request
const runPaid = process.env.RUN_PAID_TESTS === '1';

describe.skipIf(!runPaid || !geminiKey || !pixabayKey)('findIngredientImage (real APIs)', () => {
  const deps = createImageDeps({ geminiKey, pixabayKey });

  it(
    'finds a pixabay photo for salmon',
    async () => {
      const result = await findIngredientImage(candidate('연어', 'raw salmon fillet'), deps);
      expect(result?.source).toBe('pixabay');
      save('연어', result!.bytes, result!.mimeType);
    },
    TIMEOUT_MS
  );

  it(
    'finds or generates an image for shio kombu (inspect output manually)',
    async () => {
      const result = await findIngredientImage(
        candidate('시오콘부', 'shio kombu salted kelp'),
        deps
      );
      if (result) save(`시오콘부-${result.source}`, result.bytes, result.mimeType);
    },
    TIMEOUT_MS
  );
});
