import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import ConfirmModal from 'components/common/ConfirmModal';
import { Text } from 'components/common/Text';
import { useFastingResult } from 'hooks/useFastingResult';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { formatKstClock, type FastingStatus } from 'utils/dietGuide';
import { earlyEndConfirmMessage, fastedMinutesAt, fastingDayOf } from 'utils/fastingEarlyEnd';

const MINUTE_MS = 60 * 1000;

const formatRemaining = (ms: number) => {
  const totalMinutes = Math.max(0, Math.ceil(ms / MINUTE_MS));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
};

const formatClock = (date: Date) =>
  date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' });

// 진행 중 "일찍 끝냈어요": 지금까지 단식한 시간을 보여주고 확인하면 그 단식(시작일)에 일찍 끝냄 + 분을 저장.
// 저장되면 오늘 탭은 진행 줄 대신 결과 줄을 보여준다 (TodayChecklist)
const EarlyEndButton = ({ startsAt }: { startsAt: Date }) => {
  const { saveResult, isSaving } = useFastingResult(fastingDayOf(startsAt));
  const [confirmMinutes, setConfirmMinutes] = useState<number | null>(null);

  return (
    <>
      <Pressable
        hitSlop={8}
        disabled={isSaving}
        onPress={() => setConfirmMinutes(fastedMinutesAt(startsAt, new Date()))}>
        <Text className="text-xs font-bold text-neutral-500 underline">일찍 끝냈어요</Text>
      </Pressable>
      <ConfirmModal
        type="create"
        iconElement={<MaterialIcons name="restaurant" size={36} color={colors.green[600]} />}
        visible={confirmMinutes !== null}
        title="단식을 끝낼까요?"
        message={confirmMinutes === null ? '' : earlyEndConfirmMessage(confirmMinutes)}
        cancelLabel="계속할게요"
        confirmLabel="끝낼게요"
        disabled={isSaving}
        onCancel={() => setConfirmMinutes(null)}
        onConfirm={() => {
          if (confirmMinutes === null) return;
          saveResult(
            { result: 'broken', fastedMinutes: confirmMinutes },
            { onSettled: () => setConfirmMinutes(null) }
          );
        }}
      />
    </>
  );
};

// 오늘 할 일 목록 위 단식 한 줄.
// 시작 전(오늘이 단식일): "오늘 …부터 24시간 단식이에요" / 진행 중: 남은 시간 + 막대 + 끝나는 시각 + 마셔도 되는 것 + 일찍 끝냈어요
export function FastingProgressLine({
  status,
}: {
  status: Extract<FastingStatus, { phase: 'upcoming' | 'fasting' }>;
}) {
  if (status.phase === 'upcoming') {
    return (
      <View className="rounded-xl bg-green-50 px-4 py-3">
        <Text className="font-bold text-green-700">
          🕒 오늘 {formatKstClock(status.startsAt)}부터 24시간 단식이에요
        </Text>
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
      <View className="mt-2 flex-row items-center justify-between gap-2">
        <Text className="flex-1 text-xs text-neutral-500">
          마셔도 돼요: 물, 탄산수, 무가당 차, 블랙커피(오전 1잔)
        </Text>
        <EarlyEndButton startsAt={status.startsAt} />
      </View>
    </View>
  );
}
