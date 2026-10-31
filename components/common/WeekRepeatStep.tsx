import { weekRepeatCopy } from 'const/weekRepeat';
import { useWeekRepeat } from 'hooks/useWeekRepeat';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { getWeekColor } from 'utils/getWeekColor';
import type { WeekRepeatAdvice } from 'utils/weekRepeat';
import RippleButton from './RippleButton';
import { Text } from './Text';

interface WeekRepeatStepProps {
  week: number; // 들어서는 주차 (3·4)
  onNext: () => void; // 다음 주차로 → 기존 진입 팝업 단계로
  onRepeated: () => void; // 한 주 더 하기 성공 → 팝업 닫기
  onBusyChange: (busy: boolean) => void; // 한 주 더 하기 요청 중 (그동안 뒤로 가기로 닫지 않게)
}

// 주차 진입 팝업 첫 단계 앞 '지난 주 돌아보기' (3·4주차 진입, 전환마다 한 번)
export function WeekRepeatStep({ week, onNext, onRepeated, onBusyChange }: WeekRepeatStepProps) {
  const { advice: liveAdvice, isLoading, loadFailed, markAsked, repeatWeek } = useWeekRepeat(week);
  const [isRepeating, setIsRepeating] = useState(false);
  // 한 주 더 하기 중에는 시작일이 바뀌어도 누른 때 내용을 그대로 보여 준다 (닫히는 동안 숫자가 바뀌지 않게)
  const [frozenAdvice, setFrozenAdvice] = useState<WeekRepeatAdvice | null>(null);
  const advice = frozenAdvice ?? liveAdvice;

  // 보여 주는 중에 판정할 수 없게 되면(시작일이 지워짐 등) 빈 카드 대신 기존 팝업 내용으로 넘어간다
  const skip = !isLoading && advice.kind === 'none';
  useEffect(() => {
    if (skip) onNext();
  }, [skip, onNext]);

  if (isLoading) {
    return <ActivityIndicator className="my-10" color={colors.green[600]} />;
  }
  if (advice.kind === 'none') return null;

  const copy = weekRepeatCopy(advice, { loadFailed });

  const handleNext = () => {
    markAsked();
    onNext();
  };

  const handleRepeat = async () => {
    if (isRepeating) return;
    setIsRepeating(true);
    onBusyChange(true);
    setFrozenAdvice(advice);
    let ok = false;
    try {
      ok = await repeatWeek();
    } finally {
      setIsRepeating(false);
      onBusyChange(false);
    }
    if (ok) onRepeated();
    else setFrozenAdvice(null);
  };

  const repeatButton = (primary: boolean) => (
    <RippleButton
      outerClassName="w-full"
      rippleColor={primary ? colors.green[700] : colors.neutral[300]}
      className={`w-full py-2.5 ${primary ? 'bg-green-600' : 'bg-neutral-100'}`}
      disabled={isRepeating}
      onPress={handleRepeat}>
      {isRepeating ? (
        <ActivityIndicator color={primary ? colors.white : colors.neutral[600]} />
      ) : (
        <Text className={`font-bold ${primary ? 'text-white' : 'text-neutral-700'}`}>
          {copy.repeatLabel}
        </Text>
      )}
    </RippleButton>
  );

  const nextButton = (primary: boolean, label: string) => (
    <RippleButton
      outerClassName="w-full"
      rippleColor={primary ? colors.green[700] : colors.neutral[300]}
      className={`w-full py-2.5 ${primary ? 'bg-green-600' : 'bg-neutral-100'}`}
      disabled={isRepeating}
      onPress={handleNext}>
      <Text className={`font-bold ${primary ? 'text-white' : 'text-neutral-700'}`}>{label}</Text>
    </RippleButton>
  );

  return (
    <View className="w-full">
      <Text className="mb-1 text-sm text-neutral-500">
        <Text className={`text-sm font-bold ${getWeekColor(advice.repeatWeek)}`}>
          {advice.repeatWeek}주차
        </Text>{' '}
        끝
      </Text>
      <Text className="mb-4 text-2xl font-bold">{copy.title}</Text>

      {copy.stats && (
        <View className="mb-4 rounded-xl bg-neutral-100 px-4 py-3">
          <Text className="mb-2 text-xs text-neutral-500">시작할 때와 비교</Text>
          <View className="flex-row">
            {copy.stats.map(({ label, value }) => (
              <View key={label} className="flex-1">
                <Text className="text-sm text-neutral-600">{label}</Text>
                <Text className="text-xl font-bold text-neutral-900">{value}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <Text className="mb-3 text-base leading-6 text-neutral-800">{copy.message}</Text>
      {copy.basis && <Text className="mb-6 text-sm leading-5 text-neutral-500">{copy.basis}</Text>}
      {!copy.basis && <View className="mb-6" />}

      <View className="gap-2">
        {advice.kind === 'suggestRepeat' && (
          <>
            {repeatButton(true)}
            {nextButton(false, copy.nextLabel)}
          </>
        )}
        {advice.kind === 'noData' && (
          // 기록이 없으면 어느 쪽도 권하지 않는다 (같은 무게)
          <>
            {nextButton(false, copy.nextLabel)}
            {repeatButton(false)}
          </>
        )}
        {advice.kind === 'onTrack' && nextButton(true, '다음')}
      </View>
    </View>
  );
}
