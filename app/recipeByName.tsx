import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PassTrialBanner } from 'components/common/PassTrialBanner';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import CreationLoadingOverlay from 'components/recipeCreation/CreationLoadingOverlay';
import QuotaExceededModal from 'components/recipeCreation/QuotaExceededModal';
import { WeekChips } from 'components/recipeCreation/WeekChips';
import { router, useLocalSearchParams } from 'expo-router';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { useRecipeByName } from 'hooks/useRecipeByName';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { defaultChosenWeek } from 'utils/recipeWeekChoice';

const CARB_OPTIONS = [false, true] as const;

// 먹고 싶은 음식 이름 + 주차 + 저탄수/무탄수 → [레시피 만들기].
// 바텀시트 대신 전체 화면: 시트 안 입력칸은 실제 폰에서 키보드에 가려지고(엣지 투 엣지 + 시트 키보드 처리),
// value를 매번 다시 넣는 입력칸은 한글 조합이 깨져(초성·모음이 따로 써짐) 이름 칸을 화면 맨 위에 두고
// 입력칸이 스스로 글자를 들고 있게(uncontrolled) 했다. 보낼 때만 정리한다
export default function RecipeByNameScreen() {
  const params = useLocalSearchParams<{ name?: string; zero?: string }>();
  const initialName = cleanDishNameInput(params.name ?? '');
  const inputRef = useRef<TextInput>(null);
  const nameRef = useRef(initialName);
  const [hasName, setHasName] = useState(initialName.trim().length > 0);
  const [isZeroCarb, setIsZeroCarb] = useState(params.zero === '1');
  const startDate = useUserStore((state) => state.start_date);
  const currentWeek = defaultChosenWeek(getWeekAndDay(startDate).week);
  const [week, setWeek] = useState(currentWeek);

  const { status } = usePass();
  const billingAvailable = useBillingAvailable();
  const entry = recipeByNameEntryState(status, billingAvailable);
  const trialRemaining = entry.kind === 'trial' ? entry.remaining : null;

  const creation = useRecipeByName({ onSuccess: () => {} });
  const { clearMessage } = creation;

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
    void creation.create({ name, isZeroCarb, week });
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
    <SafeAreaView className="flex-1 bg-neutral-50">
      <View className="flex-row items-center gap-3 px-5 pb-2 pt-4">
        <TouchableOpacity onPress={router.back} hitSlop={10} disabled={creation.isCreating}>
          <MaterialIcons name="arrow-back" size={28} color="black" />
        </TouchableOpacity>
        <Text className="text-xl font-bold">{RECIPE_BY_NAME_TITLE}</Text>
      </View>

      <ScrollView contentContainerClassName="px-5 pb-10 pt-3" keyboardShouldPersistTaps="handled">
        {trialRemaining !== null && (
          <PassTrialBanner className="mb-4" variant="trial" remaining={trialRemaining} />
        )}

        <View
          className={`mb-2 flex-row items-center rounded-xl border bg-white px-4 ${
            creation.message ? 'border-amber-500' : 'border-neutral-300'
          }`}>
          <MaterialIcons name="restaurant" size={20} color={colors.neutral[400]} />
          <TextInput
            ref={inputRef}
            style={{
              flex: 1,
              fontSize: 20,
              fontWeight: '700',
              color: colors.neutral[900],
              paddingVertical: 14,
              marginLeft: 10,
            }}
            defaultValue={initialName}
            onChangeText={(text) => {
              nameRef.current = text;
              setHasName(text.trim().length > 0);
              if (creation.message) clearMessage();
            }}
            autoFocus={!initialName}
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
          currentWeek={currentWeek}
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
      </ScrollView>

      {creation.isCreating && <CreationLoadingOverlay />}
      <QuotaExceededModal {...creation.quotaModalProps} />
    </SafeAreaView>
  );
}
