import { MaterialIcons } from '@expo/vector-icons';
import { Text } from 'components/common/Text';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import { Maybe } from '../../types/common';

interface StatusBadgeProps {
  status: Maybe<string>;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  if (status === 'pending')
    return (
      <View className="-ml-0.5 flex-row items-center gap-1 self-start rounded-full border border-neutral-400 px-2 py-1">
        <MaterialIcons name="access-time" size={14} color={colors.neutral[400]} />
        <Text className="text-sm text-neutral-400">확인 대기 중</Text>
      </View>
    );
  if (status === 'in_progress')
    return (
      <View className="-ml-0.5 flex-row items-center gap-1 self-start rounded-full border border-amber-500 px-2 py-1">
        <MaterialIcons name="search" size={14} color={colors.amber[500]} />
        <Text className="text-sm text-amber-500">확인 중</Text>
      </View>
    );
  if (status === 'answered')
    return (
      <View className="-ml-0.5 flex-row items-center gap-1 self-start rounded-full border border-green-600 px-2 py-1">
        <MaterialIcons name="check" size={14} color={colors.green[600]} />
        <Text className="text-sm text-green-600">답변 완료</Text>
      </View>
    );
  return '';
}
