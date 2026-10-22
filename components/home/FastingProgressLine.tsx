import { Text } from 'components/common/Text';
import { View } from 'react-native';
import type { FastingStatus } from 'utils/dietGuide';

const MINUTE_MS = 60 * 1000;

const formatRemaining = (ms: number) => {
  const totalMinutes = Math.max(0, Math.ceil(ms / MINUTE_MS));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
};

const formatClock = (date: Date) =>
  date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' });

// 단식 진행 중일 때 오늘 할 일 목록 위에 붙는 한 줄: 남은 시간 + 막대 + 끝나는 시각
export function FastingProgressLine({
  status,
}: {
  status: Extract<FastingStatus, { phase: 'fasting' }>;
}) {
  const total = status.endsAt.getTime() - status.startsAt.getTime();
  const elapsed = Math.min(1, Math.max(0, 1 - status.remainingMs / total));
  return (
    <View className="rounded-xl bg-indigo-50 px-4 py-3">
      <View className="flex-row items-center justify-between">
        <Text className="font-bold text-indigo-700">
          🕒 단식 중 · {formatRemaining(status.remainingMs)} 남았어요
        </Text>
        <Text className="text-xs text-neutral-500">{formatClock(status.endsAt)}에 끝나요</Text>
      </View>
      <View className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100">
        <View
          className="h-2 rounded-full bg-indigo-500"
          style={{ width: `${Math.round(elapsed * 100)}%` }}
        />
      </View>
    </View>
  );
}
