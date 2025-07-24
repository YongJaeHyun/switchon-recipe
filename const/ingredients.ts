import { IngredientsProps } from 'components/recipeCreation/Ingredients';
import { IIngredient } from 'types/recipe';
import {
  avocado,
  bokChoy,
  broccoli,
  cabbage,
  carrot,
  cucumber,
  curcuma,
  eastCabbage,
  garlic,
  logo,
  onion,
  paprika,
  perillaOil,
  radish,
  redPepperPowder,
  softTofu,
  spinach,
  tofu,
} from 'utils/assets';

export const firstWeekIngredients: IIngredient[] = [
  {
    name: '양파',
    image: onion,
  },
  {
    name: '마늘',
    image: garlic,
  },
  {
    name: '고추',
    image: redPepperPowder,
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
    image: cabbage,
  },
  {
    name: '양상추',
    image: cabbage,
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
    image: eastCabbage,
  },
  {
    name: '숙주',
    image: eastCabbage,
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
    image: carrot,
  },
  {
    name: '오이',
    image: cucumber,
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
    name: '냉압착 들기름',
    image: perillaOil,
  },
  {
    name: '두부',
    image: tofu,
  },
  {
    name: '연두부',
    image: softTofu,
  },
  {
    name: '고구마',
    image: logo,
  },
  {
    name: '현미잡곡밥',
    image: logo,
  },
  {
    name: '흰쌀밥',
    image: logo,
  },
  {
    name: '미역',
    image: logo,
  },
  {
    name: '다시마',
    image: logo,
  },
  {
    name: '톳',
    image: logo,
  },
  {
    name: '팽이버섯',
    image: logo,
  },
  {
    name: '새송이버섯',
    image: logo,
  },
  {
    name: '송이버섯',
    image: logo,
  },
  {
    name: '양송이버섯',
    image: logo,
  },
  {
    name: '느타리버섯',
    image: logo,
  },
  {
    name: '목이버섯',
    image: logo,
  },
  {
    name: '달걀',
    image: logo,
  },
  {
    name: '고등어',
    image: logo,
  },
  {
    name: '연어',
    image: logo,
  },
  {
    name: '굴',
    image: logo,
  },
  {
    name: '조개',
    image: logo,
  },
  {
    name: '새우',
    image: logo,
  },
  {
    name: '오징어',
    image: logo,
  },
  {
    name: '낙지',
    image: logo,
  },
  {
    name: '문어',
    image: logo,
  },
  {
    name: '닭가슴살',
    image: logo,
  },
  {
    name: '돼지고기',
    image: logo,
  },
  {
    name: '소고기',
    image: logo,
  },
];

export const secondWeekIngredients: IIngredient[] = [
  {
    name: '치즈',
    image: logo,
  },
  {
    name: '퀴노아',
    image: logo,
  },
  {
    name: '콩류',
    image: logo,
  },
  {
    name: '김치',
    image: logo,
  },
];

export const thirdForthWeekIngredients: IIngredient[] = [
  {
    name: '토마토',
    image: logo,
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
    title: '3, 4주차',
    week: 3,
    ingredientList: thirdForthWeekIngredients,
  },
];
