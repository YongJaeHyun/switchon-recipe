import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomSheetTextInput, BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { Portal } from '@gorhom/portal';
import { CustomBottomSheet } from 'components/common/CustomBottomSheet';
import { PassTrialBanner } from 'components/common/PassTrialBanner';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import CreationLoadingOverlay from 'components/recipeCreation/CreationLoadingOverlay';
import QuotaExceededModal from 'components/recipeCreation/QuotaExceededModal';
import { WeekChips } from 'components/recipeCreation/WeekChips';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { useBlurOnKeyboardHide } from 'hooks/useBlurOnKeyboardHide';
import { useRecipeByName } from 'hooks/useRecipeByName';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, type TextInput, TouchableOpacity, View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { carbTypeStyle } from 'utils/carbType';
import { getWeekAndDay } from 'utils/date';
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

export interface RecipeByNameOpenRequest {
  name: string;
  isZeroCarb: boolean;
  // 같은 값으로 다시 열어도 새로 열리게
  at: number;
}

// 시트를 여는 쪽(useRecipeByNameEntry)이 쓴다
export const useRecipeByNameSheet = () => {
  const [request, setRequest] = useState<RecipeByNameOpenRequest | null>(null);
  const open = useCallback(
    (name = '', isZeroCarb = false) => setRequest({ name, isZeroCarb, at: Date.now() }),
    []
  );
  return { request, open };
};

const CARB_OPTIONS = [false, true] as const;

interface RecipeByNameSheetProps {
  request: RecipeByNameOpenRequest | null;
}

// 먹고 싶은 음식 이름 + 주차 + 저탄수/무탄수 → [레시피 만들기] (운영자: 바텀시트 유지).
// 이름 칸은 value를 다시 넣지 않는다(uncontrolled): 매번 다시 넣으면 한글 조합이 깨져 초성·모음이 따로 써졌다.
// 열 때마다 key를 바꿔 새 입력칸으로 시작하고, 보낼 때만 정리한다
export function RecipeByNameSheet({ request }: RecipeByNameSheetProps) {
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

  const creation = useRecipeByName({ onSuccess: () => sheetRef.current?.close() });
  const { clearMessage } = creation;
  const clearMessageRef = useRef(clearMessage);
  clearMessageRef.current = clearMessage;
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
    setWeek(currentChoiceRef.current);
    clearMessageRef.current();
    sheetRef.current?.expand();
  }, [request]);

  // 만드는 중에는 뒤로 가기로 빠져나가지 않는다 (나가면 완성된 레시피로 넘어가지 못함)
  useEffect(() => {
    if (!creation.isCreating) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [creation.isCreating]);

  const trimmed = () => cleanDishNameInput(nameRef.current).trim();
  const canSubmit = hasName && !creation.isCreating;

  const submit = () => {
    const name = trimmed();
    if (!name || creation.isCreating) return;
    Keyboard.dismiss();
    void creation.create({ name, isZeroCarb, week: nameRequestWeek(week, currentWeek) });
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
      : creation.remainingText;

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
              creation.message ? 'border-amber-500' : 'border-neutral-300'
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
                if (creation.message) clearMessage();
              }}
              editable={!creation.isCreating}
              placeholder="예: 김치찌개"
              placeholderTextColor={colors.neutral[300]}
              maxLength={DISH_NAME_MAX}
              returnKeyType="done"
              onSubmitEditing={submit}
              accessibilityLabel="먹고 싶은 음식 이름"
            />
            {hasName && !creation.isCreating && (
              <TouchableOpacity
                hitSlop={8}
                onPress={clearName}
                accessibilityRole="button"
                accessibilityLabel="이름 지우기">
                <MaterialIcons name="cancel" size={20} color={colors.neutral[300]} />
              </TouchableOpacity>
            )}
          </View>

          {creation.message ? (
            <View className="mb-5 flex-row items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5">
              <MaterialIcons name="info-outline" size={18} color={colors.amber[600]} />
              <Text className="flex-1 text-sm leading-5 text-neutral-700">{creation.message}</Text>
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
              if (creation.message) clearMessage();
            }}
            disabled={creation.isCreating}
          />

          <View className="mb-6 flex-row gap-3">
            {CARB_OPTIONS.map((zero) => {
              const style = carbTypeStyle(zero);
              const selected = isZeroCarb === zero;
              return (
                <TouchableOpacity
                  key={style.label}
                  disabled={creation.isCreating}
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
            <Text className="text-lg font-semibold text-white">레시피 만들기</Text>
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

      {/* 시트보다 늦게 붙어 시트·탭 바까지 덮는다 */}
      {creation.isCreating && (
        <Portal>
          <CreationLoadingOverlay />
        </Portal>
      )}
      <QuotaExceededModal {...creation.quotaModalProps} />
    </>
  );
}
