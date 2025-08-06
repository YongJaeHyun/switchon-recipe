import AsyncStorage from '@react-native-async-storage/async-storage';
import AnimatedTextView from 'components/common/AnimatedTextView';
import RippleButton from 'components/common/RippleButton';
import { selectIngredientPhoneImage } from 'const/assets';
import { FIRST_LAUNCH_KEY } from 'const/const';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import useSteps from 'hooks/useSteps';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import colors from 'tailwindcss/colors';

const ChatBubble = ({ isMe, children }: { isMe?: boolean; children?: React.ReactNode }) => (
  <View className={`${isMe ? 'items-end' : 'items-start'}`}>
    <View
      className={`my-1.5 max-w-[80%] rounded-2xl px-4 py-2 ${isMe ? 'rounded-tr-none bg-green-300' : 'rounded-tl-none bg-gray-200'}`}>
      <Text>{children}</Text>
    </View>
  </View>
);

const totalSteps = 2;

export default function LaunchScreen() {
  const { step, goNextStep } = useSteps(totalSteps);

  const handleFirstLaunch = async () => {
    await AsyncStorage.setItem(FIRST_LAUNCH_KEY, 'true');
  };

  return (
    <SafeAreaView className="flex-1 bg-white px-5">
      <View className="flex-[0.8]" />
      <View className="flex-[10] justify-between">
        {step === 1 && (
          <>
            <View>
              <AnimatedTextView delay={500}>
                <View className="flex-row">
                  <Text className="text-4xl font-bold leading-snug text-green-600">
                    스위치온 다이어트
                  </Text>
                  <Text className="text-4xl font-bold leading-snug">를</Text>
                </View>
                <Text className="mb-16 text-4xl font-bold leading-snug">단순하게!</Text>
              </AnimatedTextView>

              <AnimatedTextView delay={1250}>
                <View className="relative mb-6 self-start">
                  <View className="absolute -bottom-1 left-0 right-0 -z-10 h-3 bg-green-200" />
                  <Text className="text-xl text-neutral-800">혹시... 이런 경험 있으신가요?</Text>
                </View>

                <View className="rounded-xl border border-neutral-400 px-2">
                  <ChatBubble>음... 오늘은 뭐 먹지?</ChatBubble>
                  <ChatBubble isMe>
                    먹으면 안되는 음식도 많던데... 누가 다 알려주면 좋겠다 😇
                  </ChatBubble>
                  <ChatBubble>
                    인터넷에 레시피는 많은데, 꼭 내가 가지고 있는 재료는 안 써 ㅜ
                  </ChatBubble>
                  <ChatBubble isMe>
                    그래서 그거 만들려고 재료 사다보면 결국 다 못 먹고 버리게 되는 엔딩...
                  </ChatBubble>
                </View>
              </AnimatedTextView>
            </View>

            <AnimatedTextView delay={2000}>
              <View className="mb-12 items-center justify-center">
                <Text className="text-lg text-neutral-600">
                  당신의 식단 고민, <Text className="font-semibold text-green-600">AI</Text>에게
                  맡겨보세요!
                </Text>
              </View>
              <RippleButton
                onPress={goNextStep}
                rounded="xl"
                className="w-full bg-green-600 py-4"
                rippleColor={colors.green[700]}>
                <Text className="text-lg text-white">다음</Text>
              </RippleButton>
            </AnimatedTextView>
          </>
        )}
        {step === 2 && (
          <>
            <AnimatedTextView delay={500}>
              <View className="flex-row">
                <Text className="text-4xl font-bold leading-snug">내가 선택한 재료로</Text>
              </View>
              <Text className="text-4xl font-bold leading-snug">
                <Text className="text-green-600">AI</Text>가 맞춤 레시피 제작!
              </Text>
            </AnimatedTextView>

            <AnimatedTextView delay={1250} className="items-center justify-center">
              <Image
                source={selectIngredientPhoneImage}
                contentFit="contain"
                style={{ width: '100%', height: 400 }}
              />
            </AnimatedTextView>

            <AnimatedTextView delay={2000}>
              <View className="mb-12 items-center justify-center gap-2">
                <Text className="text-lg text-neutral-600">
                  선택할 수 있는 재료는{' '}
                  <Text className="font-semibold text-green-600">스위치온 주차</Text>가 늘수록
                  늘어나요!
                </Text>
                <Text className="font-medium text-green-600">
                  재료를 고르지 않고, 랜덤 레시피를 만들 수도 있어요.
                </Text>
              </View>
              <Link href="/(auth)" asChild replace>
                <RippleButton
                  onPress={handleFirstLaunch}
                  rounded="xl"
                  className="w-full bg-green-600 py-4"
                  rippleColor={colors.green[700]}>
                  <Text className="text-lg text-white">로그인 하러가기</Text>
                </RippleButton>
              </Link>
            </AnimatedTextView>
          </>
        )}
      </View>
      <View className="flex-[1]" />
    </SafeAreaView>
  );
}
