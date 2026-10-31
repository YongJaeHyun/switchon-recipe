import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { FoodCheckResultCard } from 'components/foodCheck/FoodCheckResultCard';
import { Text } from 'components/common/Text';
import { KakaoShareButton } from 'components/share/KakaoShareButton';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useFoodCheck } from 'hooks/useFoodChecks';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import colors from 'tailwindcss/colors';
import { formatKoreanDate } from 'utils/date';
import { shareFoodCheck } from 'utils/shareKakao';

const INPUT_TYPE_LABEL = { front: '제품 앞면', label: '성분표', text: '이름 입력' } as const;

const Header = () => (
  <View className="flex-row items-center gap-3 px-5 pb-2 pt-4">
    <TouchableOpacity onPress={router.back} hitSlop={10}>
      <MaterialIcons name="arrow-back" size={28} color="black" />
    </TouchableOpacity>
    <Text className="text-xl font-bold">판정 결과</Text>
  </View>
);

// 판정 결과/기록 상세. 방금 판정한 결과는 캐시에 미리 들어 있어 바로 보인다
export default function FoodCheckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: check, isLoading, isError } = useFoodCheck(Number(id));

  // 성분표로 다시 보기: 입력 화면으로 돌아가 성분표 카메라를 연다
  const handleCheckLabel = () =>
    router.navigate({ pathname: '/foodCheck', params: { photoType: 'label' } });

  return (
    <SafeAreaView className="flex-1 bg-neutral-50">
      <Header />
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size={56} color={colors.green[600]} />
        </View>
      ) : !check ? (
        <View className="flex-1 items-center justify-center gap-2 px-5">
          <MaterialIcons name="search-off" size={40} color={colors.neutral[400]} />
          <Text className="text-neutral-500">
            {isError ? '기록을 불러오지 못했어요' : '기록을 찾을 수 없어요'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerClassName="gap-4 px-5 pb-10 pt-2">
          <View className="flex-row items-center gap-3">
            <View className="h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-neutral-100">
              {check.thumbUrl ? (
                <Image
                  source={{ uri: check.thumbUrl }}
                  style={{ width: 64, height: 64 }}
                  contentFit="cover"
                />
              ) : (
                <MaterialIcons
                  name={check.inputType === 'text' ? 'edit-note' : 'image'}
                  size={32}
                  color={colors.neutral[400]}
                />
              )}
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-sm text-neutral-500">
                {INPUT_TYPE_LABEL[check.inputType]}
                {check.inputText ? ` · ${check.inputText}` : ''}
              </Text>
              <Text className="text-xs text-neutral-400">{formatKoreanDate(check.createdAt)}</Text>
            </View>
          </View>

          <FoodCheckResultCard check={check} onCheckLabel={handleCheckLabel} />

          {/* 판정이 나온 결과만 카톡으로 (받은 친구는 앱의 편의점 판정으로) */}
          {check.verdict && (
            <KakaoShareButton label="친구에게 알려주기" onPress={() => shareFoodCheck(check)} />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
