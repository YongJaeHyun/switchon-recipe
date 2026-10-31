import { describe, expect, it } from 'vitest';
import { kakaoLinkRoute, parseKakaoLink, recipeDetailHref } from './kakaoLink';

const recipe = JSON.stringify({
  id: 12,
  recipe_name: '두부 & 계란 볶음 100%',
  cooking_time: 10,
  ingredients: JSON.stringify([{ name: '두부', amount: '1모' }]),
  cooking_steps: JSON.stringify(['굽는다']),
  nutrition: JSON.stringify({ calories: 200 }),
  image_uri: null,
});
const link = (query: string, base = 'switchon-recipe://kakaolink') => `${base}?${query}`;
const recipeLink = link(`recipe=${encodeURIComponent(recipe)}`);

describe('parseKakaoLink (카톡 메시지 버튼으로 연 주소 해석)', () => {
  it('레시피 링크면 레시피 JSON을 꺼낸다', () => {
    expect(parseKakaoLink(recipeLink)).toEqual({ type: 'recipe', recipe });
  });

  it('카카오 앱 실행 주소(kakao{앱키}://kakaolink)도 같다', () => {
    expect(
      parseKakaoLink(link(`recipe=${encodeURIComponent(recipe)}`, 'kakao1234abcd://kakaolink'))
    ).toEqual({
      type: 'recipe',
      recipe,
    });
  });

  it('주소가 없거나 kakaolink가 아니면 null', () => {
    expect(parseKakaoLink(null)).toBeNull();
    expect(parseKakaoLink(undefined)).toBeNull();
    expect(parseKakaoLink('')).toBeNull();
    expect(
      parseKakaoLink(`switchon-recipe://pass?recipe=${encodeURIComponent(recipe)}`)
    ).toBeNull();
  });

  it('레시피가 없거나 깨졌으면 null (상세 화면이 JSON.parse로 죽지 않게)', () => {
    expect(parseKakaoLink(link('recipe='))).toBeNull();
    expect(parseKakaoLink(link('recipe=123'))).toBeNull();
    expect(parseKakaoLink(link('recipe=%7Bbroken'))).toBeNull();
    expect(parseKakaoLink(link('recipe=%E0%A4%A'))).toBeNull();
    expect(parseKakaoLink(link(`recipe=${encodeURIComponent('null')}`))).toBeNull();
    expect(parseKakaoLink(link(`recipe=${encodeURIComponent('[1]')}`))).toBeNull();
    const withoutId = { ...JSON.parse(recipe), id: undefined };
    expect(
      parseKakaoLink(link(`recipe=${encodeURIComponent(JSON.stringify(withoutId))}`))
    ).toBeNull();
    const brokenSteps = { ...JSON.parse(recipe), cooking_steps: '{oops' };
    expect(
      parseKakaoLink(link(`recipe=${encodeURIComponent(JSON.stringify(brokenSteps))}`))
    ).toBeNull();
    const nullIngredients = { ...JSON.parse(recipe), ingredients: null };
    expect(
      parseKakaoLink(link(`recipe=${encodeURIComponent(JSON.stringify(nullIngredients))}`))
    ).toBeNull();
  });
});

describe('parseKakaoLink: 같이 하자 초대 (invite=시작일)', () => {
  it('시작일을 꺼낸다', () => {
    expect(parseKakaoLink(link('invite=2026-11-02'))).toEqual({
      type: 'invite',
      startDate: '2026-11-02',
    });
    expect(parseKakaoLink(link('invite=2026-11-02', 'kakao1234abcd://kakaolink'))).toEqual({
      type: 'invite',
      startDate: '2026-11-02',
    });
  });

  it('날짜가 깨졌으면 null', () => {
    expect(parseKakaoLink(link('invite='))).toBeNull();
    expect(parseKakaoLink(link('invite=2026-13-01'))).toBeNull();
    expect(parseKakaoLink(link('invite=tomorrow'))).toBeNull();
  });

  it('레시피가 같이 있으면 레시피가 먼저', () => {
    expect(parseKakaoLink(`${recipeLink}&invite=2026-11-02`)?.type).toBe('recipe');
  });
});

describe('parseKakaoLink: 앱만 여는 링크 (완주 인증 등)', () => {
  it('아는 파라미터가 없으면 앱만 연다 (오류 아님)', () => {
    expect(parseKakaoLink(link('share=completion'))).toEqual({ type: 'open' });
    expect(parseKakaoLink('switchon-recipe://kakaolink')).toEqual({ type: 'open' });
  });

  it('앱만 열면 시작 화면으로 (로그인했으면 홈)', () => {
    expect(
      kakaoLinkRoute({ target: { type: 'open' }, isLoggedIn: true, isOnboarded: true })
    ).toEqual({ href: '/', afterLoginHref: null });
  });
});

describe('parseKakaoLink: 편의점 판정 (foodCheck=1)', () => {
  it('편의점 판정 화면으로', () => {
    expect(parseKakaoLink(link('foodCheck=1'))).toEqual({ type: 'foodCheck' });
  });

  it('로그인·온보딩을 마쳤으면 바로, 아니면 그 뒤에 판정 화면', () => {
    const target = { type: 'foodCheck' } as const;
    expect(kakaoLinkRoute({ target, isLoggedIn: true, isOnboarded: true })).toEqual({
      href: '/foodCheck',
      afterLoginHref: null,
    });
    expect(kakaoLinkRoute({ target, isLoggedIn: false, isOnboarded: null })).toEqual({
      href: '/',
      afterLoginHref: '/foodCheck',
    });
  });
});

describe('recipeDetailHref', () => {
  it('레시피 JSON을 주소에 안전하게 넣는다 (&·% 같은 글자가 있어도)', () => {
    const href = recipeDetailHref(recipe);
    expect(href.startsWith('/recipeDetail?recipe=')).toBe(true);
    expect(new URL(href, 'switchon-recipe://x').searchParams.get('recipe')).toBe(recipe);
  });
});

describe('kakaoLinkRoute (받은 사람을 어디로 보낼지)', () => {
  const target = { type: 'recipe', recipe } as const;

  it('로그인·온보딩을 마친 사람은 바로 레시피로 (지금과 같다)', () => {
    expect(kakaoLinkRoute({ target, isLoggedIn: true, isOnboarded: true })).toEqual({
      href: recipeDetailHref(recipe),
      afterLoginHref: null,
    });
  });

  it('로그인 안 했으면 시작 화면으로 보내고 레시피는 로그인·온보딩 뒤로 미룬다', () => {
    expect(kakaoLinkRoute({ target, isLoggedIn: false, isOnboarded: null })).toEqual({
      href: '/',
      afterLoginHref: recipeDetailHref(recipe),
    });
  });

  it('로그인했지만 온보딩 전이면 시작 화면(→ 온보딩)으로 보내고 레시피는 미룬다', () => {
    expect(kakaoLinkRoute({ target, isLoggedIn: true, isOnboarded: false })).toEqual({
      href: '/',
      afterLoginHref: recipeDetailHref(recipe),
    });
    expect(kakaoLinkRoute({ target, isLoggedIn: true, isOnboarded: undefined })).toEqual({
      href: '/',
      afterLoginHref: recipeDetailHref(recipe),
    });
  });

  it('초대: 이미 시작한 사람은 홈으로 (안내만), 아니면 시작 화면 → 온보딩에서 친구 시작일을 고른다', () => {
    const invite = { type: 'invite', startDate: '2026-11-02' } as const;
    expect(kakaoLinkRoute({ target: invite, isLoggedIn: true, isOnboarded: true })).toEqual({
      href: '/(tabs)/home',
      afterLoginHref: null,
      invite: '2026-11-02',
    });
    expect(kakaoLinkRoute({ target: invite, isLoggedIn: false, isOnboarded: null })).toEqual({
      href: '/',
      afterLoginHref: null,
      invite: '2026-11-02',
    });
    expect(kakaoLinkRoute({ target: invite, isLoggedIn: true, isOnboarded: false })).toEqual({
      href: '/',
      afterLoginHref: null,
      invite: '2026-11-02',
    });
  });

  it('주소가 깨졌으면 시작 화면(로그인했으면 홈)으로, 미루는 것도 없다', () => {
    expect(kakaoLinkRoute({ target: null, isLoggedIn: true, isOnboarded: true })).toEqual({
      href: '/',
      afterLoginHref: null,
    });
    expect(kakaoLinkRoute({ target: null, isLoggedIn: false, isOnboarded: null })).toEqual({
      href: '/',
      afterLoginHref: null,
    });
  });
});
