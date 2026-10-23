import { Text } from 'components/common/Text';
import type { FastingTime } from 'const/fastingDays';
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

// 오늘 할 일 목록 위 단식 한 줄.
// 시작 전(오늘이 단식일): "오늘 …부터 24시간 단식이에요" / 진행 중: 남은 시간 + 막대 + 끝나는 시각 + 마셔도 되는 것
export function FastingProgressLine({
  status,
  startTime,
}: {
  status: Extract<FastingStatus, { phase: 'upcoming' | 'fasting' }>;
  startTime: FastingTime | null | undefined;
}) {
  if (status.phase === 'upcoming') {
    return (
      <View className="rounded-xl bg-green-50 px-4 py-3">
        <Text className="font-bold text-green-700">🕒 오늘 {startTime}부터 24시간 단식이에요</Text>
      </View>
    );
  }

  const total = status.endsAt.getTime() - status.startsAt.getTime();
  const elapsed = Math.min(1, Math.max(0, 1 - status.remainingMs / total));
  return (
    <View className="rounded-xl bg-green-50 px-4 py-3">
      <View className="flex-row items-center justify-between">
        <Text className="font-bold text-green-700">
          🕒 단식 중 · {formatRemaining(status.remainingMs)} 남았어요
        </Text>
        <Text className="text-xs text-neutral-500">{formatClock(status.endsAt)}에 끝나요</Text>
      </View>
      <View className="mt-2 h-2 overflow-hidden rounded-full bg-green-100">
        <View
          className="h-2 rounded-full bg-green-600"
          style={{ width: `${Math.round(elapsed * 100)}%` }}
        />
      </View>
      <Text className="mt-2 text-xs text-neutral-500">
        마셔도 돼요: 물, 탄산수, 무가당 차, 블랙커피(오전 1잔)
      </Text>
    </View>
  );
}
