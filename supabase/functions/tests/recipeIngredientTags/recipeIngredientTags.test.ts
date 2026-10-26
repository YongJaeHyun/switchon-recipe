import { describe, expect, it, vi } from 'vitest';
import {
  buildIngredientTagMatcher,
  ingredientTagsFor,
  loadIngredientTags,
  planIngredientTagUpdates,
  sameTags,
} from '../../_shared/recipeIngredientTags.ts';

// 2026-10-26 실데이터 ingredient(is_active) 중 아래 예시에 걸리는 행만 그대로 옮겼다
const REGISTERED = [
  { name: '현미밥', sub_keywords: [] },
  { name: '두부', sub_keywords: [] },
  { name: '계란', sub_keywords: ['달걀', '반숙', '반숙란'] },
  { name: '닭가슴살', sub_keywords: [] },
  { name: '닭다리살', sub_keywords: [] },
  { name: '닭안심', sub_keywords: [] },
  { name: '돼지목살', sub_keywords: [] },
  { name: '소고기', sub_keywords: [] },
  { name: '생연어', sub_keywords: [] },
  { name: '대파', sub_keywords: [] },
  { name: '양파', sub_keywords: [] },
  { name: '마늘', sub_keywords: [] },
  { name: '올리브', sub_keywords: [] },
  { name: '무', sub_keywords: [] },
  { name: '파프리카', sub_keywords: [] },
  { name: '아보카도', sub_keywords: [] },
  { name: '다시마', sub_keywords: [] },
  { name: '표고버섯', sub_keywords: [] },
  { name: '새송이버섯', sub_keywords: [] },
  { name: '올리브유', sub_keywords: [] },
  { name: '냉압착 들기름', sub_keywords: [] },
  { name: '간장', sub_keywords: [] },
  { name: '알룰로스', sub_keywords: [] },
  { name: '메밀면', sub_keywords: [] },
  { name: '껍질콩(그린빈)', sub_keywords: [] },
  { name: '게맛살', sub_keywords: ['크래미', '크레미'] },
  { name: '견과류', sub_keywords: ['땅콩', '아몬드'] },
  { name: '우유', sub_keywords: [] },
  { name: '앞다리살', sub_keywords: ['돼지 앞다리살', '전지'] },
  { name: '치킨스톡', sub_keywords: [] },
  {
    name: '샤브용소고기앞다리살',
    sub_keywords: ['소고기앞다리살', '샤브샤브용 소고기', '소고기 전지'],
  },
];

const matcher = buildIngredientTagMatcher(REGISTERED);
const json = (...items: unknown[]) => JSON.stringify(items);
const tags = (...items: unknown[]) => ingredientTagsFor(json(...items), matcher);
const item = (name: string) => ({ name, isOptional: false, amount: '1개' });

describe('ingredientTagsFor: 실데이터 예시', () => {
  it.each([
    // 괄호 설명은 떼고 본 이름으로 맞춘다
    ['현미밥 (지은 밥)', ['현미밥']],
    ['파프리카 (빨강/노랑)', ['파프리카']],
    ['소고기 (샤브샤브 또는 불고기용 얇은 부위)', ['소고기']],
    ['알룰로스(또는 설탕 대체 감미료)', ['알룰로스']],
    ['두부 (단단한 것, 물기 제거)', ['두부']],
    // 손질·형태 수식어는 부분 일치로 맞춘다
    ['다진 마늘', ['마늘']],
    ['대파 (흰 부분)', ['대파']],
    ['달걀', ['계란']],
    ['크래미', ['게맛살']],
    ['냉압착들기름', ['냉압착 들기름']],
    // 등록 이름 원문(괄호 포함)을 태그로 쓴다
    ['껍질콩', ['껍질콩(그린빈)']],
    // 본 이름이 맞지 않으면 괄호 안 대안으로 맞춘다
    ['닭고기 (닭가슴살 또는 닭다리살)', ['닭가슴살', '닭다리살']],
    ['버섯 (표고버섯 또는 새송이버섯)', ['새송이버섯', '표고버섯']],
    ['돼지고기 (목살 또는 앞다리살)', ['앞다리살']],
    // 본 이름이 맞으면 괄호 안은 보지 않는다
    ['양파 (또는 대파)', ['양파']],
    // "또는"·"/"로 나열된 본 이름은 각각 맞춘다
    ['닭가슴살 또는 닭안심', ['닭가슴살', '닭안심']],
    ['간장/알룰로스', ['간장', '알룰로스']],
    // 괄호 안 쓰임새 설명은 태그로 쓰지 않는다
    ['소금 (닭가슴살 밑간용)', []],
    ['소금 (간장으로 간이 부족할 경우)', []],
    ['식용유 (계란 프라이용)', []],
    ['물 (다시마 우린 물 제조용)', []],
    ['닭고기(닭가슴살 추천)', ['닭가슴살']],
    // 기름은 기름으로만 맞춘다: 아보카도 오일 → 아보카도로 태그하지 않는다, 오일은 유로 맞춘다
    ['올리브 오일 1큰술', ['올리브유']],
    ['엑스트라 버진 올리브 오일', ['올리브유']],
    ['아보카도 오일', []],
    ['올리브유 또는 아보카도유', ['올리브유']],
    ['식용유 (아보카도 오일 또는 올리브 오일)', ['올리브유']],
    ['식용유 (아보카도 또는 코코넛 오일)', []],
    ['들기름 또는 냉압착 들기름', ['냉압착 들기름']],
    ['무가당 아몬드 우유', ['견과류']],
    ['올리브유 (엑스트라 버진)', ['올리브유']],
    // 육수는 재료를 실제로 쓰므로 그 재료로 맞춘다
    ['육수 (멸치 다시마 또는 닭 육수)', ['다시마']],
    ['물 또는 다시마 육수', ['다시마']],
    ['치킨스톡', ['치킨스톡']],
    // 미등록 재료는 태그가 없다
    ['후추', []],
    ['소금 약간', []],
    ['닭고기 (가슴살 또는 안심)', []],
  ])('%s → %j', (name, expected) => {
    expect(tags(item(name))).toEqual(expected);
  });

  it('문자열 항목의 분량은 떼고 맞춘다 (한 글자 등록 이름도)', () => {
    expect(tags('무 300g', '메밀면 1인분 (약 100g)', '다진 마늘 0.5큰술', '생연어 1/2개')).toEqual(
      ['메밀면', '마늘', '무', '생연어'].sort()
    );
  });

  it('한 글자 등록 이름은 다른 재료 안에서 잡지 않는다', () => {
    expect(tags(item('무순'), item('단무지'))).toEqual([]);
  });
});

describe('ingredientTagsFor: 모양', () => {
  it('중복 없이 정렬해 돌려준다 (선택 재료 포함)', () => {
    expect(
      tags(
        item('양파'),
        { name: '다진 마늘', isOptional: true, amount: '1큰술' },
        item('양파 1/2개')
      )
    ).toEqual(['마늘', '양파']);
  });

  it('입력 순서가 달라도 같은 결과', () => {
    expect(tags(item('마늘'), item('양파'))).toEqual(tags(item('양파'), item('마늘')));
  });

  it.each([null, '', 'not json', '{"name":"양파"}', '123', 'null'])(
    '잘못된 입력 %j → []',
    (input) => {
      expect(ingredientTagsFor(input as string | null, matcher)).toEqual([]);
    }
  );

  it('이름이 없는 항목은 건너뛴다', () => {
    expect(tags({ amount: '1개' }, null, 3, { name: 7 }, item('양파'))).toEqual(['양파']);
  });

  it('등록 재료가 없으면 항상 []', () => {
    expect(ingredientTagsFor(json(item('양파')), buildIngredientTagMatcher([]))).toEqual([]);
  });
});

describe('loadIngredientTags', () => {
  it('등록 재료를 읽어 태그를 만든다', async () => {
    const result = await loadIngredientTags(async () => REGISTERED, json(item('다진 마늘')));
    expect(result).toEqual(['마늘']);
  });

  it('등록 재료를 못 읽으면 []를 돌려주고 로그만 남긴다 (레시피 생성을 막지 않음)', async () => {
    const log = vi.fn();
    const result = await loadIngredientTags(
      async () => {
        throw new Error('db down');
      },
      json(item('양파')),
      log
    );
    expect(result).toEqual([]);
    expect(log).toHaveBeenCalledOnce();
  });
});

describe('planIngredientTagUpdates', () => {
  it('태그가 달라진 행만 돌려준다', () => {
    const rows = [
      { id: 1, ingredients: json(item('양파')), ingredient_tags: ['양파'] },
      { id: 2, ingredients: json(item('양파'), item('마늘')), ingredient_tags: [] },
      { id: 3, ingredients: json(item('후추')), ingredient_tags: [] },
      { id: 4, ingredients: json(item('후추')), ingredient_tags: ['후추'] },
      { id: 5, ingredients: json(item('마늘'), item('양파')), ingredient_tags: ['양파', '마늘'] },
      { id: 6, ingredients: null, ingredient_tags: null },
    ];
    expect(planIngredientTagUpdates(rows, matcher)).toEqual([
      { id: 2, before: [], tags: ['마늘', '양파'] },
      { id: 4, before: ['후추'], tags: [] },
    ]);
  });
});

describe('sameTags', () => {
  it('순서와 무관하게 같은 집합인지 본다', () => {
    expect(sameTags(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameTags(['a'], ['a', 'b'])).toBe(false);
    expect(sameTags(null, [])).toBe(true);
  });
});
