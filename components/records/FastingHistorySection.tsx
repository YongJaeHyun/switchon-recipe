import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import type { FastingResult } from 'api/FastingResultAPI';
import { CustomBottomSheet } from 'components/common/CustomBottomSheet';
import { FastedHoursPicker } from 'components/home/FastedHoursPicker';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { useFastingHistory } from 'hooks/useFastingHistory';
import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { fastingHistoryLabel, fastingResultLabel } from 'utils/fastingEarlyEnd';
import { getKoreanDateString } from 'utils/date';
import { formatHistoryDay, type FastingHistoryItem } from 'utils/fastingHistory';
import { getWeekColorHex } from 'utils/getWeekColor';
import { requireOnline } from 'utils/network';
import { formatProgramStart } from 'utils/reportDisplay';
import { showSuccessToast } from 'utils/showToast';

// 진행 중인 단식은 결과를 고를 수 없다 (오늘 탭과 같게: 끝난 뒤, 또는 오늘 탭에서 일찍 끝내기)
const HistoryRow = ({
  item,
  today,
  onPress,
}: {
  item: FastingHistoryItem;
  today: string;
  onPress(): void;
}) => (
  <TouchableOpacity
    className="flex-row items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3"
    disabled={item.inProgress}
    onPress={onPress}>
    <Text className="flex-1 text-neutral-800">
      <Text className="font-bold">{formatHistoryDay(item.day, today)}</Text>
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
      {item.inProgress && item.result === null
        ? '단식 중'
        : fastingHistoryLabel(item.result, item.fastedMinutes)}
    </Text>
  </TouchableOpacity>
);

// 지난 회차 줄: 회색, 보기만 (결과를 고치지 않는다)
const PastRow = ({ item, today }: { item: FastingHistoryItem; today: string }) => (
  <View className="flex-row items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
    <Text className="flex-1 text-neutral-500">
      <Text className="font-bold text-neutral-500">{formatHistoryDay(item.day, today)}</Text>
      <Text className="text-neutral-300"> · </Text>
      <Text className="text-neutral-400">{item.weekIndex}주차</Text>
    </Text>
    <Text className={`font-bold ${item.result ? 'text-neutral-500' : 'text-neutral-400'}`}>
      {fastingHistoryLabel(item.result, item.fastedMinutes)}
    </Text>
  </View>
);

// 지난 회차 하나: 머리줄을 누르면 접고 편다
const PastGroup = ({
  startDate,
  items,
  today,
  open,
  onToggle,
}: {
  startDate: string;
  items: FastingHistoryItem[];
  today: string;
  open: boolean;
  onToggle(): void;
}) => (
  <View className="gap-2">
    <TouchableOpacity
      className="flex-row items-center justify-between py-1"
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onToggle}>
      <Text className="font-bold text-neutral-600">
        이전 회차 · {formatProgramStart(startDate)}
      </Text>
      <MaterialIcons
        name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
        size={22}
        color={colors.neutral[400]}
      />
    </TouchableOpacity>
    {open && items.map((item) => <PastRow key={item.day} item={item} today={today} />)}
  </View>
);

// 기록 탭 > 단식 칸: 지금 회차 단식 최근순 목록. 줄을 누르면 결과를 고친다 (기간 제한 없음, 진행 중인 단식은 빼고).
// 아래 '이전 회차 보기'(기본 접힘)를 펴면 지난 회차별 기록을 본다 (가장 최근 회차만 펼친 채, 보기만)
export function FastingHistorySection() {
  const { items, previous, isLoading, isError, saveResult, isSaving } = useFastingHistory();
  const sheetRef = useRef<BottomSheetMethods>(null);
  const [target, setTarget] = useState<FastingHistoryItem | null>(null);
  const [isPickingHours, setPickingHours] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const today = getKoreanDateString({ formatType: 'date' });
  const hasAny = items.length > 0 || previous.length > 0;

  const open = (item: FastingHistoryItem) => {
    if (item.inProgress) return;
    setTarget(item);
    setPickingHours(false);
    sheetRef.current?.expand();
  };

  // 일찍 끝냈어요는 단식한 분(fastedMinutes)과 함께 저장한다
  const save = requireOnline(async (result: FastingResult, fastedMinutes?: number) => {
    if (!target || isSaving) return;
    const saved = await saveResult({ day: target.day, result, fastedMinutes });
    if (!saved) return; // 실패 안내는 API가 했다
    sheetRef.current?.close();
    setPickingHours(false);
    showSuccessToast({
      textType: 'CUSTOM',
      title:
        result === 'success'
          ? '단식 성공으로 기록했어요'
          : fastingResultLabel(result, fastedMinutes ?? null),
    });
  });

  return (
    <>
      <ScrollView
        contentContainerClassName="gap-3 px-5 pb-10 pt-2"
        showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator className="py-8" color={colors.green[600]} />
        ) : isError && !hasAny ? (
          <Text className="py-8 text-center text-neutral-400">
            단식 기록을 불러오지 못했어요. 잠시 후 다시 열어 주세요.
          </Text>
        ) : (
          <>
            {items.length > 0 ? (
              items.map((item) => (
                <HistoryRow key={item.day} item={item} today={today} onPress={() => open(item)} />
              ))
            ) : (
              <View className="items-center gap-1 py-8">
                <Text className="font-bold text-neutral-500">아직 단식 기록이 없어요</Text>
                <Text className="text-center text-sm text-neutral-400">
                  2주차부터 오늘 탭에서 단식 요일을 정하면 여기에 기록이 쌓여요
                </Text>
              </View>
            )}

            {previous.length > 0 && (
              <TouchableOpacity
                className="flex-row items-center gap-1 self-center rounded-lg border border-neutral-300 py-2 pl-3 pr-2"
                accessibilityRole="button"
                accessibilityState={{ expanded: showPast }}
                onPress={() => setShowPast((prev) => !prev)}>
                <Text className="text-sm text-neutral-600">
                  {showPast ? '이전 회차 접기' : '이전 회차 보기'}
                </Text>
                <MaterialIcons
                  name={showPast ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={18}
                  color={colors.neutral[500]}
                />
              </TouchableOpacity>
            )}

            {showPast &&
              previous.map((group, i) => (
                <PastGroup
                  key={group.startDate}
                  startDate={group.startDate}
                  items={group.items}
                  today={today}
                  open={openGroups[group.startDate] ?? i === 0}
                  onToggle={() =>
                    setOpenGroups((prev) => ({
                      ...prev,
                      [group.startDate]: !(prev[group.startDate] ?? i === 0),
                    }))
                  }
                />
              ))}

            {hasAny && (
              <Text className="pt-2 text-center text-sm text-neutral-400">
                단식 기록은 6.0.0 업데이트 이후부터 남아요
              </Text>
            )}
          </>
        )}
      </ScrollView>

      <CustomBottomSheet ref={sheetRef}>
        <BottomSheetView className="px-5">
          <Text className="mb-1 text-lg font-bold">단식 결과</Text>
          <Text className="mb-6 text-neutral-500">
            {target ? `${formatHistoryDay(target.day, today)} 단식은 어땠나요?` : ''}
          </Text>
          <View className={`mb-10 gap-3 ${isSaving ? 'opacity-50' : ''}`}>
            <RippleButton
              className="w-full bg-green-600 py-4"
              disabled={isSaving}
              onPress={() => save('success')}>
              <Text className="text-lg font-semibold text-white">성공했어요</Text>
            </RippleButton>
            <RippleButton
              className={`w-full border bg-white py-4 ${isPickingHours ? 'border-green-600' : 'border-neutral-300'}`}
              disabled={isSaving}
              onPress={() => setPickingHours((v) => !v)}>
              <Text className="text-lg font-semibold text-neutral-600">일찍 끝냈어요</Text>
            </RippleButton>
            {isPickingHours && target && (
              <FastedHoursPicker
                key={target.day}
                initialMinutes={target.fastedMinutes}
                disabled={isSaving}
                onSave={(minutes) => save('broken', minutes)}
              />
            )}
          </View>
        </BottomSheetView>
      </CustomBottomSheet>
    </>
  );
}
