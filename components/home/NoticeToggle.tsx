import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { formatNoticeDate, noticeChangeText } from 'utils/noticeDisplay';

interface NoticeToggleProps {
  version: string;
  changes: string[];
  updatedAt: string;
  currentYear: number;
  // 최신 버전: 펼친 채로 "최신" 표시. 지난 버전은 접힌 한 줄
  latest?: boolean;
}

// 업데이트 내역의 버전 한 칸. 변경 내용은 이모지를 떼고 점 목록으로
export default function NoticeToggle({
  version,
  changes,
  updatedAt,
  currentYear,
  latest = false,
}: NoticeToggleProps) {
  const [open, setOpen] = useState(latest);
  const date = formatNoticeDate(updatedAt, currentYear);

  return (
    <View className={latest ? 'pb-2' : 'border-t border-neutral-100'}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        disabled={changes.length === 0}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center gap-2 py-3">
        <Text className="text-base font-bold text-neutral-900">{version}</Text>
        <Text className="text-sm text-neutral-400">{date}</Text>
        {latest && (
          <View className="rounded-full bg-green-100 px-2 py-0.5">
            <Text className="text-xs font-bold text-green-700">최신</Text>
          </View>
        )}
        <View className="flex-1" />
        {changes.length > 0 && (
          <MaterialIcons
            name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
            size={22}
            color={colors.neutral[400]}
          />
        )}
      </Pressable>

      {open && (
        <View className="gap-1.5 pb-3">
          {changes.map((change) => (
            <View key={change} className="flex-row gap-2">
              <View className="mt-2 h-1.5 w-1.5 rounded-full bg-green-600" />
              <Text className="flex-1 text-sm leading-5 text-neutral-700">
                {noticeChangeText(change)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
