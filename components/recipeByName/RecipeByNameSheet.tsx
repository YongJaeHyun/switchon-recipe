import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomSheetTextInput, BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { CustomBottomSheet } from 'components/common/CustomBottomSheet';
import { PassTrialBanner } from 'components/common/PassTrialBanner';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { WeekChips } from 'components/recipeCreation/WeekChips';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { useBlurOnKeyboardHide } from 'hooks/useBlurOnKeyboardHide';
import { useQuotaGate } from 'hooks/useQuotaGate';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, type TextInput, TouchableOpacity, View } from 'react-native';
import { runRecipeJob } from 'services/recipeJobRunner';
import { useRecipeByNameSheetStore } from 'stores/recipeByNameSheetStore';
import { useRecipeJobBusy } from 'stores/recipeJobStore';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { carbTypeStyle } from 'utils/carbType';
import { getWeekAndDay } from 'utils/date';
import { requireOnline } from 'utils/network';
import { recipeJobLabel } from 'utils/recipeJob';
import {
  cleanDishNameInput,
  DISH_NAME_MAX,
  RECIPE_BY_NAME_TITLE,
  recipeByNameEntryState,
} from 'utils/recipeByName';
import {
  defaultChosenWeek,
  defaultNameWeekChoice,
  NAME_WEEK_CHOICES,
  nameRequestWeek,
  nameWeekLabel,
} from 'utils/recipeWeekChoice';

const CARB_OPTIONS = [false, true] as const;

// 먹고 싶은 음식 이름 + 주차 + 저탄수/무탄수 → [레시피 만들기] (운영자: 바텀시트 유지).
// 이름 칸은 value를 다시 넣지 않는다(uncontrolled): 매번 다시 넣으면 한글 조합이 깨져 초성·모음이 따로 써졌다.
// 열 때마다 key를 바꿔 새 입력칸으로 시작하고, 보낼 때만 정리한다.
// 앱에 하나만 붙는다(app/_layout): 입구(useRecipeByNameEntry)와 하단 띠(이름 고치기)가 stores/recipeByNameSheetStore로 연다.
// [레시피 만들기]를 누르면 시트를 닫고 뒤에서 만든다. 거절·한도·체험 끝 같은 답은 하단 띠가 알린다
export function RecipeByNameSheet() {
  const request = useRecipeByNameSheetStore((state) => state.request);
  const sheetRef = useRef<BottomSheetMethods>(null);
  const initialName = cleanDishNameInput(request?.name ?? '');
  const inputRef = useRef<TextInput>(null);
  const nameRef = useRef(initialName);
  const [hasName, setHasName] = useState(initialName.trim().length > 0);
  const [isZeroCarb, setIsZeroCarb] = useState(false);
  const startDate = useUserStore((state) => state.start_date);
  const currentWeek = defaultChosenWeek(getWeekAndDay(startDate).week);
  const currentChoice = defaultNameWeekChoice(currentWeek);
  const [week, setWeek] = useState(currentChoice);

  const { status } = usePass();
  const billingAvailable = useBillingAvailable();
  const entry = recipeByNameEntryState(status, billingAvailable);
  const trialRemaining = entry.kind === 'trial' ? entry.remaining : null;

  // 남은 개수 표시용
  const quotaGate = useQuotaGate();
  const isBusy = useRecipeJobBusy();
  // 띠에서 "이름 고치기"로 다시 열 때 서버가 준 안내
  const [message, setMessage] = useState<string | null>(null);
  const clearMessage = () => setMessage(null);
  const currentChoiceRef = useRef(currentChoice);
  currentChoiceRef.current = currentChoice;

  useBlurOnKeyboardHide();

  // 여는 요청이 바뀔 때만 채운다 (다른 값이 바뀔 때 다시 돌면 입력 중인 이름이 지워진다)
  useEffect(() => {
    if (!request) return;
    const name = cleanDishNameInput(request.name);
    nameRef.current = name;
    setHasName(name.trim().length > 0);
    setIsZeroCarb(request.isZeroCarb);
    setWeek(request.weekChoice ?? currentChoiceRef.current);
    setMessage(request.message ?? null);
    sheetRef.current?.expand();
  }, [request]);

  const trimmed = () => cleanDishNameInput(nameRef.current).trim();
  const canSubmit = hasName && !isBusy;

  const start = requireOnline((name: string) => {
    sheetRef.current?.close();
    runRecipeJob(
      {
        kind: 'byName',
        request: { name, isZeroCarb, week: nameRequestWeek(week, currentWeek) },
        weekChoice: week,
      },
      { label: recipeJobLabel({ kind: 'byName', name }), origin: request?.origin ?? '' }
    );
  });

  const submit = () => {
    const name = trimmed();
    if (!name || isBusy) return;
    Keyboard.dismiss();
    void start(name);
  };

  const clearName = () => {
    inputRef.current?.clear();
    nameRef.current = '';
    setHasName(false);
    inputRef.current?.focus();
  };

  const footnote =
    trialRemaining !== null
      ? '만들 수 없는 이름이면 무료 체험 횟수가 줄지 않아요'
      : quotaGate.remainingText;

  return (
    <>
      {/* 체중 기록 시트와 같은 기본 설정: 내용에 맞는 높이로 열리고, 키보드가 올라오면 시트도 따라 올라갔다가 내려가면 돌아온다 */}
      <CustomBottomSheet ref={sheetRef} keyboard={{ keyboardBlurBehavior: 'restore' }}>
        <BottomSheetView className="px-5 pb-6 pt-1">
          <Text className="mb-4 text-2xl font-bold">{RECIPE_BY_NAME_TITLE}</Text>
          {trialRemaining !== null && (
            <PassTrialBanner
              className="mb-4"
              variant="trial"
              remaining={trialRemaining}
              onBeforeOpenPass={() => sheetRef.current?.close()}
            />
          )}

          <View
            className={`mb-2 flex-row items-center rounded-xl border bg-white px-4 ${
              message ? 'border-amber-500' : 'border-neutral-300'
            }`}>
            <MaterialIcons name="restaurant" size={20} color={colors.neutral[400]} />
            <BottomSheetTextInput
              key={request?.at ?? 0}
              ref={inputRef as never}
              style={{
                flex: 1,
                fontSize: 20,
                fontWeight: '700',
                color: colors.neutral[900],
                paddingVertical: 14,
                marginLeft: 10,
              }}
              defaultValue={initialName}
              onChangeText={(text: string) => {
                nameRef.current = text;
                setHasName(text.trim().length > 0);
                if (message) clearMessage();
              }}
              placeholder="예: 김치찌개"
              placeholderTextColor={colors.neutral[300]}
              maxLength={DISH_NAME_MAX}
              returnKeyType="done"
              onSubmitEditing={submit}
              accessibilityLabel="먹고 싶은 음식 이름"
            />
            {hasName && (
              <TouchableOpacity
                hitSlop={8}
                onPress={clearName}
                accessibilityRole="button"
                accessibilityLabel="이름 지우기">
                <MaterialIcons name="cancel" size={20} color={colors.neutral[300]} />
              </TouchableOpacity>
            )}
          </View>

          {message ? (
            <View className="mb-5 flex-row items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5">
              <MaterialIcons name="info-outline" size={18} color={colors.amber[600]} />
              <Text className="flex-1 text-sm leading-5 text-neutral-700">{message}</Text>
            </View>
          ) : (
            <Text className="mb-5 text-sm text-neutral-400">
              원래 피해야 하는 음식이면 스위치온식으로 바꿔 만들어요
            </Text>
          )}

          <WeekChips
            className="mb-3"
            value={week}
            currentWeek={currentChoice}
            choices={NAME_WEEK_CHOICES}
            labelOf={nameWeekLabel}
            onChange={(next) => {
              setWeek(next);
              if (message) clearMessage();
            }}
          />

          <View className="mb-6 flex-row gap-3">
            {CARB_OPTIONS.map((zero) => {
              const style = carbTypeStyle(zero);
              const selected = isZeroCarb === zero;
              return (
                <TouchableOpacity
                  key={style.label}
                  onPress={() => setIsZeroCarb(zero)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border py-3 ${
                    selected ? `${style.border} ${style.badgeBg}` : 'border-neutral-200 bg-white'
                  }`}>
                  <View className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                  <Text
                    className={`text-base ${selected ? `font-bold ${style.badgeText}` : 'text-neutral-500'}`}>
                    {style.label}로
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <RippleButton
            outerClassName={`mb-3 ${canSubmit ? '' : 'opacity-50'}`}
            className="w-full bg-green-600 py-4"
            disabled={!canSubmit}
            onPress={submit}>
            <Text className="text-lg font-semibold text-white">
              {isBusy ? '만드는 중…' : '레시피 만들기'}
            </Text>
          </RippleButton>
          {footnote && (
            <Text
              className={`text-center ${
                trialRemaining !== null ? 'text-xs text-neutral-400' : 'text-sm text-neutral-500'
              }`}>
              {footnote}
            </Text>
          )}
        </BottomSheetView>
      </CustomBottomSheet>
    </>
  );
}
