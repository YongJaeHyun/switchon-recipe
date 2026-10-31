import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PassBadge } from 'components/common/PassBadge';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { TrialBadge } from 'components/common/TrialBadge';
import { RecipeByNameSheet, useRecipeByNameSheet } from 'components/recipeByName/RecipeByNameSheet';
import type { RecipeFilterType } from 'const/filter';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { usePremiumGate } from 'hooks/usePremiumGate';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import { recipeByNameEntryState, suggestionLabel } from 'utils/recipeByName';

interface CreateRecipeSuggestionProps {
  keyword: string;
  filter: RecipeFilterType;
}

const KEYWORD_MAX = 12;

// 탐색 검색 결과가 없을 때: 찾던 이름 그대로 레시피를 만드는 패스 버튼(먹고 싶은 음식으로 만들기, 무료 체험 2번).
// 탐색은 레시피 이름으로 찾으므로 재료 골라 만들기는 두지 않는다 (운영자 결정 2026-11-01).
// 검색어가 없거나, 판매가 꺼져 있고 체험도 없으면 아무것도 보이지 않는다. 시트에는 검색어와 필터의 탄수 종류를 미리 넣는다
export function CreateRecipeSuggestion({ keyword, filter }: CreateRecipeSuggestionProps) {
  const word = keyword.trim();
  const label = word.length > KEYWORD_MAX ? `${word.slice(0, KEYWORD_MAX)}…` : word;

  const { status } = usePass();
  const billingAvailable = useBillingAvailable();
  const gate = usePremiumGate();
  const byName = recipeByNameEntryState(status, billingAvailable);
  const byNameSheet = useRecipeByNameSheet();
  const openByName = () => byNameSheet.open(word, filter === '무탄수');

  if (!word || byName.kind === 'hidden') return null;

  return (
    <View className="items-center gap-3 px-5">
      <Text className="text-center text-neutral-600">
        {`"${label}" 레시피를 직접 만들어 볼까요?`}
      </Text>
      <RippleButton
        outerClassName="border-2 border-green-600 bg-white"
        className="flex-row items-center gap-2 px-5 py-3"
        rounded="full"
        rippleColor={colors.green[100]}
        accessibilityRole="button"
        onPress={byName.kind === 'locked' ? gate(openByName) : openByName}>
        <MaterialIcons name="edit-note" size={20} color={colors.green[600]} />
        <Text className="font-bold text-green-700">{suggestionLabel(word)}</Text>
        {byName.kind === 'trial' && <TrialBadge remaining={byName.remaining} />}
        {byName.kind === 'locked' && <PassBadge locked />}
      </RippleButton>
      <RecipeByNameSheet
        request={byNameSheet.request}
        trialRemaining={byName.kind === 'trial' ? byName.remaining : null}
      />
    </View>
  );
}
