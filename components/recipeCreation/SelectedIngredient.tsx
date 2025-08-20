import Feather from '@expo/vector-icons/Feather';
import { useLastPathname } from 'hooks/useLastPathname';
import { useSelectedIngredients } from 'hooks/useSelectedIngredients';
import { Pressable, Text, View } from 'react-native';
import { RecipeType } from 'types/database';
import { IIngredient } from 'types/recipe';

interface SelectedIngredientProps {
  ingredient?: IIngredient;
}

export default function SelectedIngredient({ ingredient }: SelectedIngredientProps) {
  const type = useLastPathname() as RecipeType;

  const { toggleIngredient } = useSelectedIngredients({ type });

  return ingredient ? (
    <Pressable
      key={ingredient.name}
      onPress={() => toggleIngredient(ingredient)}
      className={`flex-row items-center gap-2 rounded-full border px-3 py-2 ${type === 'zero' ? 'border-green-600' : 'border-amber-500'}`}>
      <Text>{ingredient.name}</Text>
      <View>
        <Feather name="x" size={16} color="black" />
      </View>
    </Pressable>
  ) : (
    <Pressable
      className={`flex-row items-center gap-2 rounded-full border px-3 py-2 ${type === 'zero' ? 'border-green-600' : 'border-amber-500'}`}>
      <Text>선택된 재료 표시</Text>
    </Pressable>
  );
}
