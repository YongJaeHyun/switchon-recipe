import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { Text } from 'components/common/Text';
import { useTodos } from 'hooks/useTodos';
import { ActivityIndicator, View } from 'react-native';
import AnimatedNumbers from 'react-native-animated-numbers';
import { Easing } from 'react-native-reanimated';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { getWeekAndDay } from 'utils/date';
import { getWeekBGColor, getWeekColor, getWeekColorHex } from 'utils/getWeekColor';
import { Todo } from './Todo';

export function Todos() {
  const { todos, completedRate, isLoading } = useTodos();
  const startDate = useUserStore((state) => state.start_date);

  const today = new Date().toISOString();
  const { week, day } = getWeekAndDay(startDate ?? today);

  const isFirstStep = week === 1 && day <= 3;
  const isSecondStep = week === 1 && day > 3;

  return (
    <View className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <View className={`px-4 py-2 ${getWeekBGColor(week)}`}>
        <Text className="text-white">
          <Text>{week}주차</Text>
          {isFirstStep && <Text> (1 ~ 3일) </Text>}
          {isSecondStep && <Text> (4 ~ 7일) </Text>}
        </Text>
      </View>
      <View className="m-4 items-center justify-evenly rounded-xl bg-neutral-100 py-4">
        <View className="flex-row items-center gap-1">
          {completedRate === 100 && (
            <FontAwesome5 name="trophy" size={20} color={colors.yellow[500]} />
          )}
          <AnimatedNumbers
            animateToNumber={completedRate}
            easing={Easing.elastic(1)}
            animationDuration={1250}
            fontStyle={{
              fontSize: 24,
              lineHeight: 32,
              fontWeight: 'bold',
              color: getWeekColorHex(week),
            }}
          />
          <Text className={`text-2xl font-bold ${getWeekColor(week)}`}>%</Text>
        </View>
        <Text className="text-sm text-neutral-500">오늘의 완료율</Text>
      </View>

      <View className="mb-4 px-4">
        {isLoading ? (
          <ActivityIndicator className="h-48" size="large" color={colors.green[500]} />
        ) : (
          todos.map((todo) => <Todo key={`todo-${todo.id}`} {...todo} />)
        )}
      </View>
    </View>
  );
}
