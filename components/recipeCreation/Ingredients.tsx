import { Text } from 'components/common/Text';
import { useLastPathname } from 'hooks/useLastPathname';
import { useSelectedIngredients } from 'hooks/useSelectedIngredients';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useIngredientScrollNudgeStore } from 'stores/ingredientScrollNudgeStore';
import { RecipeType } from 'types/database';
import { Ingredient as IngredientType } from 'types/recipe';
import { chunkArray } from 'utils/chunkArray';
import { getWeekColor } from 'utils/getWeekColor';
import { nextPageOffset, rowScrollState, scrollHintLabel } from 'utils/ingredientRowScroll';
import Ingredient from './Ingredient';

export interface IngredientsProps {
  title: string;
  week: number;
  ingredientList: IngredientType[];
}

interface IngredientsSectionProps extends IngredientsProps {
  // 화면에서 고른 주차. 이보다 높은 주차 재료는 잠근다
  selectableWeek: number;
}

// 오른쪽 끝 흰 그라데이션 폭: 다음 칸이 흐려지며 이어진다는 신호
// 첫 화면에서 넷째 칸이 화면 끝에 딱 맞아도 "더 있다"가 보이게 넉넉히
const FADE_WIDTH = 64;
// 처음 한 번 살짝 밀어 보이는 거리와 시점
const NUDGE_DISTANCE = 48;
const NUDGE_DELAY_MS = 500;
const NUDGE_RETURN_MS = 300;

export default function Ingredients({
  title,
  week,
  ingredientList,
  selectableWeek,
}: IngredientsSectionProps) {
  const type = useLastPathname() as RecipeType;

  const { selectedIngredients } = useSelectedIngredients({ type });
  const chunkedList = chunkArray(ingredientList, week === 1 ? 3 : 2);

  const listRef = useRef<FlatList<IngredientType[]>>(null);
  const metrics = useRef({ contentWidth: 0, viewportWidth: 0, offset: 0 });
  const [scroll, setScroll] = useState({ overflows: false, atEnd: true });

  const refresh = useCallback(() => {
    const next = rowScrollState(metrics.current);
    setScroll((prev) =>
      prev.overflows === next.overflows && prev.atEnd === next.atEnd ? prev : next
    );
  }, []);

  const onLayout = (e: LayoutChangeEvent) => {
    metrics.current.viewportWidth = e.nativeEvent.layout.width;
    refresh();
  };
  const onContentSizeChange = (width: number) => {
    metrics.current.contentWidth = width;
    refresh();
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    metrics.current.offset = e.nativeEvent.contentOffset.x;
    refresh();
  };

  const showNext = () => {
    listRef.current?.scrollToOffset({ offset: nextPageOffset(metrics.current), animated: true });
  };

  // 처음 연 날 한 번: 넘치는 첫 줄을 살짝 밀었다 되돌려 옆으로 넘어간다는 걸 보여 준다
  const reduceMotion = useReducedMotion();
  const nudgeHydrated = useIngredientScrollNudgeStore((s) => s.hydrated);
  useEffect(() => {
    if (!scroll.overflows || !nudgeHydrated) return;
    if (!useIngredientScrollNudgeStore.getState().claim()) return;
    if (reduceMotion) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        // 그새 사용자가 직접 넘겼으면 건드리지 않는다
        if (metrics.current.offset > 0) return;
        listRef.current?.scrollToOffset({ offset: NUDGE_DISTANCE, animated: true });
        timers.push(
          setTimeout(
            () => listRef.current?.scrollToOffset({ offset: 0, animated: true }),
            NUDGE_RETURN_MS
          )
        );
      }, NUDGE_DELAY_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [scroll.overflows, nudgeHydrated, reduceMotion]);

  return (
    <View className="gap-3">
      <View className="flex-row items-end justify-between">
        <Text className={`text-2xl font-bold ${getWeekColor(week)}`}>{title}</Text>
        {scroll.overflows && (
          <Pressable
            onPress={showNext}
            disabled={scroll.atEnd}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`${title} ${ingredientList.length}개, 옆으로 넘겨 보기`}
            accessibilityState={{ disabled: scroll.atEnd }}
            className="mb-0.5">
            <Text className="text-sm font-medium text-neutral-500">
              {scroll.atEnd ? `${ingredientList.length}개` : scrollHintLabel(ingredientList.length)}
            </Text>
          </Pressable>
        )}
      </View>
      <View>
        <FlatList
          ref={listRef}
          data={chunkedList}
          extraData={selectedIngredients.length}
          keyExtractor={(_, index) => `ingredients-${index}`}
          renderItem={({ item }) => (
            <View className="mr-3.5">
              {item.map((ingredient) => (
                <Ingredient
                  key={ingredient.name}
                  image={ingredient.image}
                  name={ingredient.name}
                  week={ingredient.week}
                  isCarbohydrate={ingredient.isCarbohydrate}
                  isSelected={selectedIngredients.some((i) => i.name === ingredient.name)}
                  disabled={ingredient.week > selectableWeek}
                />
              ))}
            </View>
          )}
          onLayout={onLayout}
          onContentSizeChange={onContentSizeChange}
          onScroll={onScroll}
          scrollEventThrottle={32}
          showsHorizontalScrollIndicator={false}
          horizontal
        />
        {!scroll.atEnd && <RightFade />}
      </View>
    </View>
  );
}

// 오른쪽에 더 있을 때 끝을 흐리게 덮는다 (누름은 아래 재료로 그대로 간다)
function RightFade() {
  // 줄마다 그라데이션 id가 같으면 안드로이드에서 서로 섞여 경계가 딱딱하게 보인다 → 줄마다 다른 id
  const id = `ingredientRowFade${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: FADE_WIDTH }}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <Stop offset="1" stopColor="#ffffff" stopOpacity="0.95" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
