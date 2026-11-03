import type { ImageSourcePropType } from 'react-native';
import type { PassFeatureId } from './passFeatures';

// 패스 기능의 실제 앱 화면 (예시 데이터로 찍음, 가로 606 : 세로 1000 jpg).
// 패스 화면 갤러리와 "패스 기능이에요" 창이 같이 쓴다. 화면이 바뀌면 이 이미지만 바꾼다
export const PASS_FEATURE_IMAGES: Record<PassFeatureId, ImageSourcePropType> = {
  foodCheck: require('../assets/images/pass/food-check.jpg'),
  byName: require('../assets/images/pass/by-name.jpg'),
  recommend: require('../assets/images/pass/recommend.jpg'),
  report: require('../assets/images/pass/report.jpg'),
  inbody: require('../assets/images/pass/inbody.jpg'),
};
