import { MaterialIcons } from '@expo/vector-icons';
import { InquiryAPI } from 'api/InquiryAPI';
import { Text } from 'components/common/Text';
import { CategoryBadge } from 'components/inquiry/CategoryBadge';
import { StatusBadge } from 'components/inquiry/StatusBadge';
import { logo } from 'const/assets';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryWith402Retry } from 'hooks/useCustomQuery';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import colors from 'tailwindcss/colors';
import { formatKoreanDate } from 'utils/date';

const AnswerBubble = ({ children, answered }: { children?: React.ReactNode; answered: boolean }) =>
  answered ? (
    <View className={`flex-row items-start gap-2`}>
      <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-green-500 bg-white">
        <Image style={{ width: '130%', height: '130%' }} source={logo} />
      </View>
      <View className={`mt-4 max-w-[80%] rounded-2xl rounded-tl-none bg-green-300 px-4 py-2`}>
        <Text>{children}</Text>
      </View>
    </View>
  ) : (
    <View className={`items-center`}>
      <View className={`my-1.5 rounded-2xl bg-gray-200 px-4 py-2`}>
        <Text>아직 답변이 등록되지 않았습니다.</Text>
      </View>
    </View>
  );

export default function InquiryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: inquiry, isLoading } = useQueryWith402Retry({
    queryKey: ['inquiry', id],
    queryFn: () => InquiryAPI.selectOneById(Number(id)),
    enabled: !!id,
  });

  const answerPrefix = '문의해주셔서 감사합니다!\n남겨주신 문의에 대해 확인 후 답변드립니다.\n\n';
  const answer = answerPrefix + inquiry?.answer;

  if (isLoading) {
    return (
      <View className="absolute inset-0 z-50 items-center justify-center">
        <ActivityIndicator size={56} color={colors.emerald[300]} />
      </View>
    );
  }
  return (
    <SafeAreaView className="flex-1 bg-white p-4">
      <ScrollView>
        <View>
          <View className="flex-row items-center gap-4">
            <TouchableOpacity onPress={router.back}>
              <MaterialIcons name="arrow-back" size={28} color="black" />
            </TouchableOpacity>
            <Text className="text-xl font-bold">내 문의사항</Text>
          </View>

          <View className="my-5 flex-row items-center justify-between">
            <CategoryBadge category={inquiry?.category} />
            <StatusBadge status={inquiry?.status} />
          </View>

          <View className="gap-2 rounded-xl bg-white shadow-sm">
            <Text className="text-xl font-bold text-neutral-800">{inquiry?.title}</Text>
            <Text className="text-sm text-neutral-400">
              {formatKoreanDate(inquiry?.created_at)}
            </Text>
          </View>

          <View className="mt-2.5 border-b-2 border-neutral-300" />
        </View>

        <Text className="my-10 text-neutral-600">{inquiry?.message ?? '-'}</Text>

        <View>
          <View className="flex-row items-center gap-2">
            <MaterialIcons name="question-answer" size={17} color={colors.neutral[800]} />
            <Text className="text-medium font-bold text-neutral-800">답변</Text>
          </View>

          <View className="mb-4 mt-2.5 border-b-2 border-neutral-300" />

          <AnswerBubble answered={!!inquiry?.answer}>{answer}</AnswerBubble>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
