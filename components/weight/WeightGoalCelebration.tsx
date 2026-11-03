import AnimatedTextView from 'components/common/AnimatedTextView';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { weekCompleteLottie } from 'const/assets';
import LottieView from 'lottie-react-native';
import { Modal, TouchableOpacity, View } from 'react-native';
import colors from 'tailwindcss/colors';

// 목표에 닿았을 때 한 번 보이는 축하 (주차 진입 팝업과 같은 축하 애니메이션)
export function WeightGoalCelebration({
  texts,
  onNextGoal,
  onClose,
}: {
  texts: { title: string; message: string } | null;
  onNextGoal(): void;
  onClose(): void;
}) {
  return (
    <Modal transparent visible={!!texts} animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/50">
        <View
          className="items-center rounded-2xl bg-white p-6"
          style={{ width: '88%', maxWidth: 420 }}>
          {texts && (
            <>
              <LottieView
                source={weekCompleteLottie}
                style={{ width: '100%', height: 200 }}
                loop={false}
                autoPlay
                speed={1.6}
              />
              <AnimatedTextView className="w-full items-center" delay={1200}>
                <Text className="mb-2 text-center text-2xl font-bold">{texts.title}</Text>
                <Text className="mb-8 text-center text-neutral-600">{texts.message}</Text>
                <RippleButton
                  outerClassName="w-full"
                  rippleColor={colors.green[700]}
                  className="w-full bg-green-600 py-3"
                  onPress={onNextGoal}>
                  <Text className="font-bold text-white">다음 목표 정하기</Text>
                </RippleButton>
                <TouchableOpacity className="mt-1 py-3" onPress={onClose}>
                  <Text className="text-neutral-500">닫기</Text>
                </TouchableOpacity>
              </AnimatedTextView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
