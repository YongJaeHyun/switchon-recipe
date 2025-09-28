import { MaterialIcons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import colors from 'tailwindcss/colors';

interface NoticeToggleProps {
  version: string;
  changes: string[];
  updatedAt: string;
  defaultOpen?: boolean;
}

export default function NoticeToggle({
  version,
  changes,
  updatedAt,
  defaultOpen = false,
}: NoticeToggleProps) {
  let timer = useRef<NodeJS.Timeout | null>(null);

  const [isInit, setIsInit] = useState(false);
  const [visible, setVisible] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);

  const height = useSharedValue(0);
  const opacity = useSharedValue(0);
  const marginTop = useSharedValue(0);

  const openLatestNotice = (measuredHeight: number) => {
    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(() => {
      height.value = measuredHeight;
      opacity.value = 1;
      marginTop.value = 16;
      setIsInit(true);
      setVisible(true);
    }, 50);
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const { height: measuredHeight } = event.nativeEvent.layout;
    setContentHeight(measuredHeight);

    if (!isInit && defaultOpen) {
      openLatestNotice(measuredHeight);
    }
  };

  const toggleAnswer = () => {
    const toVisible = !visible;
    setVisible(toVisible);

    height.value = withTiming(toVisible ? contentHeight : 0, { duration: 300 });
    opacity.value = withTiming(toVisible ? 1 : 0, { duration: 300 });
    marginTop.value = withTiming(toVisible ? 16 : 0, { duration: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
    marginTop: marginTop.value,
    overflow: 'hidden',
  }));

  return (
    <View className="rounded-xl bg-gray-100 px-4 py-4">
      <Pressable
        onPress={toggleAnswer}
        className="flex-row items-center justify-between rounded-lg"
        disabled={!changes.length}>
        <View>
          <Text className="text-lg font-bold">{version}</Text>
          <Text className="text-sm text-gray-500">{updatedAt}</Text>
        </View>
        {changes.length &&
          (visible ? (
            <MaterialIcons name="keyboard-arrow-up" size={24} color={colors.neutral[500]} />
          ) : (
            <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.neutral[500]} />
          ))}
      </Pressable>

      <Animated.View style={animatedStyle} className="rounded-lg">
        {visible && (
          <View className="gap-4 py-4">
            {changes.map((change) => (
              <Text key={change}>- {change}</Text>
            ))}
          </View>
        )}

        <View onLayout={onLayout} className="absolute left-0 right-0 top-0 opacity-0">
          <View className="gap-4 py-4">
            {changes.map((change) => (
              <Text key={change}>- {change}</Text>
            ))}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}
