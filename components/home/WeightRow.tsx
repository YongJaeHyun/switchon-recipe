import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { WeightInputSheet, type WeightInputTarget } from 'components/weight/WeightInputSheet';
import { router } from 'expo-router';
import useKoreanToday from 'hooks/useKoreanToday';
import { useWeights } from 'hooks/useWeights';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { getKoreanDateString } from 'utils/date';
import { prefillWeight } from 'utils/weight';

// 오늘 할 일 목록의 체중 줄: 오늘 기록이 없으면 [기록하기], 있으면 값 + [수정].
// 글자를 누르면 기록 탭 체중 칸. 체중 입력 시트·알림 질문 흐름은 WeightInputSheet 그대로
export function WeightRow() {
  const { logs } = useWeights();
  const sheetRef = useRef<BottomSheetMethods>(null);
  const [target, setTarget] = useState<WeightInputTarget | null>(null);

  // KST 자정이 지나거나 앱으로 돌아오면 다시 계산되는 오늘
  const today = useKoreanToday();
  const todayLog = logs.find((log) => log.day === today);

  const openInput = () => {
    const day = getKoreanDateString({ formatType: 'date' });
    setTarget({ day, initial: prefillWeight(logs, day), isToday: true });
    sheetRef.current?.expand();
  };

  return (
    <>
      <View className="flex-row items-center gap-4 py-2">
        <MaterialIcons name="monitor-weight" size={20} color={colors.green[600]} />
        <Pressable
          className="flex-1"
          onPress={() => router.push({ pathname: '/(tabs)/records', params: { view: 'weight' } })}>
          {todayLog ? (
            <Text className="text-neutral-800">
              오늘 <Text className="font-bold">{todayLog.weight_kg.toFixed(1)}kg</Text>
            </Text>
          ) : (
            <Text className="text-neutral-800">오늘 체중 기록</Text>
          )}
        </Pressable>
        <RippleButton
          rounded="full"
          outerClassName={todayLog ? 'border border-green-600 bg-white' : 'bg-green-600'}
          className="px-3 py-1.5"
          rippleColor={todayLog ? colors.green[100] : undefined}
          onPress={openInput}>
          <Text className={`text-sm font-bold ${todayLog ? 'text-green-600' : 'text-white'}`}>
            {todayLog ? '수정' : '기록하기'}
          </Text>
        </RippleButton>
      </View>

      <WeightInputSheet bottomSheetRef={sheetRef} target={target} />
    </>
  );
}
