import { MaterialIcons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import colors from 'tailwindcss/colors';
import { Nullable } from '../../types/common';

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
  let timer = useRef<Nullable<NodeJS.Timeout>>(null);

  const [isInit, setIsInit] = useState(false);
  const [visible, setVisible] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);

  const progress = useSharedValue(0);

  const openLatestNotice = () => {
    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(() => {
      progress.value = 1;
      setIsInit(true);
      setVisible(true);
    }, 50);
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const { height: measuredHeight } = event.nativeEvent.layout;
    setContentHeight(measuredHeight);

    if (!isInit && defaultOpen) {
      openLatestNotice();
    }
  };

  const toggleAnswer = () => {
    const toVisible = !visible;
    setVisible(toVisible);

    progress.value = withTiming(toVisible ? 1 : 0, { duration: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    height: progress.value * contentHeight,
    opacity: progress.value,
    marginTop: progress.value * 16,
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
              <Text key={change}>{change}</Text>
            ))}
          </View>
        )}

        <View onLayout={onLayout} className="absolute left-0 right-0 top-0 opacity-0">
          <View className="gap-4 py-4">
            {changes.map((change) => (
              <Text key={change}>{change}</Text>
            ))}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}
