import { IngredientsProps } from 'components/recipeCreation/Ingredients';
import {
  allulose,
  avocado,
  beans,
  beef,
  bokChoy,
  broccoli,
  butter,
  cabbage,
  carrot,
  cheese,
  cherryTomato,
  chestnut,
  chicken,
  chickenStock,
  chives,
  clam,
  crammy,
  cucumber,
  curcuma,
  dasima,
  driedTofu,
  duck,
  eastCabbage,
  egg,
  eggplant,
  garlic,
  ggwari,
  gim,
  gochu,
  gochuPaste,
  kimchi,
  kongdambaek,
  kongnamul,
  leek,
  lemonJuice,
  lettuce,
  mackerel,
  memilMyun,
  milk,
  minari,
  mixedRice,
  muk,
  myungran,
  nakji,
  natto,
  nutari,
  nuts,
  oatmeal,
  octopus,
  onion,
  orientalSauce,
  oyster,
  oysterSauce,
  pangi,
  paprika,
  peanutButter,
  perilla,
  perillaOil,
  pork,
  pyogo,
  quinoa,
  radish,
  redPepperPowder,
  rice,
  ricecake,
  ricepaper,
  saesongi,
  salmon,
  sangchu,
  sanggang,
  seaweed,
  sesameOil,
  shrimp,
  softTofu,
  soybeanPaste,
  spinach,
  squid,
  sukju,
  sweetPotato,
  sweetPumpkin,
  tofu,
  tofuMyun,
  tomato,
  tomatoSauce,
  tunaCan,
  vinegar,
  wasabi,
  yogurt,
  zucchini,
} from 'const/assets';
import { IIngredient } from 'types/recipe';

export const firstWeekIngredients: Omit<IIngredient, 'week'>[] = [
  {
    name: '현미잡곡밥',
    image: mixedRice,
  },
  {
    name: '흰쌀밥',
    image: rice,
  },
  {
    name: '두부면',
    image: tofuMyun,
  },
  {
    name: '콩담백면',
    image: kongdambaek,
  },
  {
    name: '두부',
    image: tofu,
  },
  {
    name: '순두부',
    image: softTofu,
  },
  {
    name: '포두부',
    image: driedTofu,
  },
  {
    name: '달걀',
    image: egg,
  },
  {
    name: '닭고기',
    image: chicken,
  },
  {
    name: '돼지고기',
    image: pork,
  },
  {
    name: '소고기',
    image: beef,
  },
  {
    name: '오리고기',
    image: duck,
  },
  {
    name: '새우',
    image: shrimp,
  },
  {
    name: '오징어',
    image: squid,
  },
  {
    name: '낙지',
    image: nakji,
  },
  {
    name: '문어',
    image: octopus,
  },
  {
    name: '고등어',
    image: mackerel,
  },
  {
    name: '연어',
    image: salmon,
  },
  {
    name: '조개',
    image: clam,
  },
  {
    name: '굴',
    image: oyster,
  },
  {
    name: '참치캔',
    image: tunaCan,
  },
  {
    name: '묵',
    image: muk,
  },
  {
    name: '대파',
    image: leek,
  },
  {
    name: '양파',
    image: onion,
  },
  {
    name: '마늘',
    image: garlic,
  },
  {
    name: '생강',
    image: sanggang,
  },
  {
    name: '고추',
    image: gochu,
  },
  {
    name: '꽈리고추',
    image: ggwari,
  },
  {
    name: '고춧가루',
    image: redPepperPowder,
  },
  {
    name: '강황',
    image: curcuma,
  },
  {
    name: '상추',
    image: sangchu,
  },
  {
    name: '양상추',
    image: lettuce,
  },
  {
    name: '양배추',
    image: cabbage,
  },
  {
    name: '알배추',
    image: eastCabbage,
  },
  {
    name: '콩나물',
    image: kongnamul,
  },
  {
    name: '숙주',
    image: sukju,
  },
  {
    name: '무',
    image: radish,
  },
  {
    name: '당근',
    image: carrot,
  },
  {
    name: '가지',
    image: eggplant,
  },
  {
    name: '오이',
    image: cucumber,
  },
  {
    name: '미나리',
    image: minari,
  },
  {
    name: '부추',
    image: chives,
  },
  {
    name: '브로콜리',
    image: broccoli,
  },
  {
    name: '시금치',
    image: spinach,
  },
  {
    name: '깻잎',
    image: perilla,
  },
  {
    name: '파프리카',
    image: paprika,
  },
  {
    name: '아보카도',
    image: avocado,
  },
  {
    name: '청경채',
    image: bokChoy,
  },
  {
    name: '애호박',
    image: zucchini,
  },
  {
    name: '김',
    image: gim,
  },
  {
    name: '미역',
    image: seaweed,
  },
  {
    name: '다시마',
    image: dasima,
  },
  {
    name: '팽이버섯',
    image: pangi,
  },
  {
    name: '새송이버섯',
    image: saesongi,
  },
  {
    name: '표고버섯',
    image: pyogo,
  },
  {
    name: '느타리버섯',
    image: nutari,
  },
  {
    name: '냉압착 들기름',
    image: perillaOil,
  },
  {
    name: '참기름',
    image: sesameOil,
  },
  {
    name: '땅콩버터',
    image: peanutButter,
  },
  {
    name: '무가당 요거트',
    image: yogurt,
  },
  {
    name: '와사비',
    image: wasabi,
  },
  {
    name: '식초',
    image: vinegar,
  },
  {
    name: '레몬즙',
    image: lemonJuice,
  },
  {
    name: '된장',
    image: soybeanPaste,
  },
  {
    name: '굴소스',
    image: oysterSauce,
  },
  {
    name: '알룰로스',
    image: allulose,
  },
  {
    name: '오리엔탈소스',
    image: orientalSauce,
  },
];

export const secondWeekIngredients: Omit<IIngredient, 'week'>[] = [
  {
    name: '오트밀',
    image: oatmeal,
  },
  {
    name: '라이스페이퍼',
    image: ricepaper,
  },
  {
    name: '퀴노아',
    image: quinoa,
  },
  {
    name: '메밀면',
    image: memilMyun,
  },
  {
    name: '콩류',
    image: beans,
  },
  {
    name: '낫토',
    image: natto,
  },
  {
    name: '명란젓',
    image: myungran,
  },
  {
    name: '게맛살',
    image: crammy,
  },
  {
    name: '견과류',
    image: nuts,
  },
  {
    name: '우유',
    image: milk,
  },
  {
    name: '치즈',
    image: cheese,
  },
  {
    name: '김치',
    image: kimchi,
  },
];

export const thirdWeekIngredients: Omit<IIngredient, 'week'>[] = [
  {
    name: '떡국떡',
    image: ricecake,
  },
  {
    name: '단호박',
    image: sweetPumpkin,
  },
  {
    name: '고구마',
    image: sweetPotato,
  },
  {
    name: '밤',
    image: chestnut,
  },
  {
    name: '버터',
    image: butter,
  },
  {
    name: '방울토마토',
    image: cherryTomato,
  },
  {
    name: '토마토',
    image: tomato,
  },
  {
    name: '치킨스톡',
    image: chickenStock,
  },
  {
    name: '저당토마토소스',
    image: tomatoSauce,
  },
  {
    name: '고추장',
    image: gochuPaste,
  },
];

export const allIngredients: IngredientsProps[] = [
  {
    title: '1주차',
    week: 1,
    ingredientList: firstWeekIngredients,
  },
  {
    title: '2주차',
    week: 2,
    ingredientList: secondWeekIngredients,
  },
  {
    title: '3주차 +',
    week: 3,
    ingredientList: thirdWeekIngredients,
  },
];
