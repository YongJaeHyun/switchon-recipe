import { FlatList, Text, View } from 'react-native';
import { IngredientProps } from 'types/recipe';
import { chunkArray } from 'utils/chunkArray';
import Ingredient from './Ingredient';

interface IngredientsProps {
  weekNumber: number;
  ingredientList: IngredientProps[];
}

export default function Ingredients({ weekNumber, ingredientList }: IngredientsProps) {
  const chunkedList = chunkArray(ingredientList, 2);

  return (
    <View className="gap-3">
      <Text className="text-3xl font-semibold text-green-500">{weekNumber}주차</Text>
      <FlatList
        data={chunkedList}
        renderItem={({ item }) => (
          <View className="mr-4">
            {item.map((ingredient) => (
              <Ingredient key={ingredient.name} image={ingredient.image} name={ingredient.name} />
            ))}
          </View>
        )}
        showsHorizontalScrollIndicator={false}
        horizontal
      />
    </View>
  );
}
