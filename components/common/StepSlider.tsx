import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AccessibilityActionEvent, LayoutChangeEvent, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import colors from 'tailwindcss/colors';
import { grabOffset, isOnThumb, stepBy, thumbOffset, valueAtX } from 'utils/stepSlider';

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
  const isDragging = useSharedValue(false);
  const grab = useSharedValue(0);
  const range = useMemo(() => ({ min, max, step }), [min, max, step]);

  // 끄는 동안에는 늦게 온 옛 value가 손가락 위치를 덮어쓰지 않게 한다
  useEffect(() => {
    if (!isDragging.value) current.value = value;
  }, [current, isDragging, value]);

  // 제스처를 렌더마다 새로 만들면 끄는 도중에 끊기므로, 바뀌는 onChange는 ref로 부른다
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const emit = useCallback((next: number) => onChangeRef.current(next), []);

  const gesture = useMemo(() => {
    // 손잡이 가운데 x → 칸 값. 값이 바뀔 때만 JS로 알린다
    const moveTo = (x: number) => {
      'worklet';
      const snapped = valueAtX(x, { width: width.value, thumbSize: THUMB_SIZE }, range);
      if (snapped === null || snapped === current.value) return;
      current.value = snapped;
      runOnJS(emit)(snapped);
    };

    const pan = Gesture.Pan()
      .activeOffsetX([-4, 4])
      .failOffsetY([-12, 12])
      .onBegin((event) => {
        // 손잡이를 잡으면 잡은 점을 유지 (값이 튀지 않게), 트랙을 누르면 그 자리로
        grab.value = grabOffset(
          event.x,
          current.value,
          { width: width.value, thumbSize: THUMB_SIZE },
          range
        );
      })
      .onStart((event) => {
        isDragging.value = true;
        moveTo(event.x + grab.value);
      })
      .onUpdate((event) => moveTo(event.x + grab.value))
      .onFinalize(() => {
        isDragging.value = false;
      });
    const tap = Gesture.Tap().onEnd((event, success) => {
      if (!success) return;
      // 손잡이를 톡 누른 것은 그대로, 트랙을 누르면 그 자리로
      const track = { width: width.value, thumbSize: THUMB_SIZE };
      if (isOnThumb(event.x, current.value, track, range)) return;
      moveTo(event.x);
    });
    return Gesture.Race(pan, tap);
  }, [current, emit, grab, isDragging, range, width]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: thumbOffset(
          current.value,
          { width: width.value, thumbSize: THUMB_SIZE },
          range
        ),
      },
    ],
  }));
  const fillStyle = useAnimatedStyle(() => ({
    width: thumbOffset(current.value, { width: width.value, thumbSize: THUMB_SIZE }, range),
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
