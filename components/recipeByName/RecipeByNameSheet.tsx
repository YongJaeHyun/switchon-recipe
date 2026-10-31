import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomSheetTextInput, BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { Portal } from '@gorhom/portal';
import { CustomBottomSheet } from 'components/common/CustomBottomSheet';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import CreationLoadingOverlay from 'components/recipeCreation/CreationLoadingOverlay';
import QuotaExceededModal from 'components/recipeCreation/QuotaExceededModal';
import { useRecipeByName } from 'hooks/useRecipeByName';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, TouchableOpacity, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { carbTypeStyle } from 'utils/carbType';
import { cleanDishNameInput, DISH_NAME_MAX, RECIPE_BY_NAME_TITLE } from 'utils/recipeByName';

export interface RecipeByNameOpenRequest {
  name: string;
  isZeroCarb: boolean;
  // 같은 값으로 다시 열어도 새로 열리게
  at: number;
}

// 시트를 여는 쪽(레시피 탭 카드, 탐색 결과 없음)이 쓴다
export const useRecipeByNameSheet = () => {
  const [request, setRequest] = useState<RecipeByNameOpenRequest | null>(null);
  const open = useCallback(
    (name = '', isZeroCarb = false) => setRequest({ name, isZeroCarb, at: Date.now() }),
    []
  );
  return { request, open };
};

interface RecipeByNameSheetProps {
  request: RecipeByNameOpenRequest | null;
  // 패스 없이 남은 무료 횟수 (패스 사용자·모름이면 null)
  trialRemaining: number | null;
}

const CARB_OPTIONS = [false, true] as const;

// 먹고 싶은 음식 이름 + 저탄수/무탄수 → [레시피 만들기]. 거절·확인 한도 안내는 입력 아래에 보여 주고
// 시트를 닫지 않는다 (이름만 고쳐 다시 만들 수 있게). 만드는 동안은 화면 전체를 기존 생성 로딩으로 덮는다
export function RecipeByNameSheet({ request, trialRemaining }: RecipeByNameSheetProps) {
  const sheetRef = useRef<BottomSheetMethods>(null);
  const [name, setName] = useState('');
  const [isZeroCarb, setIsZeroCarb] = useState(false);

  const creation = useRecipeByName({ onSuccess: () => sheetRef.current?.close() });
  const { clearMessage } = creation;
  // 여는 요청이 바뀔 때만 이름을 채운다. 다른 값(clearMessage 등)이 바뀔 때 다시 돌면 입력 중인 이름이 지워진다
  const clearMessageRef = useRef(clearMessage);
  clearMessageRef.current = clearMessage;

  useEffect(() => {
    if (!request) return;
    setName(cleanDishNameInput(request.name));
    setIsZeroCarb(request.isZeroCarb);
    clearMessageRef.current();
    sheetRef.current?.expand();
  }, [request]);

  // 만드는 중에는 뒤로 가기로 빠져나가지 않는다 (탭 화면이라 나가면 완성된 레시피로 넘어가지 못함)
  useEffect(() => {
    if (!creation.isCreating) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [creation.isCreating]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !creation.isCreating;

  const submit = () => {
    if (!canSubmit) return;
    Keyboard.dismiss();
    void creation.create({ name: trimmed, isZeroCarb });
  };

  const footnote =
    trialRemaining !== null
      ? `무료 체험 ${trialRemaining}번 남았어요 · 만들 수 없는 이름이면 횟수가 줄지 않아요`
      : creation.remainingText;

  return (
    <>
      <CustomBottomSheet ref={sheetRef}>
        <BottomSheetView className="px-5">
          <Text className="mb-1 text-2xl font-bold">{RECIPE_BY_NAME_TITLE}</Text>
          <Text className="mb-5 text-neutral-500">
            스위치온 규칙에 맞게 재료를 골라 레시피로 만들어 드려요
          </Text>

          <View
            className={`mb-2 flex-row items-center rounded-xl border px-4 ${
              creation.message ? 'border-amber-500' : 'border-neutral-300'
            }`}>
            <MaterialIcons name="restaurant" size={20} color={colors.neutral[400]} />
            <BottomSheetTextInput
              style={{
                flex: 1,
                fontSize: 20,
                fontWeight: '700',
                paddingVertical: 14,
                marginLeft: 10,
              }}
              value={name}
              onChangeText={(text) => {
                setName(cleanDishNameInput(text));
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
            {name.length > 0 && !creation.isCreating && (
              <TouchableOpacity
                hitSlop={8}
                onPress={() => setName('')}
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
            outerClassName={`${footnote ? 'mb-3' : 'mb-10'} ${canSubmit ? '' : 'opacity-50'}`}
            className="w-full bg-green-600 py-4"
            disabled={!canSubmit}
            onPress={submit}>
            <Text className="text-lg font-semibold text-white">레시피 만들기</Text>
          </RippleButton>
          {footnote && (
            <Text className="mb-8 text-center text-sm text-neutral-500">{footnote}</Text>
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
