import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import type { RecipeFilterType } from 'const/filter';
import { router } from 'expo-router';
import { View } from 'react-native';
import { carbTypeStyle } from 'utils/carbType';

interface CreateRecipeSuggestionProps {
  keyword: string;
  filter: RecipeFilterType;
}

const KEYWORD_MAX = 12;

// 탐색 검색 결과가 없을 때: 찾던 음식을 직접 만들게 레시피 만들기로 보낸다 (재료 검색칸에 찾던 말을 미리 넣는다).
// 저탄수·무탄수 필터를 걸었으면 그 버튼 하나만. 버튼 색은 레시피 카드와 같은 저탄수(앰버)·무탄수(초록)
export function CreateRecipeSuggestion({ keyword, filter }: CreateRecipeSuggestionProps) {
  const word = keyword.trim();
  const label = word.length > KEYWORD_MAX ? `${word.slice(0, KEYWORD_MAX)}…` : word;
  const types: ('low' | 'zero')[] =
    filter === '저탄수' ? ['low'] : filter === '무탄수' ? ['zero'] : ['low', 'zero'];

  const open = (type: 'low' | 'zero') =>
    router.push({ pathname: `/recipeCreation/${type}`, params: word ? { keyword: word } : {} });

  return (
    <View className="items-center gap-3 px-5">
      <Text className="text-center text-neutral-600">
        {label ? `"${label}" 레시피를 직접 만들어 볼까요?` : '레시피를 직접 만들어 볼까요?'}
      </Text>
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
    </View>
  );
}
