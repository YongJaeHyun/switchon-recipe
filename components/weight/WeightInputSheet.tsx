import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomSheetTextInput, BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import ConfirmModal from 'components/common/ConfirmModal';
import { CustomBottomSheet } from 'components/common/CustomBottomSheet';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { CHANNELS } from 'const/channels';
import { useUserSetting, useWeights } from 'hooks/useWeights';
import { useEffect, useState } from 'react';
import { Keyboard, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { Nullable } from 'types/common';
import { requireOnline } from 'utils/network';
import { registerForPushNotificationsAsync } from 'utils/notifications';
import { showSuccessToast } from 'utils/showToast';
import {
  MAX_WEIGHT_KG,
  MIN_WEIGHT_KG,
  parseWeightInput,
  shouldAskWeightReminder,
} from 'utils/weight';

export interface WeightInputTarget {
  day: string; // 저장할 KST 날짜 (yyyy-MM-dd)
  initial: number | null; // 미리 채울 값 (그날 값, 없으면 어제 값)
  isToday: boolean;
}

interface WeightInputSheetProps {
  bottomSheetRef: React.RefObject<Nullable<BottomSheetMethods>>;
  target: Nullable<WeightInputTarget>;
}

const formatDayLabel = (day: string) => {
  const [, m, d] = day.split('-').map(Number);
  return `${m}월 ${d}일`;
};

// 체중 입력 시트. 같은 날 다시 저장하면 그날 값을 바꾼다.
// 처음 저장한 직후 한 번만 매일 아침 알림을 받을지 묻는다
export function WeightInputSheet({ bottomSheetRef, target }: WeightInputSheetProps) {
  const { saveWeight, isSaving } = useWeights();
  const { setting, isFetched, isError, updateSetting } = useUserSetting();

  const [text, setText] = useState('');
  const [askReminder, setAskReminder] = useState(false);
  // 범위 안내는 저장을 눌렀거나 입력칸을 벗어났을 때만 보여준다 (입력 중 "6", "65."에는 띄우지 않는다)
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    setText(target?.initial != null ? target.initial.toFixed(1) : '');
    setShowError(false);
  }, [target]);

  const invalid = showError && parseWeightInput(text) === null;

  const handleChangeText = (value: string) => {
    setText(value);
    setShowError(false);
  };

  const handleBlur = () => {
    if (text.trim() !== '' && parseWeightInput(text) === null) setShowError(true);
  };

  const handleSave = requireOnline(async () => {
    if (!target || isSaving) return;
    const weight = parseWeightInput(text);
    if (weight === null) {
      setShowError(true);
      return;
    }

    const saved = await saveWeight({ day: target.day, weight_kg: weight });
    if (!saved) return; // 실패 안내는 API가 했다

    Keyboard.dismiss();
    bottomSheetRef.current?.close();
    showSuccessToast({ textType: 'CUSTOM', title: `${weight.toFixed(1)}kg 기록했어요` });

    if (shouldAskWeightReminder({ isFetched, isError, setting })) setAskReminder(true);
  });

  const answerReminder = async (on: boolean) => {
    setAskReminder(false);
    // 체중·리포트 알림 채널 등록 (권한 요청 포함). 저장 결과와 상관없이, 화면을 막지 않는다
    if (on) registerForPushNotificationsAsync(CHANNELS.REPORT).catch(() => {});
    await updateSetting({ weight_reminder: on, weight_reminder_asked: true });
    if (on) {
      showSuccessToast({ textType: 'CUSTOM', title: '매일 아침 9시에 알려드릴게요' });
    }
  };

  return (
    <>
      <CustomBottomSheet ref={bottomSheetRef}>
        <BottomSheetView className="px-5">
          <Text className="mb-1 text-2xl font-bold">체중 기록</Text>
          <Text className="mb-6 text-neutral-500">
            {target
              ? `${target.isToday ? '오늘 ' : ''}${formatDayLabel(target.day)} 체중을 적어 주세요`
              : ''}
          </Text>

          <View
            className={`mb-2 flex-row items-center rounded-xl border bg-white px-4 ${
              invalid ? 'border-red-400' : 'border-neutral-300'
            }`}>
            <BottomSheetTextInput
              style={{ flex: 1, fontSize: 28, fontWeight: '700', paddingVertical: 12 }}
              value={text}
              onChangeText={handleChangeText}
              onBlur={handleBlur}
              keyboardType="decimal-pad"
              placeholder="예: 65.5"
              placeholderTextColor={colors.neutral[300]}
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            <Text className="text-xl font-bold text-neutral-500">kg</Text>
          </View>
          <Text className={`mb-6 text-sm ${invalid ? 'text-red-500' : 'text-neutral-400'}`}>
            {invalid
              ? `${MIN_WEIGHT_KG}~${MAX_WEIGHT_KG}kg 사이로 입력해 주세요`
              : '소수점 한 자리까지 기록돼요'}
          </Text>

          <RippleButton
            outerClassName={`mb-10 ${isSaving || !text.trim() ? 'opacity-50' : ''}`}
            className="w-full bg-green-600 py-4"
            disabled={isSaving || !text.trim()}
            onPress={handleSave}>
            <Text className="text-lg font-semibold text-white">
              {isSaving ? '저장하는 중...' : '저장하기'}
            </Text>
          </RippleButton>
        </BottomSheetView>
      </CustomBottomSheet>

      <ConfirmModal
        type="create"
        iconElement={
          <MaterialIcons name="notifications-active" size={36} color={colors.green[600]} />
        }
        visible={askReminder}
        title="매일 아침 기록 알림 받을래요?"
        message="아침 9시까지 체중을 기록하지 않으면 알려드릴게요"
        onConfirm={() => answerReminder(true)}
        onCancel={() => answerReminder(false)}
      />
    </>
  );
}
