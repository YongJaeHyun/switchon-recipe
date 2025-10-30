import { SearchCategoryHistoryAPI } from 'api/SearchCategoryHistoryAPI';
import RippleButton from 'components/common/RippleButton';
import { Link } from 'expo-router';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import { RecipeDB } from 'types/database';
import { RecipeIngredient } from 'types/recipe';
import { HighlightText } from './HighlightText';

interface CategoryProps {
  recipe: RecipeDB;
  ingredient: RecipeIngredient;
  keyword?: string;
}

export function Category({ keyword, ingredient, recipe }: CategoryProps) {
  const isOldVersion = typeof ingredient === 'string';
  const ingredientName = isOldVersion ? ingredient : ingredient.name;

  const pressCategory = () => {
    SearchCategoryHistoryAPI.insert(ingredientName);
  };

  if (isOldVersion || !ingredientName.length) {
    return (
      <View
        key={`${recipe.recipe_name}-${ingredientName}`}
        className="rounded-full bg-neutral-200 px-3 py-1 opacity-60">
        <HighlightText className="text-sm font-semibold" text={ingredientName} keyword={keyword} />
      </View>
    );
  } else {
    return (
      <Link
        key={`${recipe.recipe_name}-${ingredientName}`}
        href={`/(tabs)/explore/searchResult?keyword=${ingredientName}&week=${recipe.week}`}
        asChild>
        <RippleButton
          onPress={pressCategory}
          rippleColor={colors.neutral[300]}
          className="bg-neutral-200 px-3 py-1"
          rounded="full">
          <HighlightText
            className="text-sm font-semibold"
            text={ingredientName}
            keyword={keyword}
          />
        </RippleButton>
      </Link>
    );
  }
}
