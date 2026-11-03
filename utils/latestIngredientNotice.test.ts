import { IngredientRecord } from 'types/recipe';
import { describe, expect, it } from 'vitest';
import { getLatestIngredientNotice } from './latestIngredientNotice';

const record = (
  name: string,
  createdAt: string,
  source: IngredientRecord['source'] = 'auto'
): IngredientRecord => ({ name, createdAt, source, week: 1, image: '', sortOrder: 0 });

describe('getLatestIngredientNotice', () => {
  it('returns null when there are no auto or manual ingredients', () => {
    expect(getLatestIngredientNotice([record('계란', '2026-06-08T03:00:00Z', 'seed')])).toBeNull();
  });

  it('groups names by the KST month and week of the latest ingredient', () => {
    expect(
      getLatestIngredientNotice([
        record('늦게', '2026-06-10T03:00:00Z', 'manual'),
        record('이전주', '2026-05-30T03:00:00Z'),
        record('먼저', '2026-06-08T03:00:00Z'),
      ])
    ).toMatchObject({ month: 6, week: 2, names: ['먼저', '늦게'] });
  });

  it('uses the KST date at the day boundary', () => {
    // 2026-06-07T16:00Z = 2026-06-08 01:00 KST → 2째 주
    expect(getLatestIngredientNotice([record('경계', '2026-06-07T16:00:00Z')])).toMatchObject({
      month: 6,
      week: 2,
      names: ['경계'],
    });
  });

  it('ignores seed ingredients in the same week', () => {
    expect(
      getLatestIngredientNotice([
        record('시드', '2026-06-09T03:00:00Z', 'seed'),
        record('자동', '2026-06-08T03:00:00Z'),
      ])?.names
    ).toEqual(['자동']);
  });
});

describe('getLatestIngredientNotice items', () => {
  it('재료마다 쓸 수 있는 주차와 탄수화물 여부를 같이 준다 (업데이트 재료 창)', () => {
    const list: IngredientRecord[] = [
      { ...record('병아리콩', '2026-06-08T03:00:00Z'), week: 2, isCarbohydrate: true },
      { ...record('케일', '2026-06-09T03:00:00Z'), week: 1 },
    ];
    expect(getLatestIngredientNotice(list)?.items).toEqual([
      { name: '병아리콩', week: 2, isCarbohydrate: true },
      { name: '케일', week: 1, isCarbohydrate: false },
    ]);
  });
});
