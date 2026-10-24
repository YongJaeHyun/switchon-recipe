import { Text } from 'components/common/Text';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityActionEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView as RNScrollView,
  View,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import colors from 'tailwindcss/colors';
import {
  indexAtOffset,
  nearestIndex,
  offsetAtIndex,
  stepIndex,
  type WheelItem,
} from 'utils/wheelPicker';

export const WHEEL_ROW_HEIGHT = 40;
const VISIBLE_ROWS = 5;
const PADDING = WHEEL_ROW_HEIGHT * Math.floor(VISIBLE_ROWS / 2);
// 손을 뗐는데 관성 스크롤이 시작되지 않으면 (iOS 느린 끌기) 이만큼 기다렸다가 멈춘 것으로 본다
const SETTLE_WAIT_MS = 120;

interface WheelPickerProps {
  items: WheelItem[];
  value: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  width?: number;
}

// iOS 시계 같은 세로 휠 한 줄. 가운데 띠에 온 칸이 고른 값이고, 멈췄을 때만 onChange를 부른다.
// 바깥 시트·스크롤 안에서도 휠 위를 세로로 끌면 휠만 돈다: gesture-handler ScrollView가 먼저 잡고
// (disallowInterruption) 끝에 닿아도 남은 끌기를 바깥으로 넘기지 않는다 (nestedScrollEnabled={false}, Android)
export function WheelPicker({
  items,
  value,
  onChange,
  accessibilityLabel,
  width = 64,
}: WheelPickerProps) {
  const scrollRef = useRef<RNScrollView>(null);
  const selectedIndex = nearestIndex(items, value);
  // 띠에 온 칸 (스크롤하는 동안 굵게 보이는 칸)
  const [centerIndex, setCenterIndex] = useState(selectedIndex);
  const isTouching = useRef(false);
  const isMomentum = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 이미 스크롤해 둔 칸. value가 밖에서 바뀌었을 때만 그 칸으로 옮긴다
  const shownIndex = useRef(selectedIndex);

  const latest = useRef({ items, value, onChange });
  useEffect(() => {
    latest.current = { items, value, onChange };
  }, [items, value, onChange]);

  const clearSettleTimer = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
  };
  useEffect(() => clearSettleTimer, []);

  const scrollToIndex = useCallback((index: number, animated: boolean) => {
    shownIndex.current = index;
    scrollRef.current?.scrollTo({ y: offsetAtIndex(index, WHEEL_ROW_HEIGHT), animated });
  }, []);

  // 멈춘 자리의 칸을 고른다. 칸 사이에 멈췄으면 맞춰 주고, 값이 바뀌었을 때만 알린다
  const settle = useCallback(
    (offset: number) => {
      const { items: list, value: current, onChange: emit } = latest.current;
      const index = indexAtOffset(offset, WHEEL_ROW_HEIGHT, list.length);
      if (Math.abs(offset - offsetAtIndex(index, WHEEL_ROW_HEIGHT)) > 1) scrollToIndex(index, true);
      shownIndex.current = index;
      setCenterIndex(index);
      const next = list[index]?.value;
      if (next !== undefined && next !== current) emit(next);
    },
    [scrollToIndex]
  );

  // 밖에서 value가 바뀌면 (빠른 선택 버튼 등) 그 칸으로. 끄는 중에는 손가락을 따른다
  useEffect(() => {
    if (isTouching.current || isMomentum.current) return;
    if (selectedIndex === shownIndex.current) return;
    setCenterIndex(selectedIndex);
    scrollToIndex(selectedIndex, true);
  }, [scrollToIndex, selectedIndex]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = indexAtOffset(
      event.nativeEvent.contentOffset.y,
      WHEEL_ROW_HEIGHT,
      latest.current.items.length
    );
    setCenterIndex((prev) => (prev === index ? prev : index));
  };
  const handleBeginDrag = () => {
    clearSettleTimer();
    isTouching.current = true;
  };
  const handleEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    isTouching.current = false;
    const offset = event.nativeEvent.contentOffset.y;
    clearSettleTimer();
    settleTimer.current = setTimeout(() => {
      if (!isMomentum.current) settle(offset);
    }, SETTLE_WAIT_MS);
  };
  const handleMomentumBegin = () => {
    clearSettleTimer();
    isMomentum.current = true;
  };
  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    isMomentum.current = false;
    clearSettleTimer();
    settle(event.nativeEvent.contentOffset.y);
  };

  // 가운데가 아닌 칸을 누르면 그 칸으로
  const pressRow = (index: number) => {
    if (index === shownIndex.current) return;
    setCenterIndex(index);
    scrollToIndex(index, true);
    const next = items[index].value;
    if (next !== value) onChange(next);
  };

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    const direction = event.nativeEvent.actionName === 'increment' ? 1 : -1;
    const index = stepIndex(selectedIndex, direction, items.length);
    if (index !== selectedIndex) onChange(items[index].value);
  };

  const initialOffset = useMemo(
    () => ({ x: 0, y: offsetAtIndex(selectedIndex, WHEEL_ROW_HEIGHT) }),
    // 처음 그릴 때의 위치만. 그 뒤는 scrollTo로 옮긴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <View
      style={{ width, height: WHEEL_ROW_HEIGHT * VISIBLE_ROWS }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: items[selectedIndex]?.label ?? '' }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={handleAccessibilityAction}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: PADDING,
          left: 0,
          right: 0,
          height: WHEEL_ROW_HEIGHT,
          borderRadius: 10,
          backgroundColor: colors.neutral[100],
        }}
      />
      <ScrollView
        ref={scrollRef}
        nestedScrollEnabled={false}
        disallowInterruption
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        snapToInterval={WHEEL_ROW_HEIGHT}
        decelerationRate="fast"
        contentOffset={initialOffset}
        contentContainerStyle={{ paddingVertical: PADDING }}
        scrollEventThrottle={16}
        onLayout={() => scrollToIndex(shownIndex.current, false)}
        onScroll={handleScroll}
        onScrollBeginDrag={handleBeginDrag}
        onScrollEndDrag={handleEndDrag}
        onMomentumScrollBegin={handleMomentumBegin}
        onMomentumScrollEnd={handleMomentumEnd}>
        {items.map((item, index) => {
          const isCenter = index === centerIndex;
          return (
            <Pressable
              key={item.value}
              onPress={() => pressRow(index)}
              importantForAccessibility="no"
              style={{ height: WHEEL_ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
              <Text
                style={{
                  fontSize: isCenter ? 22 : 18,
                  color: isCenter ? colors.neutral[900] : colors.neutral[400],
                }}
                className={isCenter ? 'font-bold' : ''}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
