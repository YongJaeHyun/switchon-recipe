import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { WeightChart } from 'components/weight/WeightChart';
import { WeightInputSheet, type WeightInputTarget } from 'components/weight/WeightInputSheet';
import { router } from 'expo-router';
import { useWeights } from 'hooks/useWeights';
import { useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { getKoreanDateString } from 'utils/date';
import { chartPoints, formatWeightDiff, prefillWeight, weightChange } from 'utils/weight';

// 홈 체중 카드: 오늘 값 / 기록 버튼 / 시작일부터의 미니 그래프. 누르면 전체 그래프 화면
export function WeightCard() {
  const startDate = useUserStore((state) => state.start_date);
  const { logs } = useWeights();
  const sheetRef = useRef<BottomSheetMethods>(null);
  const [target, setTarget] = useState<WeightInputTarget | null>(null);

  const today = getKoreanDateString({ formatType: 'date' });
  const todayLog = logs.find((log) => log.day === today);
  const points = useMemo(() => chartPoints(logs, startDate), [logs, startDate]);
  const change = useMemo(() => weightChange(logs, startDate), [logs, startDate]);

  const openInput = () => {
    const day = getKoreanDateString({ formatType: 'date' });
    setTarget({ day, initial: prefillWeight(logs, day), isToday: true });
    sheetRef.current?.expand();
  };

  return (
    <>
      <Pressable
        className="gap-3 rounded-xl border border-neutral-200 bg-white p-4"
        onPress={() => router.push('/weight')}>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-green-50">
              <MaterialIcons name="monitor-weight" size={24} color={colors.green[600]} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-neutral-800">체중 기록</Text>
              {todayLog ? (
                <Text className="text-sm text-neutral-500">
                  오늘{' '}
                  <Text className="font-bold text-neutral-800">
                    {todayLog.weight_kg.toFixed(1)}kg
                  </Text>
                  {change && points.length > 1
                    ? `  ·  시작 대비 ${formatWeightDiff(change.diff)}`
                    : ''}
                </Text>
              ) : (
                <Text className="text-sm text-neutral-500">오늘 체중을 기록해 보세요</Text>
              )}
            </View>
          </View>
          <RippleButton
            outerClassName={todayLog ? 'border border-green-600 bg-white' : 'bg-green-600'}
            rounded="lg"
            className="px-3 py-2"
            rippleColor={todayLog ? colors.green[100] : undefined}
            onPress={openInput}>
            <Text className={`font-bold ${todayLog ? 'text-green-600' : 'text-white'}`}>
              {todayLog ? '수정' : '기록하기'}
            </Text>
          </RippleButton>
        </View>

        {points.length > 0 && <WeightChart points={points} height={70} compact />}
      </Pressable>

      <WeightInputSheet bottomSheetRef={sheetRef} target={target} />
    </>
  );
}
