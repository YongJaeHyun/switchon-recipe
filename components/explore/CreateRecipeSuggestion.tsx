import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PassBadge } from 'components/common/PassBadge';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { TrialBadge } from 'components/common/TrialBadge';
import { PassOnlyModal } from 'components/common/PassOnlyModal';
import { RecipeByNameSheet } from 'components/recipeByName/RecipeByNameSheet';
import type { RecipeFilterType } from 'const/filter';
import { useRecipeByNameEntry } from 'hooks/useRecipeByNameEntry';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import { suggestionLabel } from 'utils/recipeByName';

interface CreateRecipeSuggestionProps {
  keyword: string;
  filter: RecipeFilterType;
}

const KEYWORD_MAX = 12;

// 탐색 검색 결과가 없을 때: 찾던 이름 그대로 레시피를 만드는 패스 버튼(먹고 싶은 음식으로 만들기, 무료 체험 2번).
// 탐색은 레시피 이름으로 찾으므로 재료 골라 만들기는 두지 않는다 (운영자 결정 2026-11-01).
// 패스·체험이 없으면 누를 때 "패스 기능이에요" 창으로 묻는다 (useRecipeByNameEntry). 시트에는 검색어와 필터의 탄수 종류를 미리 넣는다
export function CreateRecipeSuggestion({ keyword, filter }: CreateRecipeSuggestionProps) {
  const word = keyword.trim();
  const label = word.length > KEYWORD_MAX ? `${word.slice(0, KEYWORD_MAX)}…` : word;

  const byName = useRecipeByNameEntry();

  if (!word || !byName.visible) return null;

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
        onPress={() => byName.press(word, filter === '무탄수')}>
        <MaterialIcons name="edit-note" size={20} color={colors.green[600]} />
        <Text className="font-bold text-green-700">{suggestionLabel(word)}</Text>
        {byName.entry.kind === 'trial' && <TrialBadge remaining={byName.entry.remaining} />}
        {byName.locked && <PassBadge locked />}
      </RippleButton>
      <RecipeByNameSheet request={byName.sheetRequest} trialRemaining={byName.trialRemaining} />
      <PassOnlyModal {...byName.passModalProps} />
    </View>
  );
}
