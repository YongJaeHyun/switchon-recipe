import Feather from '@expo/vector-icons/Feather';
import { UserAPI } from 'api/UserAPI';
import AnimatedTextView from 'components/common/AnimatedTextView';
import { Text } from 'components/common/Text';
import { WeekDayPicker } from 'components/program/WeekDayPicker';
import { onboardQuestionImage } from 'const/assets';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { turnOnMealAlarm } from 'hooks/useMealAlarmSync';
import useSteps from 'hooks/useSteps';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMealAlarmStore } from 'stores/mealAlarmStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import colors from 'tailwindcss/colors';
import { getKoreanDateString, getKoreanDateWeeksAgo } from 'utils/date';
import { getWeekColor } from 'utils/getWeekColor';
import { formatMinutes } from 'utils/fastingSchedule';
import { MEAL_KEYS, MEAL_LABELS } from 'utils/mealTimes';
import {
  addDaysToDay,
  MAINTENANCE_WEEK,
  programWeekAndDay,
  startDateForWeekDay,
} from 'utils/programStart';
import RippleButton from '../../components/common/RippleButton';

// 1 소개 → 2 지금 하고 있는지 → 3 (하고 있음) 지금 몇 주차 며칠인지 / 4 (새로 시작) 언제부터 → 5 확인
// → 6 끼니 알림 (1주차이거나 시작 전일 때만. 끼니 알림은 1주차에만 온다)
const totalSteps = 6;
const START_CHOICE_STEP = 4;
const CONFIRM_STEP = 5;
const MEAL_ALARM_STEP = 6;

export default function OnboardingScreen() {
  const { step, goNextStep, goToStep } = useSteps(totalSteps);
  const { setWeek } = useWeekCompletePopupStore();
  const mealTimes = useMealAlarmStore((state) => state.times);
  const setMealAlarmOn = useMealAlarmStore((state) => state.setOn);
  const [isAsking, setIsAsking] = useState(false);

  const today = getKoreanDateString({ formatType: 'date' });
  const tomorrow = addDaysToDay(today, 1);
  const [selectedDate, setSelectedDate] = useState(today);
  // 3단계 주차 맞추기 선택. 시작일은 고른 주차·일차로 앱이 계산한다
  const [weekDay, setWeekDay] = useState({ week: 1, day: 1 });
  const { week, day, beforeStart } = programWeekAndDay(selectedDate, today);
  const asksMealAlarm = beforeStart || week === 1;

  const setDateAndGoLastStep = (startDate: string) => {
    setSelectedDate(startDate);
    goToStep(CONFIRM_STEP);
  };

  const chooseWeekDay = (selection: { week: number; day: number }) => {
    setWeekDay(selection);
    setSelectedDate(startDateForWeekDay(today, selection.week, selection.day));
  };

  const completeOnboarding = async () => {
    setWeek(week);
    await UserAPI.updateOnboarding(selectedDate);
    router.replace('/(tabs)/home');
  };
  // 끼니 알림: 예 → 권한 요청(거부하면 꺼짐), 아니오 → 꺼짐. 나중에 내 정보에서 켤 수 있다
  const answerMealAlarm = async (yes: boolean) => {
    if (isAsking) return;
    setIsAsking(true);
    try {
      if (yes) await turnOnMealAlarm();
      else setMealAlarmOn(false);
      await completeOnboarding();
    } finally {
      setIsAsking(false);
    }
  };
  return (
    <SafeAreaView className="flex-1 bg-white px-5">
      <View className="flex-[1.3] items-end justify-center gap-3">
        {step < CONFIRM_STEP && <ProgressBar progress={(step - 1) / (CONFIRM_STEP - 1)} />}
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
                // 건너뛰어도 하루 준비하고 시작하도록 내일부터 (준비하고 시작한 사람이 더 오래 이어감)
                onPress={() => setDateAndGoLastStep(tomorrow)}>
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
            <View className="gap-4">
              <AnimatedTextView delay={500}>
                <Text className="text-4xl font-bold leading-snug">
                  지금 <Text className="text-green-600">몇 주차 며칠</Text>인가요?
                </Text>
              </AnimatedTextView>
              <AnimatedTextView delay={800}>
                <Text className="text-lg font-medium text-neutral-500">
                  오늘이 몇 주차 며칠인지 고르면 시작한 날은 앱이 맞춰 둘게요.
                </Text>
              </AnimatedTextView>
            </View>
            <AnimatedTextView delay={1000}>
              <WeekDayPicker week={weekDay.week} day={weekDay.day} onChange={chooseWeekDay} />
            </AnimatedTextView>
            <AnimatedTextView delay={1500}>
              <RippleButton
                className="w-full bg-green-600 py-5"
                onPress={() => {
                  // 처음 들어와 그대로 넘겨도 선택(기본 1주차 1일)과 시작일이 어긋나지 않게 다시 계산
                  chooseWeekDay(weekDay);
                  goToStep(CONFIRM_STEP);
                }}>
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
        {step === CONFIRM_STEP && (
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
                ) : week >= MAINTENANCE_WEEK ? (
                  <Text className="text-3xl font-bold leading-snug">
                    <Text className={getWeekColor(week)}>유지기</Text>로 이어가요!
                  </Text>
                ) : (
                  <Text className="text-3xl font-bold leading-snug">
                    오늘은 <Text className={getWeekColor(week)}>{week}주차</Text> {day}일이에요!
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
                  혹시 잘못 골랐더라도 걱정하지 마세요.
                </Text>
                <Text className="text-lg font-semibold text-neutral-500">
                  나중에 오늘 탭의 <Feather name="settings" size={18} color={colors.black} />{' '}
                  아이콘에서 주차를 맞추거나 처음부터 다시 시작할 수 있어요.
                </Text>
              </AnimatedTextView>
            </View>
            <AnimatedTextView delay={1500}>
              <RippleButton
                className="w-full bg-green-600 py-5"
                onPress={asksMealAlarm ? goNextStep : completeOnboarding}>
                <Text className="text-xl text-white">{asksMealAlarm ? '다음' : '시작하기'}</Text>
              </RippleButton>
            </AnimatedTextView>
          </>
        )}
        {step === MEAL_ALARM_STEP && (
          <>
            <View className="gap-4">
              <AnimatedTextView delay={500}>
                <Text className="text-4xl font-bold leading-snug">
                  <Text className="text-green-600">끼니 시간</Text>에 알려드릴까요?
                </Text>
              </AnimatedTextView>
              <AnimatedTextView className="gap-3" delay={800}>
                <Text className="text-lg font-medium text-neutral-500">
                  1주차 동안 끼니마다 그날 먹을 것을 알려드려요. 먹고 체크하면 그 알림은 오지
                  않아요.
                </Text>
                <View className="flex-row gap-2">
                  {MEAL_KEYS.map((meal) => (
                    <View key={meal} className="flex-1 items-center rounded-xl bg-neutral-100 py-3">
                      <Text className="text-sm text-neutral-500">{MEAL_LABELS[meal]}</Text>
                      <Text className="text-lg font-bold text-neutral-800">
                        {formatMinutes(mealTimes[meal])}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text className="text-base text-neutral-400">
                  시각은 나중에 내 정보 → 끼니 알림에서 바꿀 수 있어요.
                </Text>
              </AnimatedTextView>
            </View>
            <AnimatedTextView className="gap-5" delay={1000}>
              <RippleButton
                className="w-full bg-green-600 py-5"
                disabled={isAsking}
                onPress={() => answerMealAlarm(true)}>
                <Text className="text-xl text-white">네, 알려주세요</Text>
              </RippleButton>
              <RippleButton
                className="w-full py-5"
                outerClassName="border border-green-600"
                disabled={isAsking}
                onPress={() => answerMealAlarm(false)}>
                <Text className="text-xl text-green-600">괜찮아요</Text>
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
