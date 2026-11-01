import { describe, expect, it } from 'vitest';
import type { PassStatus } from 'types/pass';
import {
  cleanDishNameInput,
  adaptNoteLines,
  DISH_NAME_MAX,
  interpretRecipeByNameResponse,
  recipeByNameEntryState,
  RECIPE_BY_NAME_TRIAL_LIMIT,
  suggestionLabel,
} from './recipeByName';

const status = (o: Partial<PassStatus> = {}, onSale = true): PassStatus => ({
  sales: {
    onSale,
    freeActive: false,
    tier: onSale ? 'regular' : null,
    productId: onSale ? 'switchon_pass_5w_4900' : null,
    priceKrw: onSale ? 4900 : null,
    freeDaysLeft: 0,
    nextTier: null,
  },
  passExpiresAt: null,
  hasAccess: false,
  serverNow: '2026-11-01T00:00:00Z',
  ...o,
});

describe('recipeByNameEntryState', () => {
  it('서버와 같은 평생 3번', () => {
    expect(RECIPE_BY_NAME_TRIAL_LIMIT).toBe(3);
  });

  it('패스가 있으면 열림, 상태를 모르면 숨김', () => {
    expect(recipeByNameEntryState(status({ hasAccess: true }), true)).toEqual({ kind: 'open' });
    expect(recipeByNameEntryState(undefined, true)).toEqual({ kind: 'hidden' });
  });

  it('체험이 남았으면 판매가 꺼져 있어도 체험 배지', () => {
    expect(recipeByNameEntryState(status({ recipeByNameTrialRemaining: 2 }, false), false)).toEqual(
      { kind: 'trial', remaining: 2 }
    );
  });

  it('체험을 다 썼으면 판매 중일 때 잠금, 아니면 숨김', () => {
    expect(recipeByNameEntryState(status({ recipeByNameTrialRemaining: 0 }), true)).toEqual({
      kind: 'locked',
    });
    expect(recipeByNameEntryState(status({ recipeByNameTrialRemaining: 0 }), false)).toEqual({
      kind: 'hidden',
    });
  });

  it('음식 판정 체험 횟수와 섞이지 않는다', () => {
    expect(
      recipeByNameEntryState(
        status({ foodCheckTrialRemaining: 3, recipeByNameTrialRemaining: 0 }),
        true
      )
    ).toEqual({ kind: 'locked' });
  });
});

describe('cleanDishNameInput', () => {
  it('따옴표·줄바꿈을 지우고 공백을 줄이며 최대 길이까지 자른다 (치는 중인 끝 공백은 남김)', () => {
    expect(cleanDishNameInput('  "김치"\n찌개 ')).toBe('김치 찌개 ');
    expect(cleanDishNameInput('가'.repeat(40))).toHaveLength(DISH_NAME_MAX);
    expect(cleanDishNameInput('   ')).toBe('');
  });
});

describe('suggestionLabel', () => {
  it('긴 검색어는 줄여서 버튼에 넣는다', () => {
    expect(suggestionLabel('김치찌개')).toBe('“김치찌개” 레시피 만들기');
    expect(suggestionLabel('가'.repeat(15))).toBe(`“${'가'.repeat(10)}…” 레시피 만들기`);
  });
});

describe('interpretRecipeByNameResponse', () => {
  const recipe = { id: 1, recipe_name: '김치찌개' };

  it('성공: 레시피·판정·남은 체험', () => {
    expect(
      interpretRecipeByNameResponse(200, {
        status: 'ok',
        verdict: 'adapt',
        recipe,
        trialRemaining: 1,
      })
    ).toEqual({ status: 'ok', recipe, verdict: 'adapt', trialRemaining: 1 });
    expect(interpretRecipeByNameResponse(200, { status: 'ok', verdict: 'ok', recipe })).toEqual({
      status: 'ok',
      recipe,
      verdict: 'ok',
    });
  });

  it('거절: 서버 이유 (없으면 기본)', () => {
    expect(
      interpretRecipeByNameResponse(200, { status: 'rejected', reason: '음식이 아니에요' })
    ).toEqual({ status: 'rejected', message: '음식이 아니에요' });
    expect(interpretRecipeByNameResponse(200, { status: 'rejected' })).toEqual({
      status: 'rejected',
      message: '레시피로 만들 수 없는 이름이에요',
    });
  });

  it('429: 이름 확인 한도와 레시피 하루 한도를 나눈다', () => {
    expect(
      interpretRecipeByNameResponse(429, {
        code: 'NAME_CHECK_LIMIT',
        error: '오늘은 더 확인할 수 없어요',
      })
    ).toEqual({ status: 'nameCheckLimit', message: '오늘은 더 확인할 수 없어요' });
    expect(
      interpretRecipeByNameResponse(429, {
        code: 'QUOTA_EXCEEDED',
        canWatchAd: true,
        isPass: false,
      })
    ).toEqual({
      status: 'quotaExceeded',
      quota: { quotaExceeded: true, canWatchAd: true, isPass: false },
    });
  });

  it('402는 잠금, 400은 서버 문구, 그 밖은 오류', () => {
    expect(interpretRecipeByNameResponse(402, {})).toEqual({ status: 'locked' });
    expect(
      interpretRecipeByNameResponse(400, { error: '음식 이름을 1~30자로 적어 주세요' })
    ).toEqual({ status: 'invalid', message: '음식 이름을 1~30자로 적어 주세요' });
    expect(interpretRecipeByNameResponse(500, {}).status).toBe('error');
    expect(interpretRecipeByNameResponse(200, { status: 'ok' }).status).toBe('error');
  });
});

describe('adaptNoteLines', () => {
  it('줄바꿈으로 나누고 빈 줄은 빼고 2줄까지', () => {
    expect(adaptNoteLines('면 대신 두부면\n\n저당 양념\n셋째')).toEqual([
      '면 대신 두부면',
      '저당 양념',
    ]);
    expect(adaptNoteLines(null)).toEqual([]);
    expect(adaptNoteLines(undefined)).toEqual([]);
  });
});
