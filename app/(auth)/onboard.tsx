import Feather from '@expo/vector-icons/Feather';
import { updateOnboardingToDB } from 'api/supabaseAPI';
import AnimatedTextView from 'components/common/AnimatedTextView';
import CustomCalendar from 'components/common/CustomCalendar';
import { onboardQuestionImage } from 'const/assets';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { getKoreanDateWeeksAgo, getKoreanToday, getWeekAndDay } from 'utils/date';
import { getWeekColor } from 'utils/getWeekColor';
import RippleButton from '../../components/common/RippleButton';

const totalSteps = 3;

export default function OnboardingScreen() {
  const { name } = useUserStore((state) => state);
  const [step, setStep] = useState(0);

  const today = getKoreanToday();
  const [selectedDate, setSelectedDate] = useState(today);
  const { week, day } = getWeekAndDay(selectedDate);

  const goNextStep = () => setStep((prev) => prev + 1);
  const goLastStep = (startDate: string) => {
    setSelectedDate(startDate);
    setStep(totalSteps);
  };

  const completeOnboarding = async () => {
    await updateOnboardingToDB(selectedDate);
    router.replace('/(tabs)/home');
  };
  return (
    <SafeAreaView className="flex-1 bg-white px-5">
      <View className="flex-[1.5] items-end justify-center gap-3">
        {step < totalSteps && <ProgressBar progress={step / totalSteps} />}
      </View>
      <View className="flex-[10] justify-between">
        {step === 0 && (
          <>
            <AnimatedTextView delay={500}>
              <Text className="text-3xl font-bold leading-snug">
                <Text className="text-green-600">{name}</Text>
                님께 꼭 맞는 경험을 위해 간단한 몇 가지 질문을 준비했어요.
              </Text>
            </AnimatedTextView>
            <AnimatedTextView className="items-center justify-center" delay={1000}>
              <Image source={onboardQuestionImage} style={{ width: 250, height: 250 }} />
            </AnimatedTextView>
            <AnimatedTextView className="gap-5" delay={1500}>
              <RippleButton className="bg-green-600 py-5" onPress={goNextStep}>
                <Text className="text-xl text-white">시작하기</Text>
              </RippleButton>
              <RippleButton
                className="py-5"
                borderClassName="border border-green-600"
                onPress={() => goLastStep(today)}>
                <Text className="text-xl text-green-600">건너뛰기</Text>
              </RippleButton>
            </AnimatedTextView>
          </>
        )}
        {step === 1 && (
          <>
            <AnimatedTextView delay={500}>
              <Text className="text-4xl font-bold leading-snug">
                현재 <Text className="text-green-600">스위치온 다이어트</Text>를 하고 계신가요?
              </Text>
            </AnimatedTextView>
            <AnimatedTextView className="gap-5" delay={1000}>
              <RippleButton className="bg-green-600 py-5" onPress={goNextStep}>
                <Text className="text-xl text-white">네</Text>
              </RippleButton>
              <RippleButton
                className="py-5"
                borderClassName="border border-green-600"
                onPress={() => goLastStep(getKoreanDateWeeksAgo(4))}>
                <Text className="text-xl text-green-600">아니오</Text>
              </RippleButton>
            </AnimatedTextView>
          </>
        )}
        {step === 2 && (
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
              <RippleButton className="bg-green-600 py-5" onPress={goNextStep}>
                <Text className="text-xl text-white">선택하기</Text>
              </RippleButton>
            </AnimatedTextView>
          </>
        )}
        {step === 3 && (
          <>
            <View className="gap-10">
              <AnimatedTextView delay={500}>
                <Text className="text-3xl font-bold leading-snug">
                  {name}님은 <Text className={getWeekColor(week)}>{week}주차</Text> {day}일{' '}
                  {week >= 5 && '(유지기)'}로 시작해요!
                </Text>
              </AnimatedTextView>
              <AnimatedTextView className="gap-3" delay={1000}>
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
              <RippleButton className="bg-green-600 py-5" onPress={completeOnboarding}>
                <Text className="text-xl text-white">시작하기</Text>
              </RippleButton>
            </AnimatedTextView>
          </>
        )}
      </View>
      <View className="flex-1" />
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
