import { Text } from 'components/common/Text';
import { PASS_FEATURE_IMAGES } from 'const/passFeatureImages';
import { PASS_FEATURES, type PassFeatureId, passFeatureIndex } from 'const/passFeatures';
import { useRef, useState } from 'react';
import {
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';

// 실제 화면 이미지 비율 (가로 606 : 세로 1000)
const IMAGE_RATIO = 1000 / 606;
const GAP = 12;
const SIDE_PADDING = 20;

// 패스 화면: 패스 기능의 실제 앱 화면을 옆으로 넘겨 본다. 다음 장이 살짝 보여 넘길 수 있다는 걸 알린다.
// initialId가 있으면 그 기능 장부터 연다 ("패스 기능이에요" 창에서 [패스 보기]로 들어온 경우)
export function PassFeatureGallery({ initialId }: { initialId: PassFeatureId | null }) {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = Math.round(Math.min(screenWidth * 0.48, 220));
  const interval = cardWidth + GAP;
  const [index, setIndex] = useState(() => passFeatureIndex(initialId));
  const scrolledToInitial = useRef(false);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / interval);
    setIndex(Math.min(Math.max(next, 0), PASS_FEATURES.length - 1));
  };

  return (
    <View className="gap-3">
      <ScrollView
        ref={(scroll) => {
          if (!scroll || scrolledToInitial.current) return;
          scrolledToInitial.current = true;
          const start = passFeatureIndex(initialId);
          if (start > 0) {
            requestAnimationFrame(() => scroll.scrollTo({ x: start * interval, animated: false }));
          }
        }}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={interval}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={{ marginHorizontal: -SIDE_PADDING }}
        contentContainerStyle={{ paddingHorizontal: SIDE_PADDING, gap: GAP }}>
        {PASS_FEATURES.map((feature) => (
          <View
            key={feature.id}
            style={{ width: cardWidth }}
            className="gap-2"
            accessible
            accessibilityLabel={`${feature.title}. ${feature.description}`}>
            <Image
              source={PASS_FEATURE_IMAGES[feature.id]}
              style={{ width: cardWidth, height: Math.round(cardWidth * IMAGE_RATIO) }}
              className="rounded-2xl border border-neutral-200"
              resizeMode="cover"
            />
            <Text className="text-base font-bold text-neutral-900">{feature.title}</Text>
            <Text className="text-sm leading-5 text-neutral-500">{feature.description}</Text>
          </View>
        ))}
      </ScrollView>
      <View className="flex-row justify-center gap-1.5">
        {PASS_FEATURES.map((feature, i) => (
          <View
            key={feature.id}
            className={`h-1.5 rounded-full ${i === index ? 'w-4 bg-green-600' : 'w-1.5 bg-neutral-300'}`}
          />
        ))}
      </View>
    </View>
  );
}
