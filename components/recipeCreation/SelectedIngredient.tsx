import Feather from '@expo/vector-icons/Feather';
import { Pressable, Text, View } from 'react-native';
import { useIngredientStore } from 'stores/ingredientStore';
import { IIngredient } from 'types/recipe';

interface SelectedIngredientProps {
  ingredient?: IIngredient;
}

export default function SelectedIngredient({ ingredient }: SelectedIngredientProps) {
  const toggleIngredient = useIngredientStore((state) => state.toggleIngredient);

  return ingredient ? (
    <Pressable
      key={ingredient.name}
      onPress={() => toggleIngredient(ingredient)}
      className="flex-row items-center gap-2 rounded-full border border-green-600 px-3 py-2">
      <Text>{ingredient.name}</Text>
      <View>
        <Feather name="x" size={16} color="black" />
      </View>
    </Pressable>
  ) : (
    <Pressable className="flex-row items-center gap-2 rounded-full border border-green-600 px-3 py-2">
      <Text>선택된 재료 표시</Text>
    </Pressable>
  );
}
