import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import ConfirmModal from 'components/common/ConfirmModal';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { WeightChart } from 'components/weight/WeightChart';
import { WeightInputSheet, type WeightInputTarget } from 'components/weight/WeightInputSheet';
import { useWeights } from 'hooks/useWeights';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import type { WeightLogDB } from 'types/database';
import { formatBodyComp, prefillBodyComp } from 'utils/bodyComp';
import { getKoreanDateString } from 'utils/date';
import { getWeekColorHex } from 'utils/getWeekColor';
import { requireOnline } from 'utils/network';
import {
  chartPoints,
  formatWeightDiff,
  prefillWeight,
  weekOfDay,
  weightChange,
  weightsInPeriod,
} from 'utils/weight';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const formatDay = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 (${weekday})`;
};

const WeekBadge = ({ day, startDate }: { day: string; startDate: string | null }) => {
  if (!startDate) return null;
  const week = weekOfDay(day, startDate);
  if (week < 1) {
    return <Text className="text-xs text-neutral-400">시작 전</Text>;
  }
  return (
    <Text className="text-xs font-bold" style={{ color: getWeekColorHex(week) }}>
      {week}주차
    </Text>
  );
};

const LogRow = ({
  log,
  startDate,
  onEdit,
  onDelete,
}: {
  log: WeightLogDB;
  startDate: string | null;
  onEdit(): void;
  onDelete(): void;
}) => {
  const bodyComp = formatBodyComp(log);
  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <View className="flex-1 gap-0.5">
        <Text className="font-bold text-neutral-800">{formatDay(log.day)}</Text>
        <WeekBadge day={log.day} startDate={startDate} />
      </View>
      {/* 인바디 값이 있으면 체중 아래 작은 글씨 */}
      <View className="items-end">
        <Text className="text-lg font-bold text-neutral-800">{log.weight_kg.toFixed(1)}kg</Text>
        {bodyComp && <Text className="text-xs text-neutral-500">{bodyComp}</Text>}
      </View>
      <TouchableOpacity onPress={onEdit} hitSlop={8}>
        <MaterialIcons name="edit" size={20} color={colors.neutral[500]} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} hitSlop={8}>
        <MaterialIcons name="delete-outline" size={22} color={colors.neutral[500]} />
      </TouchableOpacity>
    </View>
  );
};

// 기록 탭 > 체중 칸: 그래프·오늘 기록 버튼·날짜별 기록 목록
export function WeightSection() {
  const startDate = useUserStore((state) => state.start_date) || null;
  const { logs, isLoading, deleteWeight, isDeleting } = useWeights();
  const sheetRef = useRef<BottomSheetMethods>(null);

  const [allPeriod, setAllPeriod] = useState(false);
  const [target, setTarget] = useState<WeightInputTarget | null>(null);
  const [deleting, setDeleting] = useState<WeightLogDB | null>(null);

  const opts = useMemo(() => ({ allPeriod }), [allPeriod]);
  const points = useMemo(() => chartPoints(logs, startDate, opts), [logs, startDate, opts]);
  const change = useMemo(() => weightChange(logs, startDate, opts), [logs, startDate, opts]);
  const listed = useMemo(
    () => weightsInPeriod(logs, startDate, opts).reverse(),
    [logs, startDate, opts]
  );
  const hasEarlier = useMemo(
    () => !!startDate && logs.some((log) => log.day < startDate.slice(0, 10)),
    [logs, startDate]
  );

  const openInput = (day: string) => {
    const today = getKoreanDateString({ formatType: 'date' });
    setTarget({
      day,
      initial: prefillWeight(logs, day),
      initialBodyComp: prefillBodyComp(logs, day),
      isToday: day === today,
    });
    sheetRef.current?.expand();
  };

  const confirmDelete = requireOnline(async () => {
    if (!deleting) return;
    // 실패하면 API가 오류 토스트를 띄우고, 다시 시도할 수 있게 모달을 열어 둔다
    const deleted = await deleteWeight(deleting.day);
    if (deleted) setDeleting(null);
  });

  return (
    <>
      <ScrollView
        contentContainerClassName="gap-6 px-5 pb-10 pt-2"
        showsVerticalScrollIndicator={false}>
        <View className="gap-3 rounded-xl border border-neutral-200 bg-white p-4">
          <View className="flex-row items-end justify-between">
            <View className="gap-0.5">
              <Text className="text-sm text-neutral-500">
                {allPeriod ? '전체 기간 변화' : '시작일부터 변화'}
              </Text>
              {change ? (
                <Text
                  className={`text-2xl font-bold ${
                    change.diff < 0
                      ? 'text-green-600'
                      : change.diff > 0
                        ? 'text-neutral-800'
                        : 'text-neutral-500'
                  }`}>
                  {formatWeightDiff(change.diff)}
                </Text>
              ) : (
                <Text className="text-2xl font-bold text-neutral-300">-</Text>
              )}
            </View>
            {change && (
              <Text className="text-sm text-neutral-500">
                {change.first.toFixed(1)}kg → {change.last.toFixed(1)}kg
              </Text>
            )}
          </View>

          {isLoading ? (
            <ActivityIndicator color={colors.green[600]} />
          ) : points.length > 0 ? (
            <WeightChart points={points} height={200} />
          ) : (
            <Text className="py-8 text-center text-neutral-400">
              {allPeriod ? '아직 체중 기록이 없어요' : '시작일 이후 체중 기록이 없어요'}
            </Text>
          )}

          {(hasEarlier || allPeriod) && (
            <TouchableOpacity
              className="self-center rounded-lg border border-neutral-300 px-3 py-2"
              onPress={() => setAllPeriod((prev) => !prev)}>
              <Text className="text-sm text-neutral-600">
                {allPeriod ? '시작일부터 보기' : '전체 기간 보기'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <RippleButton
          className="w-full flex-row gap-2 bg-green-600 py-4"
          onPress={() => openInput(getKoreanDateString({ formatType: 'date' }))}>
          <MaterialIcons name="add" size={22} color={colors.white} />
          <Text className="text-lg font-semibold text-white">오늘 체중 기록하기</Text>
        </RippleButton>

        <View className="gap-3">
          <Text className="text-lg font-bold text-neutral-800">기록</Text>
          {listed.length > 0
            ? listed.map((log) => (
                <LogRow
                  key={log.day}
                  log={log}
                  startDate={startDate}
                  onEdit={() => openInput(log.day)}
                  onDelete={() => setDeleting(log)}
                />
              ))
            : !isLoading && (
                <Text className="py-4 text-center text-neutral-400">아직 기록이 없어요</Text>
              )}
        </View>
      </ScrollView>

      <WeightInputSheet bottomSheetRef={sheetRef} target={target} />

      <ConfirmModal
        type="delete"
        iconElement={<MaterialIcons name="delete-outline" size={36} color={colors.red[600]} />}
        visible={!!deleting}
        title="기록을 지울까요?"
        message={deleting ? `${formatDay(deleting.day)} ${deleting.weight_kg.toFixed(1)}kg` : ''}
        disabled={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
