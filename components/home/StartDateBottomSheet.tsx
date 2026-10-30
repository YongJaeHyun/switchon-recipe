import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { CustomBottomSheet } from 'components/common/CustomBottomSheet';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { WeekDayPicker } from 'components/program/WeekDayPicker';
import { useChangeStartDate } from 'hooks/useChangeStartDate';
import useKoreanToday from 'hooks/useKoreanToday';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import {
  adjustTarget,
  startDateChange,
  MAINTENANCE_WEEK,
  programWeekAndDay,
  restartStartDate,
  weekDaySelection,
} from 'utils/programStart';
import { Nullable } from '../../types/common';

interface StartDateBottomSheetProps {
  bottomSheetRef: React.RefObject<Nullable<BottomSheetMethods>>;
}

type RestartWhen = 'today' | 'tomorrow';

const monthDay = (date: string) => {
  const [, m, d] = date.slice(0, 10).split('-').map(Number);
  return `${m}월 ${d}일`;
};

const WHEN_LABEL: Record<RestartWhen, string> = { tomorrow: '내일', today: '오늘' };

const weekDayLabel = ({ week, day }: { week: number; day: number }) =>
  week >= MAINTENANCE_WEEK ? '유지기' : `${week}주차 ${day}일`;

const statusLine = (startDate: string | null | undefined, today: string) => {
  if (!startDate) return '시작일이 아직 없어요';
  const { week, day, beforeStart } = programWeekAndDay(startDate, today);
  if (beforeStart) return `${monthDay(startDate)}에 1주차가 시작돼요`;
  return `${monthDay(startDate)}에 시작해서 지금 ${weekDayLabel({ week, day })}${week >= MAINTENANCE_WEEK ? '예요' : '이에요'}`;
};

// 프로그램 설정: 시작일은 사용자가 고르지 않고 두 가지 동작으로만 바꾼다 (오늘 탭 ⚙, 내 정보 '시작일').
// 1) 처음부터 다시 시작 — 내일(추천)/오늘이 1주차 1일. 되돌릴 수 없으니 시트 안에서 한 번 확인한다
// 2) 주차 맞추기 — 지금 몇 주차 며칠인지 고르면 시작일을 계산한다 (오늘·과거만)
export function StartDateBottomSheet({ bottomSheetRef }: StartDateBottomSheetProps) {
  const today = useKoreanToday();
  const startDate = useUserStore((state) => state.start_date);
  const programStart = useUserStore((state) => state.program_start);
  const { changeStartDate } = useChangeStartDate();

  const [confirming, setConfirming] = useState<RestartWhen | null>(null);
  const [selection, setSelection] = useState(() => weekDaySelection(startDate, today));
  const [saving, setSaving] = useState(false);

  // 오늘 탭과 내 정보 탭에 시트가 하나씩 있어서, 다른 쪽에서 바꾼 시작일·날짜 변경을 따라간다
  useEffect(() => {
    setSelection(weekDaySelection(startDate, today));
  }, [startDate, today]);

  const resetDraft = () => {
    setConfirming(null);
    setSelection(weekDaySelection(startDate, today));
  };

  // 지금과 같으면 null (이미 유지기인 사람이 유지기를 골라도 같음) → 저장 버튼을 끈다
  const adjustedStart = adjustTarget(startDate, today, selection);

  const save = async (
    newStart: string,
    kind: 'restart' | 'align',
    toast: { title: string; subtitle: string }
  ) => {
    if (saving) return;
    setSaving(true);
    const ok = await changeStartDate(newStart, { kind, toast });
    setSaving(false);
    if (ok) bottomSheetRef.current?.close();
  };

  const restart = (when: RestartWhen) => {
    const newStart = restartStartDate(today, when);
    void save(newStart, 'restart', {
      title: `${WHEN_LABEL[when]}부터 1주차를 시작해요`,
      subtitle: `시작일을 ${monthDay(newStart)}로 정했어요`,
    });
  };

  const adjust = () => {
    if (!adjustedStart) return;
    void save(adjustedStart, 'align', {
      title: `${weekDayLabel(selection)}로 맞췄어요`,
      subtitle: `시작일을 ${monthDay(adjustedStart)}로 옮겼어요`,
    });
  };

  return (
    <CustomBottomSheet ref={bottomSheetRef} onClose={resetDraft}>
      <BottomSheetView className="px-5 pb-8">
        {confirming ? (
          <RestartConfirm
            when={confirming}
            newStart={restartStartDate(today, confirming)}
            alreadyStarts={
              startDateChange({
                kind: 'restart',
                startDate,
                programStart,
                newStart: restartStartDate(today, confirming),
              }) === null
            }
            saving={saving}
            onConfirm={() => restart(confirming)}
            onCancel={() => setConfirming(null)}
          />
        ) : (
          <View>
            <Text className="text-2xl font-bold">프로그램 설정</Text>
            <Text className="mt-1 text-neutral-500">{statusLine(startDate, today)}</Text>

            <View className="mt-7">
              <Text className="text-lg font-bold text-neutral-800">처음부터 다시 시작하기</Text>
              <Text className="mt-0.5 text-neutral-500">1주차 1일부터 새로 해요</Text>
              <View className="mt-3 flex-row gap-2">
                <RippleButton
                  outerClassName="flex-1"
                  className="w-full flex-row gap-1.5 bg-green-600 py-3.5"
                  disabled={saving}
                  onPress={() => setConfirming('tomorrow')}>
                  <Text className="text-base font-semibold text-white">내일부터</Text>
                  <View className="rounded-full bg-white px-2 py-0.5">
                    <Text className="text-xs font-bold text-green-700">추천</Text>
                  </View>
                </RippleButton>
                <RippleButton
                  outerClassName="flex-1"
                  className="w-full rounded-xl border border-green-600 bg-white py-3.5"
                  rippleColor={colors.green[100]}
                  disabled={saving}
                  onPress={() => setConfirming('today')}>
                  <Text className="text-base font-semibold text-green-600">오늘부터</Text>
                </RippleButton>
              </View>
            </View>

            <View className="my-6 h-px bg-neutral-200" />

            <View>
              <Text className="text-lg font-bold text-neutral-800">주차가 실제와 달라요</Text>
              <Text className="mb-3 mt-0.5 text-neutral-500">지금 몇 주차 며칠인가요?</Text>
              <WeekDayPicker
                week={selection.week}
                day={selection.day}
                onChange={setSelection}
                disabled={saving}
              />
              <Text className="mt-4 text-center text-neutral-500">
                {adjustedStart
                  ? `시작일이 ${monthDay(adjustedStart)}로 바뀌어요`
                  : selection.week >= MAINTENANCE_WEEK
                    ? '지금 유지기예요'
                    : '지금 시작일과 같아요'}
              </Text>
              <RippleButton
                outerClassName="mt-2"
                className={`w-full py-4 ${!adjustedStart ? 'bg-neutral-200' : 'bg-green-600'}`}
                disabled={!adjustedStart || saving}
                onPress={adjust}>
                <Text
                  className={`text-lg font-semibold ${!adjustedStart ? 'text-neutral-400' : 'text-white'}`}>
                  {weekDayLabel(selection)}로 맞추기
                </Text>
              </RippleButton>
            </View>
          </View>
        )}
      </BottomSheetView>
    </CustomBottomSheet>
  );
}

interface RestartConfirmProps {
  when: RestartWhen;
  newStart: string;
  alreadyStarts: boolean; // 이미 그날 1주차 1일로 잡혀 있으면 바꿀 것이 없다 (통계도 지우지 않는다)
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// 다시 시작 확인: 무엇이 남고 무엇이 지워지는지 사실대로
// (체중·인바디는 날짜 기준, 주간 리포트는 날짜 범위 기준이라 남고, 할 일 완료율은 주차·일차 키라 지운다)
function RestartConfirm({
  when,
  newStart,
  alreadyStarts,
  saving,
  onConfirm,
  onCancel,
}: RestartConfirmProps) {
  if (alreadyStarts) {
    return (
      <View>
        <Text className="text-2xl font-bold">이미 {WHEN_LABEL[when]}이 1주차 1일이에요</Text>
        <Text className="mt-1 text-neutral-500">
          시작일이 {monthDay(newStart)}로 잡혀 있어서 바꿀 것이 없어요
        </Text>
        <RippleButton outerClassName="mt-6" className="w-full bg-green-600 py-4" onPress={onCancel}>
          <Text className="text-lg font-semibold text-white">돌아가기</Text>
        </RippleButton>
      </View>
    );
  }

  return (
    <View>
      <Text className="text-2xl font-bold">{WHEN_LABEL[when]}부터 다시 시작할까요?</Text>
      <Text className="mt-1 text-neutral-500">
        {monthDay(newStart)}({WHEN_LABEL[when]})이 1주차 1일이 돼요
      </Text>

      <View className="mt-6 gap-3 rounded-2xl bg-neutral-100 p-4">
        <View className="flex-row items-center gap-3">
          <MaterialIcons name="check-circle" size={22} color={colors.green[600]} />
          <Text className="flex-1 text-neutral-700">
            체중·인바디 기록과 주간 리포트는 그대로 남아요
          </Text>
        </View>
        <View className="flex-row items-center gap-3">
          <MaterialIcons name="restart-alt" size={22} color={colors.neutral[500]} />
          <Text className="flex-1 text-neutral-700">
            지금까지의 할 일 완료율은 지워지고 새로 쌓여요
          </Text>
        </View>
      </View>

      <RippleButton
        outerClassName="mt-6"
        className={`w-full py-4 ${saving ? 'bg-green-400' : 'bg-green-600'}`}
        disabled={saving}
        onPress={onConfirm}>
        <Text className="text-lg font-semibold text-white">
          {saving ? '바꾸는 중…' : `${WHEN_LABEL[when]}부터 다시 시작`}
        </Text>
      </RippleButton>
      <Pressable
        className="mt-2 items-center py-3"
        disabled={saving}
        accessibilityRole="button"
        onPress={onCancel}>
        <Text className="text-base font-semibold text-neutral-500">취소</Text>
      </Pressable>
    </View>
  );
}
