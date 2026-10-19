import { Text } from 'components/common/Text';
import { Checkbox } from 'expo-checkbox';
import { useTodos } from 'hooks/useTodos';
import React from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, TouchableWithoutFeedback, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useUserStore } from 'stores/userStore';
import { Todo as TodoType } from 'types/todo';
import { getWeekAndDay } from 'utils/date';
import { getTodoAction } from 'utils/dietGuide';
import { getWeekColorHex } from 'utils/getWeekColor';

export const Todo = React.memo(({ id, value, checked }: TodoType) => {
  const { toggleChecked } = useTodos();
  const startDate = useUserStore((state) => state.start_date);
  const { week } = getWeekAndDay(startDate);
  const action = getTodoAction(value);

  const runAction = () => {
    if (!action) return;
    if (action.type === 'route') router.push(action.href);
    else Alert.alert(action.title, action.body);
  };

  return (
    <Animated.View
      entering={FadeInDown}
      exiting={FadeOutUp}
      layout={
        LinearTransition.springify()
          .duration(800) // 애니메이션 속도
          .damping(0) // 탄성 감소 (값 낮출수록 튕김 적음)
          .mass(0.1) // 스프링 관성 조절
          .stiffness(50) // 스프링 강도
      }>
      <TouchableWithoutFeedback onPress={() => toggleChecked(id)}>
        <View className="flex-row items-center gap-4 py-2">
          <Checkbox
            color={getWeekColorHex(week)}
            value={checked}
            onValueChange={() => toggleChecked(id)}
          />
          <Text className="flex-1 text-neutral-800">{value}</Text>
          {action && (
            <Pressable hitSlop={8} onPress={runAction}>
              <Text className="text-sm text-neutral-500">{action.label} ›</Text>
            </Pressable>
          )}
        </View>
      </TouchableWithoutFeedback>
    </Animated.View>
  );
});
