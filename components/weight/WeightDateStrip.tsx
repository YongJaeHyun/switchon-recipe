import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { useEffect, useRef, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, Pressable, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import colors from 'tailwindcss/colors';
import { type WeightDateChip, weightStripScrollX } from 'utils/weightDateStrip';

const CHIP_WIDTH = 50;
const CHIP_GAP = 6;
const ITEM_WIDTH = CHIP_WIDTH + CHIP_GAP;
// 오른쪽 끝 여백 (시트 좌우 여백과 같게)
const TRAIL = 20;

interface WeightDateStripProps {
  chips: WeightDateChip[];
  disabled?: boolean;
  // 바뀌면 처음 위치를 다시 잡는다 (시트를 다시 열 때)
  placeKey?: unknown;
  onSelect(day: string): void;
}

// 체중 시트 위 날짜 줄: 오래된 날 ← … → 오늘. 처음엔 고른 날이 오른쪽에 보이게 두고,
// 고른 날이 바뀌면(결과지 날짜 등) 화면 밖일 때만 그 칸으로 옮긴다. ◀는 한 화면만큼 앞으로
export function WeightDateStrip({ chips, disabled, placeKey, onSelect }: WeightDateStripProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [viewport, setViewport] = useState(0);
  const scrollXRef = useRef(0);
  const [atStart, setAtStart] = useState(true);
  const placedRef = useRef(false);

  const selectedIndex = chips.findIndex((chip) => chip.selected);
  const firstDay = chips[0]?.day;

  // 시트를 다시 열거나 날짜 범위가 바뀌면 처음 위치를 다시 잡는다
  useEffect(() => {
    placedRef.current = false;
  }, [firstDay, placeKey]);

  useEffect(() => {
    if (!viewport || chips.length === 0) return;
    const scroller = scrollRef.current as unknown as {
      scrollTo(o: { x: number; animated: boolean }): void;
    } | null;
    if (!placedRef.current) {
      placedRef.current = true;
      const x = weightStripScrollX({
        index: selectedIndex,
        itemWidth: ITEM_WIDTH,
        viewportWidth: viewport - TRAIL + CHIP_GAP,
        count: chips.length,
      });
      scroller?.scrollTo({ x, animated: false });
      scrollXRef.current = x;
      setAtStart(x <= 0);
      return;
    }
    if (selectedIndex < 0) return;
    const left = selectedIndex * ITEM_WIDTH;
    const visible =
      left >= scrollXRef.current && left + CHIP_WIDTH <= scrollXRef.current + viewport;
    if (!visible) {
      const x = weightStripScrollX({
        index: selectedIndex,
        itemWidth: ITEM_WIDTH,
        viewportWidth: viewport - TRAIL + CHIP_GAP,
      });
      scroller?.scrollTo({ x: left < scrollXRef.current ? left : x, animated: true });
    }
  }, [viewport, selectedIndex, chips.length, firstDay, placeKey]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollXRef.current = e.nativeEvent.contentOffset.x;
    setAtStart(e.nativeEvent.contentOffset.x <= 1);
  };

  const pageBack = () => {
    const x = Math.max(0, scrollXRef.current - Math.max(ITEM_WIDTH, viewport - ITEM_WIDTH));
    (
      scrollRef.current as unknown as { scrollTo(o: { x: number; animated: boolean }): void }
    )?.scrollTo({ x, animated: true });
  };

  return (
    <View className="-mx-5 mb-4 flex-row items-center">
      <Pressable
        onPress={pageBack}
        disabled={atStart}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="이전 날짜 보기"
        accessibilityState={{ disabled: atStart }}
        className="h-14 w-8 items-center justify-center"
        style={{ opacity: atStart ? 0.2 : 1 }}>
        <MaterialIcons name="chevron-left" size={22} color={colors.neutral[500]} />
      </Pressable>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => setViewport(e.nativeEvent.layout.width)}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        contentContainerStyle={{ gap: CHIP_GAP, paddingRight: TRAIL - CHIP_GAP }}
        style={{ flex: 1 }}>
        {chips.map((chip) => {
          const weekdayColor = chip.selected
            ? 'text-white'
            : chip.weekdayIndex === 0
              ? 'text-red-500'
              : chip.weekdayIndex === 6
                ? 'text-blue-500'
                : 'text-neutral-400';
          return (
            <Pressable
              key={chip.day}
              disabled={disabled}
              onPress={() => onSelect(chip.day)}
              accessibilityRole="button"
              accessibilityLabel={chip.label}
              accessibilityState={{ selected: chip.selected, disabled }}
              style={{ width: CHIP_WIDTH }}
              className={`h-14 items-center justify-center rounded-2xl ${
                chip.selected
                  ? 'bg-green-600'
                  : chip.isToday
                    ? 'border border-green-600 bg-white'
                    : 'bg-neutral-100'
              }`}>
              <Text
                className={`text-[13px] font-bold ${
                  chip.selected ? 'text-white' : 'text-neutral-800'
                }`}>
                {chip.monthDay}
              </Text>
              <Text
                className={`text-xs ${
                  chip.isToday && !chip.selected ? 'font-bold text-green-600' : weekdayColor
                }`}>
                {chip.isToday ? '오늘' : chip.weekday}
              </Text>
              {/* 기록한 날 표시 (자리를 늘 잡아 칸 높이가 같다) */}
              <View
                className={`mt-0.5 h-1 w-1 rounded-full ${
                  chip.recorded ? (chip.selected ? 'bg-white' : 'bg-green-600') : ''
                }`}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
