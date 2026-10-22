import { View } from 'react-native';
import Loading from './Loading';

// 레시피를 만드는 동안 화면을 덮는 로딩 (low/zero 제작 화면, 맞춤 추천의 새로 만들기)
// 제작 화면은 탭 밖 최상위 화면이라 다른 화면으로 이동하면 제작 화면이 닫혀 완성된 레시피로 넘어가지 못하므로
// 이동 링크는 두지 않는다
export default function CreationLoadingOverlay() {
  return (
    <View className="absolute inset-0 z-50 items-center justify-center">
      <View className="absolute inset-0 bg-black/40" />
      <View className="translate-y-8">
        <Loading />
      </View>
    </View>
  );
}
