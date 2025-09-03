import { seosusa } from 'es-hangul';
import { APP_VERSION } from './const';
import { newIngredients } from './ingredients';

const { month, week, names } = newIngredients;

export const notices = [
  `🚀 [v${APP_VERSION} 업데이트] - 저장한 레시피 필터링 및 정렬 기능 추가`,
  `🥗 [${month}월 ${seosusa(week)}주 재료 업데이트] - ${names.join(', ')} 추가`,
];
