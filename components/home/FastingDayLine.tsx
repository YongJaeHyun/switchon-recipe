import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { Text } from 'components/common/Text';
import type { FastingTime } from 'const/fastingDays';
import { useRef } from 'react';
import { Pressable } from 'react-native';
import { fastingDayText } from 'utils/todayRows';
import { FastingDayBottomSheet } from './FastingDayBottomSheet';

// 오늘 할 일 카드 아래 작은 글씨: 이번 주 단식 요일 (단식이 있는 주차에서만). 누르면 단식 요일 설정 시트
export function FastingDayLine({
  state,
  week,
  days,
  startTime,
}: {
  state: 'set' | 'unset';
  week: number;
  days: number[];
  startTime: FastingTime | null | undefined;
}) {
  const sheetRef = useRef<BottomSheetMethods>(null);

  return (
    <>
      <Pressable hitSlop={8} className="px-1" onPress={() => sheetRef.current?.expand()}>
        {state === 'set' ? (
          <Text className="text-sm text-neutral-500">
            단식 요일: {fastingDayText(days, startTime)} ·{' '}
            <Text className="text-sm font-bold text-green-600">바꾸기</Text>
          </Text>
        ) : (
          <Text className="text-sm text-neutral-500">
            이번 주 단식 요일을 정해주세요 ·{' '}
            <Text className="text-sm font-bold text-green-600">설정하기</Text>
          </Text>
        )}
      </Pressable>
      <FastingDayBottomSheet bottomSheetRef={sheetRef} week={week} />
    </>
  );
}
