import React, { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

interface AnimatedTextViewProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}

export default function AnimatedTextView({
  className,
  children,
  delay = 0,
  duration = 500,
}: AnimatedTextViewProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(10);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.ease) }));
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration, easing: Easing.out(Easing.ease) })
    );
  }, [delay, duration, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View className={className} style={animatedStyle}>
      {children}
    </Animated.View>
  );
}
