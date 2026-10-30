import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomSheetTextInput, BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { InbodyAPI } from 'api/InbodyAPI';
import ConfirmModal from 'components/common/ConfirmModal';
import { CustomBottomSheet } from 'components/common/CustomBottomSheet';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { CHANNELS } from 'const/channels';
import { useUserSetting, useWeights } from 'hooks/useWeights';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, TouchableOpacity, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { Nullable } from 'types/common';
import {
  BODY_COMP_RANGE,
  type BodyComp,
  type BodyCompKind,
  parseBodyCompInput,
  prefillBodyComp,
  weightUpsertPayload,
} from 'utils/bodyComp';
import { getKoreanDateString } from 'utils/date';
import {
  IMAGE_TOO_LARGE_MESSAGE,
  isImageBase64TooLarge,
  resolveImageMimeType,
} from 'utils/foodCheckInput';
import { formatMonthDay, INBODY_NOT_FOUND_MESSAGE, inbodyFill } from 'utils/inbodyRead';
import { requireOnline } from 'utils/network';
import { enablePushForChannel, showNotificationPermissionAlert } from 'utils/notifications';
import { showErrorToast, showInfoToast, showSuccessToast } from 'utils/showToast';
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

type PhotoSource = 'camera' | 'library';

// 편의점 판정(app/foodCheck)과 같은 피커 설정: 크기 줄이기는 네이티브 모듈이 필요해 품질만 낮춘다
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.6,
  base64: true,
  allowsEditing: false,
  exif: false,
};

// 사진을 골라 base64로. 권한 거부·취소·읽기 실패면 안내 후 null
const pickPhoto = async (source: PhotoSource) => {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    showInfoToast({
      textType: 'CUSTOM',
      title: source === 'camera' ? '카메라 권한이 필요해요' : '사진 접근 권한이 필요해요',
      subtitle: '설정에서 권한을 허용해 주세요',
    });
    return null;
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
      : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset?.base64) {
    showErrorToast({
      textType: 'CUSTOM',
      title: '사진을 읽지 못했어요',
      subtitle: '다시 시도해 주세요',
    });
    return null;
  }
  if (isImageBase64TooLarge(asset.base64)) {
    showInfoToast({ textType: 'CUSTOM', title: IMAGE_TOO_LARGE_MESSAGE });
    return null;
  }
  const mimeType = resolveImageMimeType(asset.mimeType);
  if (!mimeType) {
    showInfoToast({ textType: 'CUSTOM', title: 'JPEG 또는 PNG 사진만 읽을 수 있어요' });
    return null;
  }
  return { imageBase64: asset.base64, mimeType };
};

const askPhotoSource = () =>
  new Promise<PhotoSource | null>((resolve) =>
    Alert.alert(
      '인바디 결과지 사진',
      '결과지나 인바디 앱 화면을 찍거나 골라 주세요',
      [
        { text: '취소', style: 'cancel', onPress: () => resolve(null) },
        { text: '앨범에서 고르기', onPress: () => resolve('library') },
        { text: '사진 찍기', onPress: () => resolve('camera') },
      ],
      { cancelable: true, onDismiss: () => resolve(null) }
    )
  );

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
// 처음 기록한 직후(그 전에 기록이 없을 때) 한 번만 매일 아침 알림을 받을지 묻는다.
// "결과지 사진으로 입력"은 인바디 결과지 사진을 읽어 세 칸을 채우기만 한다 (저장은 사용자가 누른다).
// 결과지 날짜가 저장할 날과 다르면 어느 날로 저장할지 고르게 한다 (기본: 결과지 날짜)
export function WeightInputSheet({ bottomSheetRef, target }: WeightInputSheetProps) {
  const { logs, isLogsFetched, saveWeight, isSaving } = useWeights();
  const { setting, isFetched, isError, updateSetting } = useUserSetting();

  const [text, setText] = useState('');
  const [askReminder, setAskReminder] = useState(false);
  // 범위 안내는 저장을 눌렀거나 입력칸을 벗어났을 때만 보여준다 (입력 중 "6", "65."에는 띄우지 않는다)
  const [showError, setShowError] = useState(false);
  const [bodyText, setBodyText] = useState(EMPTY_BODY_COMP);
  const [bodyError, setBodyError] = useState(NO_BODY_COMP_ERROR);
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 결과지 날짜 (저장할 날과 다를 때만). useMeasuredDay면 그날로 저장한다
  const [measuredDay, setMeasuredDay] = useState<string | null>(null);
  const [useMeasuredDay, setUseMeasuredDay] = useState(true);
  // 시트 대상이 바뀐 뒤 늦게 온 읽기 결과는 버린다
  const readIdRef = useRef(0);

  const saveDay = target ? (measuredDay && useMeasuredDay ? measuredDay : target.day) : null;
  // 저장할 날의 기존 인바디 값 (바꾼 칸만 보내려고). 시트를 연 날이면 시트가 받은 값
  const saveDayInitial =
    target && saveDay && saveDay !== target.day
      ? prefillBodyComp(logs, saveDay)
      : target?.initialBodyComp;

  useEffect(() => {
    readIdRef.current += 1;
    setReading(false);
    setNotice(null);
    setMeasuredDay(null);
    setUseMeasuredDay(true);
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

  const handleReadPhoto = async () => {
    if (!target || reading) return;
    Keyboard.dismiss();
    const source = await askPhotoSource();
    if (!source) return;
    const image = await pickPhoto(source);
    if (!image) return;

    const readId = ++readIdRef.current;
    setReading(true);
    setNotice(null);
    // 피커를 여는 동안 연결이 끊겼을 수 있다
    await requireOnline(async () => {
      const outcome = await InbodyAPI.read(image);
      if (readId !== readIdRef.current || !outcome) return;
      if (outcome.status !== 'ok') {
        setNotice(outcome.message);
        return;
      }
      const filled = inbodyFill({
        result: outcome.result,
        texts: { weight: text, muscle: bodyText.muscle, fat: bodyText.fat },
        targetDay: target.day,
        today: getKoreanDateString({ formatType: 'date' }),
      });
      if (!filled.found) {
        setNotice(INBODY_NOT_FOUND_MESSAGE);
        return;
      }
      setText(filled.texts.weight);
      setShowError(false);
      setBodyText({ muscle: filled.texts.muscle, fat: filled.texts.fat });
      setBodyError(NO_BODY_COMP_ERROR);
      setMeasuredDay(filled.measuredDay);
      setUseMeasuredDay(true);
    })();
    if (readId === readIdRef.current) setReading(false);
  };

  const handleSave = requireOnline(async () => {
    if (!target || !saveDay || !saveDayInitial || isSaving || reading) return;
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
        day: saveDay,
        weight_kg: weight,
        initial: saveDayInitial,
        input: { muscle_kg: muscle, fat_kg: fat },
      })
    );
    if (!saved) return; // 실패 안내는 API가 했다

    Keyboard.dismiss();
    bottomSheetRef.current?.close();
    showSuccessToast({
      textType: 'CUSTOM',
      title:
        saveDay === target.day
          ? `${weight.toFixed(1)}kg 기록했어요`
          : `${formatDayLabel(saveDay)}에 ${weight.toFixed(1)}kg 기록했어요`,
    });

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
            {target && saveDay
              ? `${saveDay === target.day && target.isToday ? '오늘 ' : ''}${formatDayLabel(saveDay)} 체중을 적어 주세요`
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
            <TouchableOpacity
              disabled={reading}
              onPress={handleReadPhoto}
              hitSlop={8}
              className="flex-row items-center gap-1 rounded-full border border-green-600 px-3 py-1.5">
              {reading ? (
                <ActivityIndicator size="small" color={colors.green[600]} />
              ) : (
                <MaterialIcons name="photo-camera" size={16} color={colors.green[600]} />
              )}
              <Text className="text-sm font-semibold text-green-600">
                {reading ? '결과지 읽는 중...' : '결과지 사진으로 입력'}
              </Text>
            </TouchableOpacity>
          </View>
          {notice && <Text className="mb-3 text-sm text-amber-600">{notice}</Text>}
          <View className={`flex-row gap-3 ${measuredDay ? 'mb-4' : 'mb-6'}`}>
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

          {target && measuredDay && (
            <View className="mb-6 rounded-xl bg-neutral-100 p-3">
              <Text className="mb-2 text-sm text-neutral-600">
                {`결과지 날짜 ${formatMonthDay(measuredDay)} · 어느 날로 저장할까요?`}
              </Text>
              <View className="flex-row gap-2">
                {[
                  { use: true, label: `결과지 날짜(${formatMonthDay(measuredDay)})` },
                  {
                    use: false,
                    label: target.isToday
                      ? `오늘(${formatMonthDay(target.day)})`
                      : formatMonthDay(target.day),
                  },
                ].map(({ use, label }) => {
                  const selected = useMeasuredDay === use;
                  return (
                    <TouchableOpacity
                      key={label}
                      onPress={() => setUseMeasuredDay(use)}
                      className={`flex-1 items-center rounded-lg border py-2 ${
                        selected ? 'border-green-600 bg-white' : 'border-neutral-200'
                      }`}>
                      <Text className={selected ? 'font-bold text-green-600' : 'text-neutral-500'}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <RippleButton
            outerClassName={`mb-10 ${isSaving || reading || !text.trim() ? 'opacity-50' : ''}`}
            className="w-full bg-green-600 py-4"
            disabled={isSaving || reading || !text.trim()}
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
