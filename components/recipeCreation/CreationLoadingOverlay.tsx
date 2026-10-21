import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { Link } from 'expo-router';
import { View } from 'react-native';
import Loading from './Loading';

// 레시피를 만드는 동안 화면을 덮는 로딩 (low/zero 제작 화면, 맞춤 추천의 새로 만들기)
// showTabTip: 탭 바가 보이는 화면에서만 "아래 탐색 탭" 안내를 보여준다
export default function CreationLoadingOverlay({ showTabTip = true }: { showTabTip?: boolean }) {
  return (
    <View className="absolute inset-0 z-50 items-center justify-center">
      <View className="absolute inset-0 bg-black/40" />
      <View className="translate-y-8">
        <Loading />
        <Link href={'/(tabs)/explore'} asChild>
          <RippleButton outerClassName="bg-white self-center mb-6" className="px-4 py-3">
            <Text className="text-green-600">다른 레시피 둘러보기</Text>
          </RippleButton>
        </Link>
        {showTabTip && (
          <Text className="border-b-4 border-green-300 font-bold text-white">
            Tip. 아래 탐색 탭으로도 이동할 수 있어요!
          </Text>
        )}
      </View>
    </View>
  );
}
