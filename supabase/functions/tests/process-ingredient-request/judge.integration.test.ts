import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { judgeIngredient } from '../../process-ingredient-request/judge.ts';
import type { ExistingIngredient } from '../../process-ingredient-request/types.ts';

const TIMEOUT_MS = 60000;
const geminiKey = process.env.GEMINI_API_KEY ?? '';

const ingredient = (
  name: string,
  overrides: Partial<ExistingIngredient> = {}
): ExistingIngredient => ({
  name,
  subKeywords: [],
  week: 1,
  isCarbohydrate: false,
  isActive: true,
  ...overrides,
});

const existing: ExistingIngredient[] = [
  ingredient('닭고기'),
  ingredient('닭가슴살'),
  ingredient('소고기'),
  ingredient('돼지고기'),
  ingredient('치아씨드', { week: 3, isCarbohydrate: true }),
  ingredient('현미밥', { isCarbohydrate: true }),
  ingredient('시오콘부', { week: 3, subKeywords: ['염장다시마'] }),
  ingredient('두부'),
  ingredient('계란'),
];

const judge = (name: string) => judgeIngredient(name, existing, geminiKey);

// 실제 Gemini를 호출해 비용이 들므로 평소 테스트에서는 건너뛴다.
// 실행: RUN_PAID_TESTS=1 npx vitest run supabase/functions/tests/process-ingredient-request
const runPaid = process.env.RUN_PAID_TESTS === '1';

describe.skipIf(!runPaid || !geminiKey)('judgeIngredient', () => {
  it(
    'treats a spelling variant as duplicate',
    async () => {
      expect(await judge('치아시드')).toMatchObject({
        decision: 'duplicate',
        matchedName: '치아씨드',
      });
    },
    TIMEOUT_MS
  );

  it(
    'treats a broader ingredient as duplicate',
    async () => {
      expect((await judge('고기')).decision).toBe('duplicate');
    },
    TIMEOUT_MS
  );

  it.each(['라면', '소주', '노트북'])(
    'rejects %s',
    async (name) => {
      expect((await judge(name)).decision).toBe('reject');
    },
    TIMEOUT_MS
  );

  it(
    'adds a more specific cut without existing ones',
    async () => {
      const judgement = await judge('닭다리살');
      expect(judgement.decision).toBe('add');
      if (judgement.decision !== 'add') return;

      const names = judgement.ingredients.map((i) => i.name);
      expect(names).toContain('닭다리살');
      expect(names).not.toContain('닭고기');
      expect(names).not.toContain('닭가슴살');
      for (const i of judgement.ingredients) expect([1, 2, 3]).toContain(i.week);
    },
    TIMEOUT_MS
  );

  it(
    'adds salmon as a week 1 non-carb ingredient',
    async () => {
      const judgement = await judge('연어');
      expect(judgement.decision).toBe('add');
      if (judgement.decision !== 'add') return;
      expect(judgement.ingredients[0]).toMatchObject({ week: 1, isCarbohydrate: false });
    },
    TIMEOUT_MS
  );

  it(
    'marks sweet potato as carbohydrate',
    async () => {
      const judgement = await judge('고구마');
      expect(judgement.decision).toBe('add');
      if (judgement.decision !== 'add') return;
      expect(judgement.ingredients[0].isCarbohydrate).toBe(true);
    },
    TIMEOUT_MS
  );
});
