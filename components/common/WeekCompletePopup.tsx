import { weekCompleteLottie } from 'const/assets';
import { secondWeekIngredients, thirdWeekIngredients } from 'const/ingredients';
import useSteps from 'hooks/useSteps';
import LottieView from 'lottie-react-native';
import { useEffect } from 'react';
import { Modal, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import colors from 'tailwindcss/colors';
import { getWeekColor } from 'utils/getWeekColor';
import AnimatedTextView from './AnimatedTextView';
import RippleButton from './RippleButton';
import { Text } from './Text';

export function WeekCompletePopup() {
  const { close, week, visible } = useWeekCompletePopupStore();
  const { step, goNextStep, resetStep } = useSteps(2);

  const scale = useSharedValue(0);

  const handleClose = () => {
    resetStep();
    close();
  };

  useEffect(() => {
    if (visible) {
      scale.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.back(2)) });
    } else {
      scale.value = withTiming(0, { duration: 200 });
    }
  }, [scale, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: scale.value,
  }));

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View className="flex-1 items-center justify-center bg-black/50">
        <Animated.View
          style={[
            animatedStyle,
            {
              width: '66.6%',
              padding: 24,
              backgroundColor: 'white',
              borderRadius: 16,
              alignItems: 'center',
            },
          ]}>
          {step === 1 && (
            <>
              <LottieView
                source={weekCompleteLottie}
                style={{ width: '100%', height: 200 }}
                loop={false}
                autoPlay
              />
              <AnimatedTextView className="w-full" delay={4000}>
                <Text className="mb-10 text-center text-2xl font-bold">
                  <Text className={getWeekColor(week)}>{week}주차</Text> 진입!
                </Text>

                <RippleButton
                  outerClassName="w-full"
                  rippleColor={colors.green[700]}
                  className="w-full bg-green-600 py-2.5"
                  onPress={goNextStep}>
                  <Text className="font-bold text-white">다음</Text>
                </RippleButton>
              </AnimatedTextView>
            </>
          )}

          {step === 2 && (
            <>
              <AnimatedTextView className="w-full" delay={500}>
                <Text className="mb-2 text-2xl font-bold">
                  <Text className={getWeekColor(week)}>{week}주차</Text>에는...
                </Text>
                {week < 4 ? (
                  <Text className="mb-10 text-neutral-600">
                    아래 재료들을 추가로 선택할 수 있어요.
                  </Text>
                ) : (
                  <Text className="mb-10 text-neutral-600">새로운 재료가 추가되지는 않아요.</Text>
                )}
              </AnimatedTextView>

              <AnimatedTextView className="w-full" delay={1250}>
                <View className="mb-10 flex-row flex-wrap gap-3">
                  {week === 2 &&
                    secondWeekIngredients.map((ingredient) => (
                      <Text
                        key={ingredient.name}
                        className="rounded bg-gray-200 px-3 py-1 text-center font-bold">
                        {ingredient.name}
                      </Text>
                    ))}
                  {week === 3 &&
                    thirdWeekIngredients.map((ingredient) => (
                      <Text
                        key={ingredient.name}
                        className="rounded bg-gray-200 px-3 py-1 text-center font-bold">
                        {ingredient.name}
                      </Text>
                    ))}
                  {week === 4 && (
                    <View className="gap-4">
                      <Text>
                        드디어 <Text className="font-bold">마지막 주차</Text>예요!
                      </Text>
                      <Text className="text-base">
                        5주차부터는 <Text className="font-bold">유지기</Text>로 접어들어요.
                      </Text>
                      <Text className="text-base">
                        지금까지 다져온 습관을 믿고 끝까지 달려가 보세요 💪
                      </Text>
                    </View>
                  )}
                </View>
              </AnimatedTextView>

              <AnimatedTextView className="w-full" delay={2000}>
                <RippleButton
                  outerClassName="w-full"
                  rippleColor={colors.green[700]}
                  className="w-full bg-green-600 py-2.5"
                  onPress={handleClose}>
                  <Text className="font-bold text-white">확인</Text>
                </RippleButton>
              </AnimatedTextView>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}
