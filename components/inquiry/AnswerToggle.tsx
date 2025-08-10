import { MaterialIcons } from '@expo/vector-icons';
import { Text } from 'components/common/Text';
import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import colors from 'tailwindcss/colors';
import { InquiryDB } from 'types/database';
import { formatKoreanDate } from 'utils/date';

interface AnswerToggleProps {
  inquiry: InquiryDB;
}

export default function AnswerToggle({ inquiry }: AnswerToggleProps) {
  const [visible, setVisible] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);

  const answerOpening = '문의해주셔서 감사합니다!\n남겨주신 문의에 대해 확인 후 답변드립니다.\n\n';
  const answer = answerOpening + inquiry.answer;

  const height = useSharedValue(0);
  const opacity = useSharedValue(0);
  const marginTop = useSharedValue(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setContentHeight(height);
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

  const StatusBadge = () => {
    if (inquiry.status === 'pending')
      return (
        <View className="-ml-0.5 flex-row items-center gap-1 self-start rounded-full border border-neutral-400 px-2 py-1">
          <MaterialIcons name="access-time" size={14} color={colors.neutral[400]} />
          <Text className="text-sm text-neutral-400">확인 대기 중</Text>
        </View>
      );
    if (inquiry.status === 'in_progress')
      return (
        <View className="-ml-0.5 flex-row items-center gap-1 self-start rounded-full border border-amber-500 px-2 py-1">
          <MaterialIcons name="search" size={14} color={colors.amber[500]} />
          <Text className="text-sm text-amber-500">확인 중</Text>
        </View>
      );
    if (inquiry.status === 'answered')
      return (
        <View className="-ml-0.5 flex-row items-center gap-1 self-start rounded-full border border-green-600 px-2 py-1">
          <MaterialIcons name="check" size={14} color={colors.green[600]} />
          <Text className="text-sm text-green-600">답변 완료</Text>
        </View>
      );
    return '';
  };

  return (
    <View className="rounded-xl bg-gray-100 px-4 py-4">
      <Pressable
        onPress={toggleAnswer}
        className="flex-row items-center justify-between rounded-lg"
        disabled={!inquiry.answer}>
        <View className="gap-2">
          <StatusBadge />
          <Text className="font-semibold">{inquiry.title}</Text>
          <Text className="text-neutral-500">{formatKoreanDate(inquiry.created_at)}</Text>
        </View>
        {inquiry.answer &&
          (visible ? (
            <MaterialIcons name="keyboard-arrow-up" size={24} color={colors.neutral[500]} />
          ) : (
            <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.neutral[500]} />
          ))}
      </Pressable>

      <Animated.View style={animatedStyle} className="rounded-lg bg-gray-50 px-4">
        <View>{visible && <Text className="py-4 text-green-600">{answer}</Text>}</View>

        <View onLayout={onLayout} className="absolute left-0 right-0 top-0 py-4 opacity-0">
          <Text>{answer}</Text>
        </View>
      </Animated.View>
    </View>
  );
}
