import { seosusa } from 'es-hangul';
import { APP_VERSION } from './const';
import { newIngredients } from './ingredients';

const { month, week, names } = newIngredients;

export const notices = [
  `🚀 [v${APP_VERSION} 업데이트] - 카카오톡 공유 문구 수정 및 문의사항 UI 개선`,
  `🥗 [${month}월 ${seosusa(week)}주 재료 업데이트] - ${names.join(', ')} 추가`,
];
