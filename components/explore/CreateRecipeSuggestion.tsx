import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PassBadge } from 'components/common/PassBadge';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { TrialBadge } from 'components/common/TrialBadge';
import { RecipeByNameSheet, useRecipeByNameSheet } from 'components/recipeByName/RecipeByNameSheet';
import type { RecipeFilterType } from 'const/filter';
import { router } from 'expo-router';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { usePremiumGate } from 'hooks/usePremiumGate';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import { carbTypeStyle } from 'utils/carbType';
import { recipeByNameEntryState, suggestionLabel } from 'utils/recipeByName';

interface CreateRecipeSuggestionProps {
  keyword: string;
  filter: RecipeFilterType;
}

const KEYWORD_MAX = 12;

// 탐색 검색 결과가 없을 때: 찾던 음식을 직접 만들게 레시피 만들기로 보낸다 (재료 검색칸에 찾던 말을 미리 넣는다).
// 저탄수·무탄수 필터를 걸었으면 그 버튼 하나만. 버튼 색은 레시피 카드와 같은 저탄수(앰버)·무탄수(초록)
// 그 위에 찾던 이름 그대로 레시피를 만드는 패스 버튼(먹고 싶은 음식으로 만들기, 무료 체험 2번). 판매가 꺼져 있고
// 체험도 없으면 숨긴다. 시트에는 검색어와 필터의 탄수 종류를 미리 넣는다
export function CreateRecipeSuggestion({ keyword, filter }: CreateRecipeSuggestionProps) {
  const word = keyword.trim();
  const label = word.length > KEYWORD_MAX ? `${word.slice(0, KEYWORD_MAX)}…` : word;
  const types: ('low' | 'zero')[] =
    filter === '저탄수' ? ['low'] : filter === '무탄수' ? ['zero'] : ['low', 'zero'];

  const { status } = usePass();
  const billingAvailable = useBillingAvailable();
  const gate = usePremiumGate();
  const byName = recipeByNameEntryState(status, billingAvailable);
  const byNameSheet = useRecipeByNameSheet();
  const openByName = () => byNameSheet.open(word, filter === '무탄수');

  const open = (type: 'low' | 'zero') =>
    router.push({ pathname: `/recipeCreation/${type}`, params: word ? { keyword: word } : {} });

  return (
    <View className="items-center gap-3 px-5">
      <Text className="text-center text-neutral-600">
        {label ? `"${label}" 레시피를 직접 만들어 볼까요?` : '레시피를 직접 만들어 볼까요?'}
      </Text>
      {word && byName.kind !== 'hidden' && (
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
      )}
      {word && byName.kind !== 'hidden' && (
        <Text className="text-sm text-neutral-400">또는 재료를 골라 만들기</Text>
      )}
      <View className="flex-row gap-2">
        {types.map((type) => {
          const style = carbTypeStyle(type === 'zero');
          return (
            <RippleButton
              key={type}
              outerClassName={`border ${style.border} ${style.badgeBg}`}
              className="flex-row items-center gap-2 px-4 py-2.5"
              rounded="full"
              accessibilityRole="button"
              onPress={() => open(type)}>
              <View className={`h-2 w-2 rounded-full ${style.dot}`} />
              <Text className={`font-bold ${style.badgeText}`}>{style.label}로 만들기</Text>
            </RippleButton>
          );
        })}
      </View>
      <RecipeByNameSheet
        request={byNameSheet.request}
        trialRemaining={byName.kind === 'trial' ? byName.remaining : null}
      />
    </View>
  );
}
