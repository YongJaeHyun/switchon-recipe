import { seosusa } from 'es-hangul';
import { APP_VERSION } from './const';
import { newIngredients } from './ingredients';

const { month, week, names } = newIngredients;

export const notices = [
  `🚀 [v${APP_VERSION} 업데이트] - 재료 검색 개선 및 랜덤 레시피 제작 개선`,
  `🥗 [${month}월 ${seosusa(week)}주 재료 업데이트] - ${names.join(', ')} 추가`,
];
