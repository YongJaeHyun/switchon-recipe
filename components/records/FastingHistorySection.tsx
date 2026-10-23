import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import type { FastingResult } from 'api/FastingResultAPI';
import { CustomBottomSheet } from 'components/common/CustomBottomSheet';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { useFastingHistory } from 'hooks/useFastingHistory';
import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import colors from 'tailwindcss/colors';
import type { FastingHistoryItem } from 'utils/fastingHistory';
import { getWeekColorHex } from 'utils/getWeekColor';
import { requireOnline } from 'utils/network';
import { showSuccessToast } from 'utils/showToast';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const formatDay = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 (${weekday})`;
};

const RESULT_LABEL: Record<FastingResult, string> = {
  success: '성공',
  broken: '중간에 먹음',
};

const HistoryRow = ({ item, onPress }: { item: FastingHistoryItem; onPress(): void }) => (
  <TouchableOpacity
    className="flex-row items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3"
    onPress={onPress}>
    <Text className="flex-1 text-neutral-800">
      <Text className="font-bold">{formatDay(item.day)}</Text>
      <Text className="text-neutral-400"> · </Text>
      <Text className="font-bold" style={{ color: getWeekColorHex(item.weekIndex) }}>
        {item.weekIndex}주차
      </Text>
    </Text>
    <Text
      className={`font-bold ${
        item.result === 'success'
          ? 'text-green-600'
          : item.result === 'broken'
            ? 'text-neutral-700'
            : 'text-neutral-400'
      }`}>
      {item.result ? RESULT_LABEL[item.result] : '기록 안 함'}
    </Text>
  </TouchableOpacity>
);

// 기록 탭 > 단식 칸: 지난 단식(현재 시작일 이후) 최근순 목록. 줄을 누르면 결과를 고친다 (기간 제한 없음)
export function FastingHistorySection() {
  const { items, isLoading, isError, saveResult, isSaving } = useFastingHistory();
  const sheetRef = useRef<BottomSheetMethods>(null);
  const [target, setTarget] = useState<FastingHistoryItem | null>(null);

  const open = (item: FastingHistoryItem) => {
    setTarget(item);
    sheetRef.current?.expand();
  };

  const save = requireOnline(async (result: FastingResult) => {
    if (!target || isSaving) return;
    const saved = await saveResult({ day: target.day, result });
    if (!saved) return; // 실패 안내는 API가 했다
    sheetRef.current?.close();
    showSuccessToast({
      textType: 'CUSTOM',
      title: result === 'success' ? '단식 성공으로 기록했어요' : '중간에 먹었다고 기록했어요',
    });
  });

  return (
    <>
      <ScrollView
        contentContainerClassName="gap-3 px-5 pb-10 pt-2"
        showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator className="py-8" color={colors.green[600]} />
        ) : items.length > 0 ? (
          <>
            {items.map((item) => (
              <HistoryRow key={item.day} item={item} onPress={() => open(item)} />
            ))}
            <Text className="pt-2 text-center text-sm text-neutral-400">
              단식 기록은 6.0.0 업데이트 이후부터 남아요
            </Text>
          </>
        ) : isError ? (
          <Text className="py-8 text-center text-neutral-400">
            단식 기록을 불러오지 못했어요. 잠시 후 다시 열어 주세요.
          </Text>
        ) : (
          <View className="items-center gap-1 py-8">
            <Text className="font-bold text-neutral-500">아직 단식 기록이 없어요</Text>
            <Text className="text-center text-sm text-neutral-400">
              2주차부터 오늘 탭에서 단식 요일을 정하면 여기에 기록이 쌓여요
            </Text>
          </View>
        )}
      </ScrollView>

      <CustomBottomSheet ref={sheetRef}>
        <BottomSheetView className="px-5">
          <Text className="mb-1 text-lg font-bold">단식 결과</Text>
          <Text className="mb-6 text-neutral-500">
            {target ? `${formatDay(target.day)} 단식은 어땠나요?` : ''}
          </Text>
          <View className={`mb-10 gap-3 ${isSaving ? 'opacity-50' : ''}`}>
            <RippleButton
              className="w-full bg-green-600 py-4"
              disabled={isSaving}
              onPress={() => save('success')}>
              <Text className="text-lg font-semibold text-white">성공했어요</Text>
            </RippleButton>
            <RippleButton
              className="w-full border border-neutral-300 bg-white py-4"
              disabled={isSaving}
              onPress={() => save('broken')}>
              <Text className="text-lg font-semibold text-neutral-600">중간에 먹었어요</Text>
            </RippleButton>
          </View>
        </BottomSheetView>
      </CustomBottomSheet>
    </>
  );
}
