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
import {
  BODY_COMP_RANGE,
  type BodyComp,
  type BodyCompKind,
  parseBodyCompInput,
  weightUpsertPayload,
} from 'utils/bodyComp';
import { requireOnline } from 'utils/network';
import { enablePushForChannel, showNotificationPermissionAlert } from 'utils/notifications';
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
  initialBodyComp: BodyComp; // 미리 채울 인바디 값 (그날 값만)
  isToday: boolean;
}

const BODY_COMP_FIELDS: { kind: BodyCompKind; label: string; placeholder: string }[] = [
  { kind: 'muscle', label: '골격근량', placeholder: '예: 27.1' },
  { kind: 'fat', label: '체지방량', placeholder: '예: 19.8' },
];

const EMPTY_BODY_COMP: Record<BodyCompKind, string> = { muscle: '', fat: '' };
const NO_BODY_COMP_ERROR: Record<BodyCompKind, boolean> = { muscle: false, fat: false };

const toText = (value: number | null) => (value != null ? value.toFixed(1) : '');

interface WeightInputSheetProps {
  bottomSheetRef: React.RefObject<Nullable<BottomSheetMethods>>;
  target: Nullable<WeightInputTarget>;
}

const formatDayLabel = (day: string) => {
  const [, m, d] = day.split('-').map(Number);
  return `${m}월 ${d}일`;
};

// 체중 입력 시트. 같은 날 다시 저장하면 그날 값을 바꾼다. 인바디(골격근량·체지방량)는 선택 입력이고
// 바꾼 칸만 저장한다 (체중만 고치면 그날 인바디 값은 그대로, 칸을 비우면 그 값만 지운다).
// 처음 기록한 직후(그 전에 기록이 없을 때) 한 번만 매일 아침 알림을 받을지 묻는다
export function WeightInputSheet({ bottomSheetRef, target }: WeightInputSheetProps) {
  const { logs, isLogsFetched, saveWeight, isSaving } = useWeights();
  const { setting, isFetched, isError, updateSetting } = useUserSetting();

  const [text, setText] = useState('');
  const [askReminder, setAskReminder] = useState(false);
  // 범위 안내는 저장을 눌렀거나 입력칸을 벗어났을 때만 보여준다 (입력 중 "6", "65."에는 띄우지 않는다)
  const [showError, setShowError] = useState(false);
  const [bodyText, setBodyText] = useState(EMPTY_BODY_COMP);
  const [bodyError, setBodyError] = useState(NO_BODY_COMP_ERROR);

  useEffect(() => {
    setText(toText(target?.initial ?? null));
    setShowError(false);
    setBodyText({
      muscle: toText(target?.initialBodyComp.muscle_kg ?? null),
      fat: toText(target?.initialBodyComp.fat_kg ?? null),
    });
    setBodyError(NO_BODY_COMP_ERROR);
  }, [target]);

  const invalid = showError && parseWeightInput(text) === null;
  const bodyInvalid = (kind: BodyCompKind) =>
    bodyError[kind] && parseBodyCompInput(bodyText[kind], kind) === 'invalid';

  const handleChangeBodyText = (kind: BodyCompKind, value: string) => {
    setBodyText((prev) => ({ ...prev, [kind]: value }));
    setBodyError((prev) => ({ ...prev, [kind]: false }));
  };

  const handleBodyBlur = (kind: BodyCompKind) => {
    if (parseBodyCompInput(bodyText[kind], kind) === 'invalid')
      setBodyError((prev) => ({ ...prev, [kind]: true }));
  };

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
    const muscle = parseBodyCompInput(bodyText.muscle, 'muscle');
    const fat = parseBodyCompInput(bodyText.fat, 'fat');
    if (weight === null || muscle === 'invalid' || fat === 'invalid') {
      setShowError(weight === null);
      setBodyError({ muscle: muscle === 'invalid', fat: fat === 'invalid' });
      return;
    }

    // 처음 기록인지는 저장 전 목록으로 본다 (저장하면 목록을 다시 받는다). 목록을 못 받았으면 모름
    const hadLogsBefore = isLogsFetched ? logs.length > 0 : undefined;
    const saved = await saveWeight(
      weightUpsertPayload({
        day: target.day,
        weight_kg: weight,
        initial: target.initialBodyComp,
        input: { muscle_kg: muscle, fat_kg: fat },
      })
    );
    if (!saved) return; // 실패 안내는 API가 했다

    Keyboard.dismiss();
    bottomSheetRef.current?.close();
    showSuccessToast({ textType: 'CUSTOM', title: `${weight.toFixed(1)}kg 기록했어요` });

    if (shouldAskWeightReminder({ isFetched, isError, setting, hadLogsBefore }))
      setAskReminder(true);
  });

  const answerReminder = async (on: boolean) => {
    setAskReminder(false);
    // 켜려면 알림 권한이 있어야 한다. 거부하면 꺼진 채로 저장하고(다시 묻지 않음) 설정에서 허용하도록 안내한다
    const denied = on && (await enablePushForChannel(CHANNELS.REPORT)) === 'denied';
    await updateSetting({ weight_reminder: on && !denied, weight_reminder_asked: true });
    if (denied) {
      showNotificationPermissionAlert();
    } else if (on) {
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

          {/* 인바디 (선택): 잰 날만 적는다. 비워 두면 저장하지 않는다 */}
          <View className="mb-3 flex-row items-center gap-2">
            <Text className="font-bold text-neutral-700">인바디</Text>
            <Text className="text-sm text-neutral-400">(선택)</Text>
            <View className="h-px flex-1 bg-neutral-200" />
          </View>
          <View className="mb-6 flex-row gap-3">
            {BODY_COMP_FIELDS.map(({ kind, label, placeholder }) => {
              const fieldInvalid = bodyInvalid(kind);
              const { min, max } = BODY_COMP_RANGE[kind];
              return (
                <View key={kind} className="flex-1">
                  <Text className="mb-1 text-sm text-neutral-500">{label}</Text>
                  <View
                    className={`flex-row items-center rounded-xl border bg-white px-3 ${
                      fieldInvalid ? 'border-red-400' : 'border-neutral-300'
                    }`}>
                    <BottomSheetTextInput
                      style={{ flex: 1, fontSize: 20, fontWeight: '700', paddingVertical: 10 }}
                      value={bodyText[kind]}
                      onChangeText={(value) => handleChangeBodyText(kind, value)}
                      onBlur={() => handleBodyBlur(kind)}
                      keyboardType="decimal-pad"
                      placeholder={placeholder}
                      placeholderTextColor={colors.neutral[300]}
                      maxLength={5}
                      returnKeyType="done"
                      onSubmitEditing={handleSave}
                    />
                    <Text className="font-bold text-neutral-500">kg</Text>
                  </View>
                  {fieldInvalid && (
                    <Text className="mt-1 text-sm text-red-500">{`${min}~${max}kg 사이로`}</Text>
                  )}
                </View>
              );
            })}
          </View>

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
