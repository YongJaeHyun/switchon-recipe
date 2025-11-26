import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import { Text } from 'components/common/Text';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import { Maybe } from '../../types/common';

interface CategoryBadgeProps {
  category: Maybe<string>;
  active?: boolean;
}

const baseIconColor = colors.neutral[400];
const baseTextColor = 'text-neutral-400';
const baseBorderColor = 'border-neutral-400';

const baseViewClassName = 'self-start flex-row items-center rounded-xl border px-3 py-2';

export function CategoryBadge({ category, active = true }: CategoryBadgeProps) {
  if (category === '일반 문의') {
    return (
      <View className={`${baseViewClassName} ${active ? 'border-green-600' : baseBorderColor}`}>
        <FontAwesome5
          name="question-circle"
          size={16}
          color={active ? colors.green[600] : baseIconColor}
        />
        <Text className={`ml-1 ${active ? 'text-green-600' : baseTextColor}`}>{category}</Text>
      </View>
    );
  }
  if (category === '버그 신고') {
    return (
      <View className={`${baseViewClassName} ${active ? 'border-red-500' : baseBorderColor}`}>
        <MaterialIcons
          name="bug-report"
          size={16}
          color={active ? colors.red[500] : baseIconColor}
        />
        <Text className={`ml-1 ${active ? 'text-red-500' : baseTextColor}`}>{category}</Text>
      </View>
    );
  }
  if (category === '기능 요청') {
    return (
      <View className={`${baseViewClassName} ${active ? 'border-yellow-500' : baseBorderColor}`}>
        <MaterialIcons
          name="lightbulb"
          size={16}
          color={active ? colors.yellow[500] : baseIconColor}
        />
        <Text className={`ml-1 ${active ? 'text-yellow-500' : baseTextColor}`}>{category}</Text>
      </View>
    );
  }
  return null;
}
