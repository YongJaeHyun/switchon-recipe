import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { LatestNoticeItem } from 'const/notices';
import type { getLatestIngredientNotice } from 'utils/latestIngredientNotice';
import { Nullable } from '../../types/common';
import AllNoticesModal from './AllNoticesModal';
import IngredientUpdateModal from './IngredientUpdateModal';

interface LatestNoticeProps {
  notices: LatestNoticeItem[];
  // 재료 줄을 눌렀을 때 보여 줄 새 재료
  latestIngredient: ReturnType<typeof getLatestIngredientNotice>;
}

const INTERVAL = 5000;

export function LatestNotice({ notices, latestIngredient }: LatestNoticeProps) {
  const timerRef = useRef<Nullable<NodeJS.Timeout>>(null);
  const isActiveRef = useRef(true);

  // 지금 보이는 줄에 따라 연다: 앱 업데이트 → 업데이트 내역, 재료 → 새 재료 창
  const [opened, setOpened] = useState<LatestNoticeItem['kind'] | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const nextIndex = (currentIndex + 1) % notices.length;

  const [, startTransition] = useTransition();

  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const openModal = () => setOpened(notices[currentIndex]?.kind ?? 'app');
  const closeModal = () => setOpened(null);

  const animatedCurrent = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const animatedNext = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + 30 }],
    opacity: 1 - opacity.value,
  }));

  const finishAnimation = useCallback(() => {
    startTransition(() => {
      setCurrentIndex((prev) => (prev + 1) % notices.length);
    });

    opacity.value = 1;
    translateY.value = 0;
  }, [opacity, translateY, notices.length]);

  const runAnimation = useCallback(() => {
    if (!isActiveRef.current || notices.length <= 1) return;

    translateY.value = withTiming(-30, { duration: 400 }, (finished) => {
      if (finished) {
        runOnJS(finishAnimation)();
      }
    });
    opacity.value = withTiming(0, { duration: 400 });
  }, [finishAnimation, notices.length, translateY, opacity]);

  useEffect(() => {
    isActiveRef.current = true;

    if (notices.length <= 1) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    timerRef.current = setInterval(() => {
      if (isActiveRef.current) {
        runAnimation();
      }
    }, INTERVAL);

    return () => {
      isActiveRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [notices.length, opacity, runAnimation, translateY]);

  if (notices.length === 0) return null;

  return (
    <>
      <Pressable
        className="relative h-10 w-full overflow-hidden rounded-full border border-neutral-400 px-3 py-2"
        onPress={openModal}>
        <View className="flex-1 justify-center">
          <Animated.View
            style={[
              {
                position: 'absolute',
                width: '100%',
                height: '100%',
                justifyContent: 'center',
              },
              animatedCurrent,
            ]}>
            <Text className="text-sm text-neutral-600" numberOfLines={1}>
              {notices[currentIndex]?.text}
            </Text>
          </Animated.View>

          {notices.length > 1 && (
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  justifyContent: 'center',
                },
                animatedNext,
              ]}>
              <Text className="text-sm text-neutral-600" numberOfLines={1}>
                {notices[nextIndex]?.text}
              </Text>
            </Animated.View>
          )}
        </View>
      </Pressable>

      <AllNoticesModal visible={opened === 'app'} onClose={closeModal} />
      <IngredientUpdateModal
        notice={opened === 'ingredient' ? latestIngredient : null}
        onClose={closeModal}
      />
    </>
  );
}
