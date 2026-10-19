import { Text } from 'components/common/Text';
import { router } from 'expo-router';
import { useFasting } from 'hooks/useFasting';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { getFastingStatus } from 'utils/dietGuide';

const MINUTE_MS = 60 * 1000;

const formatRemaining = (ms: number) => {
  const totalMinutes = Math.max(0, Math.ceil(ms / MINUTE_MS));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
};

const formatClock = (date: Date) =>
  date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' });

// 단식일 전용 가이드: 시작 전 안내 → 진행 중 카운트다운 → 끝나면 첫 끼 추천
export function FastingCard() {
  const { days, startTime } = useFasting();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => clearInterval(id);
  }, []);

  const status = getFastingStatus(now, days, startTime);
  if (status.phase === 'none') return null;

  if (status.phase === 'upcoming') {
    return (
      <View className="mx-4 mt-4 rounded-xl bg-indigo-50 p-4">
        <Text className="font-bold text-indigo-700">🕒 오늘 {startTime}부터 24시간 단식이에요</Text>
        <Text className="mt-1 text-sm text-neutral-600">
          {formatClock(status.startsAt)} 전에 단백질 위주로 든든하게 드세요.
        </Text>
      </View>
    );
  }

  if (status.phase === 'fasting') {
    const elapsed = 1 - status.remainingMs / (status.endsAt.getTime() - status.startsAt.getTime());
    return (
      <View className="mx-4 mt-4 rounded-xl bg-indigo-50 p-4">
        <Text className="font-bold text-indigo-700">
          🕒 단식 중 · {formatRemaining(status.remainingMs)} 남았어요
        </Text>
        <View className="mt-3 h-2 overflow-hidden rounded-full bg-indigo-100">
          <View
            className="h-2 rounded-full bg-indigo-500"
            style={{ width: `${Math.round(elapsed * 100)}%` }}
          />
        </View>
        <Text className="mt-2 text-xs text-neutral-500">{formatClock(status.endsAt)}에 끝나요</Text>
        <Text className="mt-3 text-sm text-neutral-700">
          마셔도 돼요: 물, 탄산수, 무가당 차, 블랙커피(오전 1잔)
        </Text>
      </View>
    );
  }

  return (
    <View className="mx-4 mt-4 rounded-xl bg-green-50 p-4">
      <Text className="font-bold text-green-700">🎉 단식 완료! 수고했어요</Text>
      <Text className="mt-1 text-sm text-neutral-600">첫 끼는 고단백으로 근손실을 막아주세요.</Text>
      <Pressable
        className="mt-3 self-start rounded-lg bg-green-600 px-3 py-2"
        onPress={() => router.push('/(tabs)/home/recipeCreation/zero')}>
        <Text className="text-sm font-bold text-white">고단백 레시피 만들기</Text>
      </Pressable>
    </View>
  );
}
