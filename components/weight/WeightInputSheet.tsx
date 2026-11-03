import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomSheetTextInput, BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { InbodyAPI } from 'api/InbodyAPI';
import ConfirmModal from 'components/common/ConfirmModal';
import { PassBadge } from 'components/common/PassBadge';
import { CustomBottomSheet } from 'components/common/CustomBottomSheet';
import { useBlurOnKeyboardHide } from 'hooks/useBlurOnKeyboardHide';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { FlashField, InbodyPhotoPanel, type PhotoSource } from 'components/weight/InbodyPhotoPanel';
import { WeightDateStrip } from 'components/weight/WeightDateStrip';
import { type WeightGoalMode, WeightGoalStep } from 'components/weight/WeightGoalStep';
import { CHANNELS } from 'const/channels';
import { QueryKey } from 'const/queryKey';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { usePassOnlyPrompt } from 'hooks/usePassOnlyPrompt';
import { PassOnlyModal } from 'components/common/PassOnlyModal';
import { useUserSetting, useWeightGoal, useWeights } from 'hooks/useWeights';
import { queryClient } from 'lib/queryClient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, TouchableOpacity, View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { useWeightGoalStore } from 'stores/weightGoalStore';
import colors from 'tailwindcss/colors';
import { Nullable } from 'types/common';
import {
  BODY_COMP_RANGE,
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
import {
  dayLogTexts,
  formatMonthDay,
  formatReadDay,
  INBODY_NOT_FOUND_MESSAGE,
  type InbodyFieldKind,
  type InbodyFieldTexts,
  inbodyFill,
  inbodyReadKinds,
  type InbodyReadResult,
  inbodyTextsForDay,
} from 'utils/inbodyRead';
import { requireOnline } from 'utils/network';
import { passBadgeState } from 'utils/passFeatureLabel';
import { isPassOnSale, shouldShowPremiumEntry } from 'utils/passScreen';
import { enablePushForChannel, showNotificationPermissionAlert } from 'utils/notifications';
import { showErrorToast, showInfoToast, showSuccessToast } from 'utils/showToast';
import {
  MAX_WEIGHT_KG,
  MIN_WEIGHT_KG,
  parseWeightInput,
  shouldAskWeightReminder,
} from 'utils/weight';
import {
  type WeightInputTarget,
  weightDateChips,
  weightDateRange,
  carryEditedTexts,
  weightSheetSubtitle,
  weightTargetForDay,
} from 'utils/weightDateStrip';
import {
  goalInputTexts,
  latestWeight,
  type GoalInputTexts,
  shouldAskGoalAfterSave,
  type WeightGoal,
} from 'utils/weightGoal';

export type { WeightInputTarget };

const BODY_COMP_FIELDS: { kind: BodyCompKind; label: string; placeholder: string }[] = [
  { kind: 'muscle', label: '골격근량', placeholder: '예: 27.1' },
  { kind: 'fat', label: '체지방량', placeholder: '예: 19.8' },
];

const EMPTY_BODY_COMP: Record<BodyCompKind, string> = { muscle: '', fat: '' };
const NO_BODY_COMP_ERROR: Record<BodyCompKind, boolean> = { muscle: false, fat: false };

const NO_FLASH: Record<InbodyFieldKind, number> = { weight: 0, muscle: 0, fat: 0 };

const toText = (value: number | null) => (value != null ? value.toFixed(1) : '');

// 그날 기존 값으로 채운 칸 (resetFor가 채우는 값과 같다)
const dayTexts = (target: Nullable<WeightInputTarget>): InbodyFieldTexts => ({
  weight: toText(target?.initial ?? null),
  muscle: toText(target?.initialBodyComp.muscle_kg ?? null),
  fat: toText(target?.initialBodyComp.fat_kg ?? null),
});

// 음식 판정(app/foodCheck)과 같은 피커 설정: 크기 줄이기는 네이티브 모듈이 필요해 품질만 낮춘다
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
  return { uri: asset.uri, image: { imageBase64: asset.base64, mimeType } };
};

// 목표 입력만 열 때 (기록 탭 [정하기]·"목표까지" 카드·다음 목표). at이 바뀔 때마다 목표 단계로 바꾼다
export interface WeightGoalRequest {
  mode: Exclude<WeightGoalMode, 'ask'>;
  at: number;
}

interface WeightInputSheetProps {
  bottomSheetRef: React.RefObject<Nullable<BottomSheetMethods>>;
  target: Nullable<WeightInputTarget>;
  goalRequest?: Nullable<WeightGoalRequest>;
}

// 목표 단계: 어떤 입력으로 열었는지와 처음 채울 칸. key는 열 때마다 칸을 새로 만든다
interface GoalStepState {
  mode: WeightGoalMode;
  recordedKg?: number;
  texts: GoalInputTexts;
  key: number;
}

const formatDayLabel = (day: string) => {
  const [, m, d] = day.split('-').map(Number);
  return `${m}월 ${d}일`;
};

// 체중 입력 시트. 같은 날 다시 저장하면 그날 값을 바꾼다. 인바디(골격근량·체지방량)는 선택 입력이고
// 바꾼 칸만 저장한다 (체중만 고치면 그날 인바디 값은 그대로, 칸을 비우면 그 값만 지운다).
// 처음 기록한 직후(그 전에 기록이 없을 때) 한 번만 매일 아침 알림을 받을지 묻는다.
// "결과지 사진으로 입력"은 인바디 결과지 사진을 읽어 세 칸을 채우기만 한다 (저장은 사용자가 누른다).
// 결과지 날짜가 저장할 날과 다르면 어느 날로 저장할지 고르게 한다 (기본: 결과지 날짜, 7일 넘게 지난
// 결과지면 시트 날짜). 결과지 날짜로 저장할 때 못 읽은 칸은 그날 기존 값(없으면 빈칸)으로 맞춘다.
// 사진 읽기는 스위치온 패스 전용 (패스가 없으면 결제 화면으로). 직접 입력은 누구나.
// 맨 위 날짜 줄에서 (회차 시작 7일 전 ~ 오늘) 다른 날을 고르면 시트가 그날을 겨눈다 (그날 값으로 다시 채움,
// 결과지를 읽은 뒤면 읽은 값 + 그날 기존 값). 여는 쪽(target)은 처음 겨눌 날만 정한다.
// 처음 기록(저장 전 기록 0건)이고 목표가 없으면 저장 뒤 창을 닫지 않고 목표 묻기 단계로 바꾼다 ([나중에 정할게요]로
// 넘기면 이 기기에서는 다시 자동으로 묻지 않는다). 아침 알림 질문은 목표 단계가 끝난 뒤에 묻는다.
// goalRequest로 열면 처음부터 목표 단계 (기록 탭에서 목표를 정하거나 바꿀 때)
export function WeightInputSheet({
  bottomSheetRef,
  target: openedTarget,
  goalRequest,
}: WeightInputSheetProps) {
  // 키보드를 닫으면 시트도 원래 높이로 (이름으로 만들기 시트와 같다)
  useBlurOnKeyboardHide();
  const { logs, isLogsFetched, saveWeight, isSaving } = useWeights();
  const { setting, isFetched, isError, updateSetting } = useUserSetting();
  const { goal, status: goalStatus, saveGoal, isSavingGoal } = useWeightGoal();
  const uid = useUserStore((state) => state.id);
  const goalSkipped = useWeightGoalStore((state) => !!uid && state.skippedUids.includes(uid));
  const markGoalSkipped = useWeightGoalStore((state) => state.markSkipped);
  const [goalStep, setGoalStep] = useState<GoalStepState | null>(null);
  // 목표 단계가 끝나면(저장·건너뛰기·창 닫기) 물을 아침 알림 질문
  const pendingReminderRef = useRef(false);
  const { status: passStatus } = usePass();
  const startDate = useUserStore((state) => state.start_date) || null;
  const programStart = useUserStore((state) => state.program_start) || null;
  // 지금 겨눈 날 (날짜 줄에서 바꿀 수 있다). 시트를 열 때마다 여는 쪽 값으로 돌아간다
  const [target, setTarget] = useState<Nullable<WeightInputTarget>>(openedTarget);
  const billingAvailable = useBillingAvailable();
  const photoPrompt = usePassOnlyPrompt(
    'inbody',
    '인바디 결과지 사진으로 입력',
    '결과지 사진을 찍으면 체중·골격근량·체지방량을 읽어 채워 드려요'
  );
  // 패스를 팔지 않고 권한도 없으면 버튼을 숨긴다 (다른 패스 기능과 같다)
  const showPhotoButton = shouldShowPremiumEntry(passStatus, billingAvailable);
  const photoLocked = passStatus?.hasAccess !== true;

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
  const [measuredDayOld, setMeasuredDayOld] = useState(false);
  const [useMeasuredDay, setUseMeasuredDay] = useState(true);
  // 마지막 읽기 결과와 시트 날짜로 저장할 때의 칸 (날짜를 바꿀 때 칸을 다시 만든다)
  const [readResult, setReadResult] = useState<{
    result: InbodyReadResult;
    sheetTexts: InbodyFieldTexts;
  } | null>(null);
  // 결과지 날짜로 저장하는데 체중을 못 읽었고 그날 체중 기록도 없다 (직접 적어야 저장)
  const [weightMissing, setWeightMissing] = useState(false);
  // 시트 대상이 바뀐 뒤 늦게 온 읽기 결과는 버린다
  const readIdRef = useRef(0);
  // 결과지 사진 칸: 펼침 여부와 읽는 중인 사진 (읽는 동안 썸네일로 보여준다)
  const [photoPanelOpen, setPhotoPanelOpen] = useState(false);
  const [readingUri, setReadingUri] = useState<string | null>(null);
  // 사진에서 채운 칸을 잠깐 깜빡이게 (칸마다 값이 바뀔 때마다 깜빡인다)
  const [flashKeys, setFlashKeys] = useState<Record<InbodyFieldKind, number>>(NO_FLASH);

  const saveDay = target ? (measuredDay && useMeasuredDay ? measuredDay : target.day) : null;
  // 결과지 날짜 표시 (올해가 아니면 연도까지)
  const todayKst = getKoreanDateString({ formatType: 'date' });
  const measuredLabel = measuredDay ? formatReadDay(measuredDay, todayKst) : '';
  // 저장할 날의 기존 인바디 값 (바꾼 칸만 보내려고). 시트를 연 날이면 시트가 받은 값
  const saveDayInitial =
    target && saveDay && saveDay !== target.day
      ? prefillBodyComp(logs, saveDay)
      : target?.initialBodyComp;

  // 결과지 날짜로 저장하는데 체중이 비어 있으면 저장을 막고 안내한다
  const weightNeeded = weightMissing && useMeasuredDay && text.trim() === '';

  // 겨눌 날을 바꾸면 읽던 사진·결과지 날짜·칸을 그날 값으로 되돌린다
  const resetFor = (next: Nullable<WeightInputTarget>) => {
    readIdRef.current += 1;
    setReading(false);
    setPhotoPanelOpen(false);
    setReadingUri(null);
    setFlashKeys(NO_FLASH);
    setNotice(null);
    setMeasuredDay(null);
    setMeasuredDayOld(false);
    setUseMeasuredDay(true);
    setReadResult(null);
    setWeightMissing(false);
    setText(toText(next?.initial ?? null));
    setShowError(false);
    setBodyText({
      muscle: toText(next?.initialBodyComp.muscle_kg ?? null),
      fat: toText(next?.initialBodyComp.fat_kg ?? null),
    });
    setBodyError(NO_BODY_COMP_ERROR);
  };

  useEffect(() => {
    setTarget(openedTarget);
    resetFor(openedTarget);
    setGoalStep(null);
  }, [openedTarget]);

  // 목표만 열기: 정하기·바꾸기는 지금 목표로, 다음 목표는 체중 칸만 비우고 인바디 목표는 그대로
  useEffect(() => {
    if (!goalRequest) return;
    const texts = goalInputTexts(
      goal ?? { weight_goal_kg: null, muscle_goal_kg: null, fat_goal_kg: null }
    );
    setGoalStep({
      mode: goalRequest.mode,
      texts: goalRequest.mode === 'next' ? { ...texts, weight: '' } : texts,
      key: goalRequest.at,
    });
    // 열 때의 목표로만 채운다 (열린 동안 목표가 다시 받아져도 적던 칸을 덮지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalRequest]);

  // 날짜 줄: 범위는 시트를 연 날 기준 (전체 기간 기록의 옛 날을 열면 그날부터), 고른 칸 = 저장할 날
  const range = useMemo(
    () =>
      weightDateRange({
        today: todayKst,
        programStart,
        startDate,
        targetDay: openedTarget?.day,
      }),
    [todayKst, programStart, startDate, openedTarget]
  );
  const chips = useMemo(
    () => weightDateChips({ range, today: todayKst, logs, selectedDay: saveDay }),
    [range, todayKst, logs, saveDay]
  );

  // 날짜 칸을 누르면 그날로. 결과지를 읽은 뒤면 읽은 값 + 못 읽은 칸은 그날 기존 값 (결과지 날짜를 고를 때와 같다)
  const handleSelectDay = (day: string) => {
    if (reading || isSaving || day === saveDay) return;
    const next = weightTargetForDay(logs, day, todayKst);
    if (!readResult) {
      // 적던 칸은 가져가고, 손대지 않은 칸만 고른 날 값으로
      const texts = carryEditedTexts({
        current: { weight: text, muscle: bodyText.muscle, fat: bodyText.fat },
        base: dayTexts(target),
        next: dayTexts(next),
      });
      setTarget(next);
      resetFor(next);
      setFieldTexts(texts);
      return;
    }
    setTarget(next);
    setMeasuredDay(null);
    setMeasuredDayOld(false);
    setUseMeasuredDay(true);
    const forDay = inbodyTextsForDay({ result: readResult.result, base: dayLogTexts(logs, day) });
    setFieldTexts(forDay.texts);
    setWeightMissing(forDay.weightMissing);
  };

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

  const setFieldTexts = (texts: InbodyFieldTexts) => {
    setText(texts.weight);
    setShowError(false);
    setBodyText({ muscle: texts.muscle, fat: texts.fat });
    setBodyError(NO_BODY_COMP_ERROR);
  };

  // 저장 날을 고른다. 결과지 날짜면 못 읽은 칸을 그날 기존 값으로, 시트 날짜면 읽은 직후 칸으로
  const chooseDay = (
    read: { result: InbodyReadResult; sheetTexts: InbodyFieldTexts },
    day: string | null,
    use: boolean
  ) => {
    setUseMeasuredDay(use);
    if (use && day) {
      const forDay = inbodyTextsForDay({ result: read.result, base: dayLogTexts(logs, day) });
      setFieldTexts(forDay.texts);
      setWeightMissing(forDay.weightMissing);
    } else {
      setFieldTexts(read.sheetTexts);
      setWeightMissing(false);
    }
  };

  // 서버가 패스 없음(402)이라고 하면: 상태를 다시 받고, 살 수 있으면 결제 화면으로 (음식 판정과 같다)
  const handleLocked = () => {
    void queryClient.invalidateQueries({ queryKey: [QueryKey.pass] });
    if (isPassOnSale(passStatus?.sales, billingAvailable)) {
      bottomSheetRef.current?.close();
      router.push({ pathname: '/pass', params: { feature: 'inbody' } });
    } else {
      setNotice('패스가 필요한 기능이에요');
    }
  };

  // 패스가 없으면 결제 화면으로 바로 보내지 않고 "패스 기능이에요" 창으로 먼저 묻는다 (탐색 추천 탭과 같다).
  // 패스가 있으면 인바디 줄 아래에 사진 찍기/앨범 고르기 칸을 펼친다 (다시 누르면 접는다)
  const handlePhotoPress = () => {
    if (photoPanelOpen) {
      setPhotoPanelOpen(false);
      return;
    }
    Keyboard.dismiss();
    photoPrompt.guard(() => {
      if (!target || reading) return;
      setNotice(null);
      setPhotoPanelOpen(true);
    })();
  };

  // 고른 사진을 읽는다. 취소하거나 못 고르면 칸은 펼친 채로 둔다
  const handleReadPhoto = async (source: PhotoSource) => {
    if (!target || reading) return;
    const picked = await pickPhoto(source);
    if (!picked) return;
    const { uri, image } = picked;

    const readId = ++readIdRef.current;
    setReading(true);
    setReadingUri(uri);
    setNotice(null);
    // 피커를 여는 동안 연결이 끊겼을 수 있다
    await requireOnline(async () => {
      const outcome = await InbodyAPI.read(image);
      if (readId !== readIdRef.current || !outcome) return;
      if (outcome.status === 'locked') {
        handleLocked();
        return;
      }
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
      const read = { result: outcome.result, sheetTexts: filled.texts };
      setReadResult(read);
      setMeasuredDay(filled.measuredDay);
      setMeasuredDayOld(filled.measuredDayOld);
      // 오래된 결과지는 기본을 시트 날짜(보통 오늘)로
      chooseDay(read, filled.measuredDay, !filled.measuredDayOld);
      const kinds = inbodyReadKinds(outcome.result);
      setFlashKeys((prev) => {
        const next = { ...prev };
        kinds.forEach((kind) => (next[kind] = readId));
        return next;
      });
    })();
    if (readId === readIdRef.current) {
      setReading(false);
      setReadingUri(null);
      setPhotoPanelOpen(false);
    }
  };

  const handleSave = requireOnline(async () => {
    if (!target || !saveDay || !saveDayInitial || isSaving || reading || weightNeeded) return;
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
    const askReminderNext = shouldAskWeightReminder({
      isFetched,
      isError,
      setting,
      hadLogsBefore,
    });
    // 처음 기록이면 창을 닫지 않고 목표를 묻는다 ("✓ 기록했어요"가 창 안에 보이므로 토스트는 띄우지 않는다)
    if (shouldAskGoalAfterSave({ hadLogsBefore, goalStatus, skipped: goalSkipped })) {
      pendingReminderRef.current = askReminderNext;
      setGoalStep({
        mode: 'ask',
        recordedKg: weight,
        texts: { weight: '', muscle: '', fat: '' },
        key: Date.now(),
      });
      return;
    }

    bottomSheetRef.current?.close();
    showSuccessToast({
      textType: 'CUSTOM',
      title:
        saveDay === todayKst
          ? `${weight.toFixed(1)}kg 기록했어요`
          : `${formatDayLabel(saveDay)}에 ${weight.toFixed(1)}kg 기록했어요`,
    });

    if (askReminderNext) setAskReminder(true);
  });

  // 목표 단계를 마친다: 창을 닫는다 (미뤄 둔 아침 알림 질문은 창이 닫힐 때 묻는다)
  const finishGoalStep = () => {
    Keyboard.dismiss();
    bottomSheetRef.current?.close();
  };

  // 창이 닫힐 때(목표 저장·건너뛰기·끌어내리기): 첫 기록 목표 묻기를 저장 없이 닫았으면 건너뛴 것으로 본다
  const handleSheetClose = () => {
    if (goalStep?.mode === 'ask' && uid && goalStatus !== 'set') markGoalSkipped(uid);
    setGoalStep(null);
    if (pendingReminderRef.current) {
      pendingReminderRef.current = false;
      setAskReminder(true);
    }
  };

  const handleSaveGoal = requireOnline(async (next: WeightGoal) => {
    if (isSavingGoal) return;
    const hadGoal = goal?.weight_goal_kg != null;
    const saved = await saveGoal(next);
    if (!saved) return; // 실패 안내는 API가 했다
    finishGoalStep();
    const kg = next.weight_goal_kg?.toFixed(1);
    showSuccessToast({
      textType: 'CUSTOM',
      title: hadGoal ? `목표를 ${kg}kg으로 바꿨어요` : `목표 ${kg}kg을 정했어요`,
    });
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
      <CustomBottomSheet
        ref={bottomSheetRef}
        onClose={handleSheetClose}
        keyboard={{ keyboardBlurBehavior: 'restore' }}>
        {goalStep ? (
          <BottomSheetView className="px-5">
            <WeightGoalStep
              key={goalStep.key}
              mode={goalStep.mode}
              recordedKg={goalStep.recordedKg}
              initialTexts={goalStep.texts}
              currentKg={goalStep.recordedKg ?? latestWeight(logs)}
              saving={isSavingGoal}
              onSave={(next) => void handleSaveGoal(next)}
              onSkip={finishGoalStep}
            />
          </BottomSheetView>
        ) : (
          <BottomSheetView className="px-5">
            <Text className="mb-3 text-2xl font-bold">체중 기록</Text>
            {target && (
              <WeightDateStrip
                chips={chips}
                disabled={reading || isSaving}
                placeKey={openedTarget}
                onSelect={handleSelectDay}
              />
            )}
            <Text className="mb-4 text-neutral-500">
              {saveDay ? weightSheetSubtitle(saveDay, todayKst) : ''}
            </Text>

            <FlashField
              flashKey={flashKeys.weight}
              borderColor={invalid ? colors.red[400] : colors.neutral[300]}
              className="mb-2 flex-row items-center rounded-xl border px-4">
              <BottomSheetTextInput
                style={{ flex: 1, fontSize: 28, fontWeight: '700', paddingVertical: 12 }}
                value={text}
                onChangeText={handleChangeText}
                onBlur={handleBlur}
                editable={!reading}
                keyboardType="decimal-pad"
                placeholder="예: 65.5"
                placeholderTextColor={colors.neutral[300]}
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />
              <Text className="text-xl font-bold text-neutral-500">kg</Text>
            </FlashField>
            <Text className={`mb-6 text-sm ${invalid ? 'text-red-500' : 'text-neutral-400'}`}>
              {invalid
                ? `${MIN_WEIGHT_KG}~${MAX_WEIGHT_KG}kg 사이로 입력해 주세요`
                : '소수점 한 자리까지 기록돼요'}
            </Text>
            {weightNeeded && saveDay && (
              <Text className="-mt-4 mb-6 text-sm text-amber-600">
                {`결과지에서 체중을 읽지 못했어요. ${formatReadDay(saveDay, todayKst)} 체중을 적어 주세요`}
              </Text>
            )}

            {/* 인바디 (선택): 잰 날만 적는다. 비워 두면 저장하지 않는다 */}
            <View className="mb-3 flex-row items-center gap-2">
              <Text className="font-bold text-neutral-700">인바디</Text>
              <Text className="text-sm text-neutral-400">(선택)</Text>
              <View className="h-px flex-1 bg-neutral-200" />
              {showPhotoButton && (
                <TouchableOpacity
                  disabled={reading}
                  onPress={handlePhotoPress}
                  hitSlop={8}
                  accessibilityState={{ expanded: photoPanelOpen, disabled: reading }}
                  className={`flex-row items-center gap-1 rounded-full border border-green-600 py-1.5 pl-3 pr-1.5 ${
                    photoPanelOpen ? 'bg-green-50' : ''
                  } ${reading ? 'opacity-50' : ''}`}>
                  <MaterialIcons name="photo-camera" size={16} color={colors.green[600]} />
                  <Text className="text-sm font-semibold text-green-600">결과지 사진으로 입력</Text>
                  <PassBadge state={passBadgeState(!photoLocked)} />
                </TouchableOpacity>
              )}
            </View>
            {photoPanelOpen && (
              <InbodyPhotoPanel
                readingUri={readingUri}
                onPick={(source) => void handleReadPhoto(source)}
                onClose={() => setPhotoPanelOpen(false)}
              />
            )}
            {notice && (
              <View className="mb-3 flex-row items-start gap-2 rounded-xl bg-neutral-100 px-3 py-2.5">
                <MaterialIcons name="info-outline" size={18} color={colors.amber[600]} />
                <Text className="flex-1 text-sm leading-5 text-neutral-700">{notice}</Text>
              </View>
            )}
            <View className={`flex-row gap-3 ${measuredDay ? 'mb-4' : 'mb-6'}`}>
              {BODY_COMP_FIELDS.map(({ kind, label, placeholder }) => {
                const fieldInvalid = bodyInvalid(kind);
                const { min, max } = BODY_COMP_RANGE[kind];
                return (
                  <View key={kind} className="flex-1">
                    <Text className="mb-1 text-sm text-neutral-500">{label}</Text>
                    <FlashField
                      flashKey={flashKeys[kind]}
                      borderColor={fieldInvalid ? colors.red[400] : colors.neutral[300]}
                      className="flex-row items-center rounded-xl border px-3">
                      <BottomSheetTextInput
                        style={{ flex: 1, fontSize: 20, fontWeight: '700', paddingVertical: 10 }}
                        value={bodyText[kind]}
                        onChangeText={(value) => handleChangeBodyText(kind, value)}
                        onBlur={() => handleBodyBlur(kind)}
                        editable={!reading}
                        keyboardType="decimal-pad"
                        placeholder={placeholder}
                        placeholderTextColor={colors.neutral[300]}
                        maxLength={5}
                        returnKeyType="done"
                        onSubmitEditing={handleSave}
                      />
                      <Text className="font-bold text-neutral-500">kg</Text>
                    </FlashField>
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
                  {measuredDayOld
                    ? `결과지 날짜가 ${measuredLabel}로 오래됐어요 · 어느 날로 저장할까요?`
                    : `결과지 날짜 ${measuredLabel} · 어느 날로 저장할까요?`}
                </Text>
                <View className="flex-row gap-2">
                  {[
                    { use: true, label: `결과지 날짜(${measuredLabel})` },
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
                        disabled={reading}
                        onPress={() => readResult && chooseDay(readResult, measuredDay, use)}
                        className={`flex-1 items-center rounded-xl border py-2.5 ${
                          selected ? 'border-green-600 bg-green-50' : 'border-neutral-200 bg-white'
                        }`}>
                        <Text
                          className={selected ? 'font-bold text-green-600' : 'text-neutral-500'}>
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
        )}
      </CustomBottomSheet>

      <PassOnlyModal
        {...photoPrompt.modalProps}
        onBeforeOpenPass={() => bottomSheetRef.current?.close()}
      />

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
