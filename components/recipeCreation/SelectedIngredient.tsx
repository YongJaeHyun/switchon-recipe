import { Chip } from 'components/common/Chip';
import { Text } from 'components/common/Text';
import { allIngredients } from 'const/ingredients';
import { useLastPathname } from 'hooks/useLastPathname';
import { useSelectedIngredients } from 'hooks/useSelectedIngredients';
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import colors from 'tailwindcss/colors';
import { RecipeType } from 'types/database';
import { IIngredient } from 'types/recipe';

interface SelectedIngredientProps {
  ingredient?: IIngredient;
}

export default function SelectedIngredient({ ingredient }: SelectedIngredientProps) {
  const type = useLastPathname() as RecipeType;

  const { toggleIngredient } = useSelectedIngredients({ type });

  const isValidIngredient = () =>
    allIngredients.some((ingredientCategory) =>
      ingredientCategory.ingredientList.some((ing) => ing.name === ingredient?.name)
    );

  useEffect(() => {
    if (ingredient && !isValidIngredient()) {
      toggleIngredient(ingredient);
    }
  }, []);

  return ingredient ? (
    <Chip
      key={ingredient.name}
      value={ingredient.name}
      rippleColor={colors.transparent}
      outerClassName={type === 'zero' ? 'border-green-600' : 'border-amber-500'}
      onPress={() => toggleIngredient(ingredient)}
    />
  ) : (
    <Pressable
      className={`flex-row items-center gap-2 rounded-full border px-3 py-2 ${type === 'zero' ? 'border-green-600' : 'border-amber-500'}`}>
      <Text>선택된 재료 표시</Text>
    </Pressable>
  );
}
