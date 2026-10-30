import { weekCompleteLottie } from 'const/assets';
import { useIngredients } from 'hooks/useIngredients';
import useSteps from 'hooks/useSteps';
import LottieView from 'lottie-react-native';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useUserStore } from 'stores/userStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import colors from 'tailwindcss/colors';
import { WEEK_CHANGES } from 'utils/dietGuide';
import { getWeekColor } from 'utils/getWeekColor';
import { shouldAskWeekRepeat, weekRepeatKey } from 'utils/weekRepeat';
import AnimatedTextView from './AnimatedTextView';
import RippleButton from './RippleButton';
import { Text } from './Text';
import { WeekRepeatStep } from './WeekRepeatStep';

export function WeekCompletePopup() {
  const { close, week, visible, repeatAskedKeys, markRepeatAsked } = useWeekCompletePopupStore();
  const startDate = useUserStore((state) => state.start_date);
  const { step, goNextStep, resetStep } = useSteps(2);
  const { ingredients } = useIngredients();
  const { height: windowHeight } = useWindowDimensions();

  const scale = useSharedValue(0);

  // 3·4주차 진입이고 이 전환에서 아직 안 물었으면 첫 단계 앞에 '지난 주 돌아보기'.
  // 팝업이 열릴 때 한 번 정한다 (닫히는 동안 시작일·주차가 바뀌어도 내용이 바뀌지 않게)
  const askRepeat = shouldAskWeekRepeat({ startDate, week, askedKeys: repeatAskedKeys });
  // 돌아보는 중이면 들어서는 주차와 전환 키 (아니면 null). 키가 바뀌면 단계를 새로 그린다
  const reviewOf = () =>
    askRepeat && startDate ? { week, key: weekRepeatKey(startDate, week) } : null;
  const [review, setReview] = useState(visible ? reviewOf() : null);
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) setReview(reviewOf());
  }

  const handleClose = () => {
    // 돌아보기 중 뒤로 가기로 닫아도 이 전환에서는 다시 묻지 않는다
    if (review) markRepeatAsked(review.key);
    resetStep();
    close();
  };

  const handleRepeated = () => {
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
    <Modal transparent visible={visible} animationType="fade" onRequestClose={handleClose}>
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
          {review && (
            <WeekRepeatStep
              key={review.key}
              week={review.week}
              onNext={() => setReview(null)}
              onRepeated={handleRepeated}
            />
          )}

          {!review && step === 1 && (
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

          {!review && step === 2 && (
            <>
              {/* 재료가 많으면 팝업이 화면을 넘치므로 내용만 스크롤하고 확인 버튼은 항상 보이게 함 */}
              <ScrollView
                className="w-full"
                style={{ maxHeight: windowHeight * 0.6 }}
                showsVerticalScrollIndicator={false}>
                <AnimatedTextView className="w-full" delay={500}>
                  <Text className="mb-2 text-2xl font-bold">
                    <Text className={getWeekColor(week)}>{week}주차</Text>에는...
                  </Text>
                  {WEEK_CHANGES[week] && (
                    <View className="mb-6 gap-1.5 rounded-xl bg-neutral-100 p-4">
                      <Text className="mb-1 font-bold">이번 주 달라지는 점</Text>
                      {WEEK_CHANGES[week].map((line) => (
                        <Text key={line} className="text-sm text-neutral-700">
                          • {line}
                        </Text>
                      ))}
                    </View>
                  )}
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
                      ingredients
                        .filter((ingredient) => ingredient.week === 2)
                        .map((ingredient) => (
                          <Text
                            key={ingredient.name}
                            className="rounded bg-gray-200 px-3 py-1 text-center font-bold">
                            {ingredient.name}
                          </Text>
                        ))}
                    {week === 3 &&
                      ingredients
                        .filter((ingredient) => ingredient.week === 3)
                        .map((ingredient) => (
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
              </ScrollView>

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
