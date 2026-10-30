import Feather from '@expo/vector-icons/Feather';
import { UserAPI } from 'api/UserAPI';
import AnimatedTextView from 'components/common/AnimatedTextView';
import CustomCalendar from 'components/common/CustomCalendar';
import { Text } from 'components/common/Text';
import { onboardQuestionImage } from 'const/assets';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import useSteps from 'hooks/useSteps';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import colors from 'tailwindcss/colors';
import { getKoreanDateString, getKoreanDateWeeksAgo } from 'utils/date';
import { getWeekColor } from 'utils/getWeekColor';
import { addDaysToDay, programWeekAndDay } from 'utils/programStart';
import RippleButton from '../../components/common/RippleButton';

// 1 소개 → 2 지금 하고 있는지 → 3 (하고 있음) 시작한 날 달력 / 4 (새로 시작) 언제부터 → 5 확인
const totalSteps = 5;
const START_CHOICE_STEP = 4;

export default function OnboardingScreen() {
  const { step, goLastStep, goNextStep, goToStep } = useSteps(totalSteps);
  const { setWeek } = useWeekCompletePopupStore();

  const today = getKoreanDateString({ formatType: 'date' });
  const tomorrow = addDaysToDay(today, 1);
  const [selectedDate, setSelectedDate] = useState(today);
  const { week, day, beforeStart } = programWeekAndDay(selectedDate, today);

  const setDateAndGoLastStep = (startDate: string) => {
    setSelectedDate(startDate);
    goLastStep();
  };

  const completeOnboarding = async () => {
    setWeek(week);
    await UserAPI.updateOnboarding(selectedDate);
    router.replace('/(tabs)/home');
  };
  return (
    <SafeAreaView className="flex-1 bg-white px-5">
      <View className="flex-[1.3] items-end justify-center gap-3">
        {step < totalSteps && <ProgressBar progress={(step - 1) / (totalSteps - 1)} />}
      </View>
      <View className="flex-[10] justify-between">
        {step === 1 && (
          <>
            <AnimatedTextView delay={500}>
              <Text className="text-3xl font-bold leading-snug">
                <Text className="text-green-600">다이어터</Text>
                님께 꼭 맞는 경험을 위해 간단한 몇 가지 질문을 준비했어요.
              </Text>
            </AnimatedTextView>
            <AnimatedTextView className="items-center justify-center" delay={1000}>
              <Image source={onboardQuestionImage} style={{ width: 250, height: 250 }} />
            </AnimatedTextView>
            <AnimatedTextView className="gap-5" delay={1500}>
              <RippleButton className="w-full bg-green-600 py-5" onPress={goNextStep}>
                <Text className="text-xl text-white">시작하기</Text>
              </RippleButton>
              <RippleButton
                className="w-full py-5"
                outerClassName="border border-green-600"
                onPress={() => setDateAndGoLastStep(today)}>
                <Text className="text-xl text-green-600">건너뛰기</Text>
              </RippleButton>
            </AnimatedTextView>
          </>
        )}
        {step === 2 && (
          <>
            <AnimatedTextView delay={500}>
              <Text className="text-4xl font-bold leading-snug">
                현재 <Text className="text-green-600">스위치온 다이어트</Text>를 하고 계신가요?
              </Text>
            </AnimatedTextView>
            <AnimatedTextView className="gap-5" delay={1000}>
              <RippleButton className="w-full bg-green-600 py-5" onPress={goNextStep}>
                <Text className="text-xl text-white">네, 하고 있어요</Text>
              </RippleButton>
              <RippleButton
                className="w-full py-5"
                outerClassName="border border-green-600"
                onPress={() => goToStep(START_CHOICE_STEP)}>
                <Text className="text-xl text-green-600">이제 시작하려고 해요</Text>
              </RippleButton>
              {/* 다이어트 없이 레시피만 보는 분: 지금처럼 유지기(4주 전 시작)로 둔다 */}
              <RippleButton
                className="w-full py-5"
                outerClassName="border border-neutral-300"
                onPress={() => setDateAndGoLastStep(getKoreanDateWeeksAgo(4))}>
                <Text className="text-xl text-neutral-500">아니오, 레시피만 볼래요</Text>
              </RippleButton>
            </AnimatedTextView>
          </>
        )}
        {step === 3 && (
          <>
            <AnimatedTextView delay={500}>
              <Text className="text-4xl font-bold leading-snug">
                언제 <Text className="text-green-600">스위치온 다이어트</Text>를 시작하셨나요?
              </Text>
            </AnimatedTextView>
            <AnimatedTextView delay={1000}>
              <CustomCalendar selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
            </AnimatedTextView>
            <AnimatedTextView delay={1500}>
              <RippleButton className="w-full bg-green-600 py-5" onPress={goLastStep}>
                <Text className="text-xl text-white">선택하기</Text>
              </RippleButton>
            </AnimatedTextView>
          </>
        )}
        {step === START_CHOICE_STEP && (
          <>
            <View className="gap-4">
              <AnimatedTextView delay={500}>
                <Text className="text-4xl font-bold leading-snug">
                  언제부터 <Text className="text-green-600">시작</Text>할까요?
                </Text>
              </AnimatedTextView>
              <AnimatedTextView delay={800}>
                <Text className="text-lg font-medium text-neutral-500">
                  하루 준비하고 시작한 분들이 더 오래 이어가요.
                </Text>
                <Text className="text-lg font-medium text-neutral-500">
                  오늘은 쉐이크와 장보기를 챙기고, 내일 1주차 1일을 시작해 보세요.
                </Text>
              </AnimatedTextView>
            </View>
            <AnimatedTextView className="gap-5" delay={1000}>
              <RippleButton
                className="w-full bg-green-600 py-5"
                onPress={() => setDateAndGoLastStep(tomorrow)}>
                <Text className="text-xl text-white">내일부터 시작 (추천)</Text>
              </RippleButton>
              <RippleButton
                className="w-full py-5"
                outerClassName="border border-green-600"
                onPress={() => setDateAndGoLastStep(today)}>
                <Text className="text-xl text-green-600">오늘부터 시작</Text>
              </RippleButton>
            </AnimatedTextView>
          </>
        )}
        {step === 5 && (
          <>
            <View className="gap-10">
              <AnimatedTextView delay={500}>
                <Text className="text-3xl font-bold leading-snug">
                  <Text className="text-green-600">다이어터</Text>님은...
                </Text>
                {beforeStart ? (
                  <Text className="text-3xl font-bold leading-snug">
                    {selectedDate === tomorrow
                      ? '내일'
                      : `${selectedDate.slice(5).replace('-', '/')}`}
                    부터 <Text className={getWeekColor(1)}>1주차</Text> 1일을 시작해요!
                  </Text>
                ) : (
                  <Text className="text-3xl font-bold leading-snug">
                    <Text className={getWeekColor(week)}>{week}주차</Text> {day}일{' '}
                    {week >= 5 && '(유지기)'}부터 시작해요!
                  </Text>
                )}
              </AnimatedTextView>
              <AnimatedTextView className="gap-3" delay={1000}>
                {beforeStart && (
                  <Text className="text-lg font-medium text-neutral-500">
                    시작 전까지 오늘 탭에서 준비할 것들을 챙겨 보세요.
                  </Text>
                )}
                <Text className="text-lg font-medium text-neutral-500">
                  혹시 잘못 설정했더라도 걱정하지 마세요.
                </Text>
                <Text className="text-lg font-semibold text-neutral-500">
                  이 설정은 나중에 홈 화면의{' '}
                  <Feather name="settings" size={18} color={colors.black} />
                  아이콘을 통해 변경할 수 있어요!
                </Text>
              </AnimatedTextView>
            </View>
            <AnimatedTextView delay={1500}>
              <RippleButton className="w-full bg-green-600 py-5" onPress={completeOnboarding}>
                <Text className="text-xl text-white">시작하기</Text>
              </RippleButton>
            </AnimatedTextView>
          </>
        )}
      </View>
      <View className="flex-[0.5]" />
    </SafeAreaView>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(progress, { duration: 500 });
  }, [progress, width]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }));

  return (
    <View className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
      <Animated.View className="h-full bg-green-600" style={animatedStyle} />
    </View>
  );
}
