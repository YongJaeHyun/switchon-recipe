import { useEffect } from 'react';
import { AccessibilityActionEvent, LayoutChangeEvent, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import colors from 'tailwindcss/colors';
import { snapMinutes, stepBy } from 'utils/stepSlider';

interface StepSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  formatValue: (value: number) => string;
}

const THUMB_SIZE = 28;
const TRACK_HEIGHT = 6;
const HIT_HEIGHT = 44;

// 칸마다 멈추는 가로 슬라이더. 바텀시트 안에서도 가로로 끌면 슬라이더가, 세로로 끌면 시트·스크롤이 움직인다
export function StepSlider({
  value,
  min,
  max,
  step,
  onChange,
  accessibilityLabel,
  formatValue,
}: StepSliderProps) {
  const width = useSharedValue(0);
  const current = useSharedValue(value);

  useEffect(() => {
    current.value = value;
  }, [current, value]);

  // 손가락 x → 칸에 맞춘 값. 값이 바뀔 때만 JS로 알린다
  const moveTo = (x: number) => {
    'worklet';
    const usable = width.value - THUMB_SIZE;
    if (usable <= 0) return;
    const ratio = Math.min(Math.max((x - THUMB_SIZE / 2) / usable, 0), 1);
    const snapped = snapMinutes(min + ratio * (max - min), { min, max, step });
    if (snapped === current.value) return;
    current.value = snapped;
    runOnJS(onChange)(snapped);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-4, 4])
    .failOffsetY([-12, 12])
    .onStart((event) => moveTo(event.x))
    .onUpdate((event) => moveTo(event.x));
  const tap = Gesture.Tap().onEnd((event) => moveTo(event.x));
  const gesture = Gesture.Race(pan, tap);

  const thumbOffset = () => {
    'worklet';
    const ratio = max > min ? (current.value - min) / (max - min) : 0;
    return ratio * Math.max(width.value - THUMB_SIZE, 0);
  };
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbOffset() }],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    width: thumbOffset(),
  }));

  const handleLayout = (event: LayoutChangeEvent) => {
    width.value = event.nativeEvent.layout.width;
  };
  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    const direction = event.nativeEvent.actionName === 'increment' ? 1 : -1;
    const next = stepBy(value, direction, { min, max, step });
    if (next !== value) onChange(next);
  };

  return (
    <GestureDetector gesture={gesture}>
      <View
        onLayout={handleLayout}
        style={{ height: HIT_HEIGHT, justifyContent: 'center' }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: formatValue(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={handleAccessibilityAction}>
        <View
          style={{
            marginHorizontal: THUMB_SIZE / 2,
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            backgroundColor: colors.neutral[200],
          }}
        />
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: THUMB_SIZE / 2,
              height: TRACK_HEIGHT,
              borderRadius: TRACK_HEIGHT / 2,
              backgroundColor: colors.green[600],
            },
            fillStyle,
          ]}
        />
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: THUMB_SIZE / 2,
              backgroundColor: colors.white,
              borderWidth: 2,
              borderColor: colors.green[600],
              elevation: 2,
              shadowColor: colors.black,
              shadowOpacity: 0.15,
              shadowRadius: 2,
              shadowOffset: { width: 0, height: 1 },
            },
            thumbStyle,
          ]}
        />
      </View>
    </GestureDetector>
  );
}
