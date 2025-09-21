import { loadingLottie } from 'const/assets';
import LottieView from 'lottie-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const texts = [
  '레시피를 준비하는 중...',
  '재료와 친밀도를 높이는 중...',
  '재료들과 춤을 추는 중...',
  '양념과 친해지는 중...',
  '냄비에서 보글보글 끓는 중...',
  '팬에서 소리 나는 중...',
  '비밀 소스를 살짝 뿌리는 중...',
  '군침 돌게 만드는 중...',
  '맛의 균형을 조율하는 중...',
  '향긋한 냄새가 퍼지는 중...',
  '한입 맛보기 테스트 중...',
  '주방에서 마법을 부리는 중...',
  '마지막 맛을 다듬는 중...',
];

function JumpingText({ text = '', className }: { text: string; className?: string }) {
  const chars = text.split('');
  const jumpDuration = 300;

  return (
    <View className={`flex-row gap-px ${className}`}>
      {chars.map((char, i) => (
        <JumpingChar
          key={i}
          char={char}
          delay={i * jumpDuration} // 글자 순차 딜레이
          cycleDuration={chars.length * jumpDuration} // 전체 사이클
        />
      ))}
    </View>
  );
}

function JumpingChar({
  char,
  delay,
  cycleDuration,
}: {
  char: string;
  delay: number;
  cycleDuration: number;
}) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    const jump = withSequence(withTiming(-6, { duration: 300 }), withTiming(0, { duration: 300 }));

    const cycle = withSequence(
      withDelay(delay, jump),
      withDelay(cycleDuration - delay, withTiming(0, { duration: 0 }))
    );

    translateY.value = withRepeat(cycle, -1, false);
  }, [cycleDuration, delay, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.Text style={[{ fontSize: 14, color: 'white', fontWeight: 'bold' }, animatedStyle]}>
      {char}
    </Animated.Text>
  );
}

export default function Loading() {
  const jumpDuration = 300;
  const [index, setIndex] = useState(0);

  const opacity = useSharedValue(1);

  useEffect(() => {
    let currentIndex = index;

    const loop = () => {
      opacity.value = withTiming(0, { duration: jumpDuration, easing: Easing.inOut(Easing.ease) });

      setTimeout(() => {
        currentIndex = (currentIndex + 1) % texts.length;
        setIndex(currentIndex);

        opacity.value = withTiming(1, {
          duration: jumpDuration,
          easing: Easing.inOut(Easing.ease),
        });

        setTimeout(loop, texts[currentIndex].length * jumpDuration);
      }, jumpDuration);
    };

    const initialTimeout = setTimeout(loop, texts[currentIndex].length * jumpDuration);

    return () => clearTimeout(initialTimeout);
  }, [index, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View className="relative items-center gap-2">
      <LottieView
        source={loadingLottie}
        style={{ width: 200, height: 200, transform: [{ translateY: -80 }] }}
        autoPlay
        loop
      />

      <Animated.View style={[{ position: 'absolute', top: 92 }, animatedStyle]}>
        <JumpingText text={texts[index]} />
      </Animated.View>
    </View>
  );
}
