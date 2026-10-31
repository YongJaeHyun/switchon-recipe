import { describe, expect, it } from 'vitest';
import {
  initialRecipeJobState,
  isRecipeJobBusy,
  recipeJobBand,
  recipeJobLabel,
  dismissRecipeJob,
  finishRecipeJob,
  shouldOpenOnDone,
  startRecipeJob,
  type RecipeJobState,
} from './recipeJob';

const recipe = { id: 7, recipe_name: '두부 김치찌개' } as never;

const running = (): { state: RecipeJobState; id: number } => {
  const started = startRecipeJob(initialRecipeJobState, {
    label: '김치찌개 만드는 중…',
    origin: 'o1',
    input: { kind: 'x' },
  });
  if (!started) throw new Error('should start');
  return started;
};

describe('startRecipeJob', () => {
  it('idle에서 시작하면 running', () => {
    const { state, id } = running();
    expect(state.job).toMatchObject({ phase: 'running', id, label: '김치찌개 만드는 중…' });
    expect(isRecipeJobBusy(state)).toBe(true);
  });

  it('하나가 도는 중이면 새로 시작하지 않는다', () => {
    const { state } = running();
    expect(startRecipeJob(state, { label: 'b', origin: 'o2', input: {} })).toBeNull();
  });

  it('끝난 결과가 남아 있어도 새로 시작하면 덮는다 (id는 늘어난다)', () => {
    const { state, id } = running();
    const done = finishRecipeJob(state, id, { type: 'done', recipe });
    const next = startRecipeJob(done, { label: 'c', origin: 'o1', input: {} });
    expect(next?.id).toBe(id + 1);
    expect(next?.state.job.phase).toBe('running');
  });
});

describe('finishRecipeJob', () => {
  it('완성 → done, 이름·출발 화면을 남긴다', () => {
    const { state, id } = running();
    const next = finishRecipeJob(state, id, { type: 'done', recipe });
    expect(next.job).toMatchObject({ phase: 'done', recipe, origin: 'o1' });
    expect(isRecipeJobBusy(next)).toBe(false);
  });

  it('오류·한도·거절·체험 끝', () => {
    const { state, id } = running();
    expect(finishRecipeJob(state, id, { type: 'error' }).job.phase).toBe('error');
    const quota = { quotaExceeded: true, canWatchAd: true, isPass: false } as const;
    expect(finishRecipeJob(state, id, { type: 'quota', quota }).job).toMatchObject({
      phase: 'quota',
      quota,
      input: { kind: 'x' },
    });
    expect(finishRecipeJob(state, id, { type: 'rejected', message: '안 돼요' }).job).toMatchObject({
      phase: 'rejected',
      message: '안 돼요',
      input: { kind: 'x' },
    });
    expect(finishRecipeJob(state, id, { type: 'locked' }).job.phase).toBe('locked');
  });

  it('다른 작업의 결과는 무시한다', () => {
    const { state, id } = running();
    expect(finishRecipeJob(state, id + 1, { type: 'error' })).toBe(state);
  });

  it('결과 없음(취소)은 조용히 idle', () => {
    const { state, id } = running();
    expect(finishRecipeJob(state, id, { type: 'silent' }).job.phase).toBe('idle');
  });
});

describe('dismissRecipeJob', () => {
  it('끝난 띠는 닫힌다', () => {
    const { state, id } = running();
    const done = finishRecipeJob(state, id, { type: 'done', recipe });
    expect(dismissRecipeJob(done).job.phase).toBe('idle');
  });

  it('도는 중에는 닫히지 않는다', () => {
    const { state } = running();
    expect(dismissRecipeJob(state)).toBe(state);
  });
});

describe('shouldOpenOnDone', () => {
  it('출발한 화면에 아직 있으면 바로 연다', () => {
    const { state, id } = running();
    const done = finishRecipeJob(state, id, { type: 'done', recipe });
    expect(shouldOpenOnDone(done, ['o1'])).toBe(true);
    expect(shouldOpenOnDone(done, ['o2'])).toBe(false);
    expect(shouldOpenOnDone(state, ['o1'])).toBe(false);
  });
});

describe('recipeJobBand', () => {
  it('상태별 문구', () => {
    const { state, id } = running();
    expect(recipeJobBand(initialRecipeJobState)).toBeNull();
    expect(recipeJobBand(state)).toEqual({
      tone: 'running',
      title: '김치찌개 만드는 중…',
      action: null,
      dismissible: false,
    });
    expect(recipeJobBand(finishRecipeJob(state, id, { type: 'done', recipe }))).toEqual({
      tone: 'done',
      title: '✅ 두부 김치찌개 완성!',
      action: '보러 가기 ›',
      dismissible: true,
    });
    expect(recipeJobBand(finishRecipeJob(state, id, { type: 'error' }))).toMatchObject({
      tone: 'error',
      title: '레시피를 만들지 못했어요. 다시 해 주세요',
      action: null,
    });
    const quota = { quotaExceeded: true, canWatchAd: true, isPass: false } as const;
    expect(recipeJobBand(finishRecipeJob(state, id, { type: 'quota', quota }))).toMatchObject({
      tone: 'warn',
      title: '오늘 만들 수 있는 레시피를 다 썼어요',
      action: '자세히 ›',
    });
    expect(
      recipeJobBand(finishRecipeJob(state, id, { type: 'rejected', message: '피해야 해요' }))
    ).toMatchObject({ tone: 'warn', title: '피해야 해요', action: '이름 고치기 ›' });
    expect(recipeJobBand(finishRecipeJob(state, id, { type: 'locked' }))).toMatchObject({
      tone: 'warn',
      title: '무료 체험을 모두 썼어요',
      action: '패스 보기 ›',
    });
  });

  it('이름 없는 완성 레시피', () => {
    const { state, id } = running();
    const done = finishRecipeJob(state, id, { type: 'done', recipe: { id: 1 } as never });
    expect(recipeJobBand(done)?.title).toBe('✅ 레시피 완성!');
  });
});

describe('recipeJobLabel', () => {
  it('재료 없이: 저탄수/무탄수', () => {
    expect(recipeJobLabel({ kind: 'ingredients', names: [], isZeroCarb: false })).toBe(
      '🍳 저탄수 레시피 만드는 중…'
    );
    expect(recipeJobLabel({ kind: 'ingredients', names: [], isZeroCarb: true })).toBe(
      '🍳 무탄수 레시피 만드는 중…'
    );
  });

  it('재료 2개까지 이름, 조사 으로/로', () => {
    expect(recipeJobLabel({ kind: 'ingredients', names: ['닭가슴살'], isZeroCarb: false })).toBe(
      '🍳 닭가슴살로 저탄수 레시피 만드는 중…'
    );
    expect(
      recipeJobLabel({ kind: 'ingredients', names: ['브로콜리', '두부'], isZeroCarb: true })
    ).toBe('🍳 브로콜리·두부로 무탄수 레시피 만드는 중…');
    expect(
      recipeJobLabel({ kind: 'ingredients', names: ['두부', '양배추'], isZeroCarb: false })
    ).toBe('🍳 두부·양배추로 저탄수 레시피 만드는 중…');
    expect(recipeJobLabel({ kind: 'ingredients', names: ['연어'], isZeroCarb: false })).toBe(
      '🍳 연어로 저탄수 레시피 만드는 중…'
    );
    expect(
      recipeJobLabel({ kind: 'ingredients', names: ['계란', '양파'], isZeroCarb: false })
    ).toBe('🍳 계란·양파로 저탄수 레시피 만드는 중…');
    expect(recipeJobLabel({ kind: 'ingredients', names: ['미역', '김'], isZeroCarb: false })).toBe(
      '🍳 미역·김으로 저탄수 레시피 만드는 중…'
    );
    expect(recipeJobLabel({ kind: 'ingredients', names: ['계란', '쌀'], isZeroCarb: false })).toBe(
      '🍳 계란·쌀로 저탄수 레시피 만드는 중…'
    );
  });

  it('3개 이상이면 외 N개', () => {
    expect(
      recipeJobLabel({
        kind: 'ingredients',
        names: ['닭가슴살', '브로콜리', '두부', '버섯'],
        isZeroCarb: true,
      })
    ).toBe('🍳 닭가슴살·브로콜리 외 2개로 무탄수 레시피 만드는 중…');
  });

  it('맞춤 추천: 꼭 넣을 재료가 없으면 맞춤 레시피', () => {
    expect(recipeJobLabel({ kind: 'recommend', names: [], isZeroCarb: false })).toBe(
      '🍳 맞춤 레시피 만드는 중…'
    );
    expect(recipeJobLabel({ kind: 'recommend', names: ['연어'], isZeroCarb: true })).toBe(
      '🍳 연어로 무탄수 레시피 만드는 중…'
    );
  });

  it('이름으로: 적은 이름 그대로', () => {
    expect(recipeJobLabel({ kind: 'byName', name: '김치찌개' })).toBe('🍳 김치찌개 만드는 중…');
  });
});
