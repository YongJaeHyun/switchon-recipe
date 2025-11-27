import { Text } from 'components/common/Text';
import { Checkbox } from 'expo-checkbox';
import { useTodos } from 'hooks/useTodos';
import React from 'react';
import { TouchableWithoutFeedback, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useUserStore } from 'stores/userStore';
import { Todo as TodoType } from 'types/todo';
import { getWeekAndDay } from 'utils/date';
import { getWeekColorHex } from 'utils/getWeekColor';

export const Todo = React.memo(({ id, value, checked }: TodoType) => {
  const { toggleChecked } = useTodos();
  const startDate = useUserStore((state) => state.start_date);
  const { week } = getWeekAndDay(startDate);

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
        <View className="flex-row gap-4 py-2">
          <Checkbox
            color={getWeekColorHex(week)}
            value={checked}
            onValueChange={() => toggleChecked(id)}
          />
          <Text className="text-neutral-800">{value}</Text>
        </View>
      </TouchableWithoutFeedback>
    </Animated.View>
  );
});
