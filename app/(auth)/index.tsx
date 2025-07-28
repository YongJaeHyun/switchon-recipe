import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import colors from 'tailwindcss/colors';
import RippleButton from '../../components/common/RippleButton';

const ChatBubble = ({ isMe, children }: { isMe?: boolean; children?: React.ReactNode }) => (
  <View className={`${isMe ? 'items-end' : 'items-start'}`}>
    <View
      className={`my-1.5 max-w-[80%] rounded-2xl px-4 py-2 ${isMe ? 'rounded-tr-none bg-green-300' : 'rounded-tl-none bg-gray-200'}`}>
      <Text>{children}</Text>
    </View>
  </View>
);

export default function LaunchScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white px-5">
      <View className="flex-[1]" />
      <View className="flex-[10] justify-between">
        <View>
          <View className="flex-row">
            <Text className="text-4xl font-bold leading-snug text-green-600">
              스위치온 다이어트
            </Text>
            <Text className="text-4xl font-bold leading-snug">를</Text>
          </View>
          <Text className="mb-16 text-4xl font-bold leading-snug">단순하게!</Text>

          <View className="relative mb-6 self-start">
            <View className="absolute -bottom-1 left-0 right-0 -z-10 h-3 bg-green-200" />
            <Text className="text-xl text-neutral-800">혹시... 이런 경험 있으신가요?</Text>
          </View>

          <View className="rounded-xl border border-neutral-400 px-2">
            <ChatBubble>음... 오늘은 뭐 먹지?</ChatBubble>
            <ChatBubble isMe>먹으면 안되는 음식도 많던데... 누가 다 알려주면 좋겠다 😇</ChatBubble>
            <ChatBubble>인터넷에 레시피는 많은데, 꼭 내가 가지고 있는 재료는 안 써 ㅜ</ChatBubble>
            <ChatBubble isMe>
              그래서 그거 만들려고 재료 사다보면 결국 다 못 먹고 버리게 되는 엔딩...
            </ChatBubble>
          </View>

          <View className="mt-32 items-center justify-center">
            <Text className="text-lg text-neutral-600">
              당신의 식단 고민, 저희가 해결해드릴게요!
            </Text>
          </View>
        </View>
        <Link href="/(auth)/signIn" asChild replace>
          <RippleButton rippleColor={colors.green[700]}>로그인 하러가기</RippleButton>
        </Link>
      </View>
      <View className="flex-[1]" />
    </SafeAreaView>
  );
}
