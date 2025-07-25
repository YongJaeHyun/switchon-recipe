import { FlatList, Text, View } from 'react-native';
import { useIngredientStore } from 'stores/ingredientStore';
import { IIngredient } from 'types/recipe';
import { chunkArray } from 'utils/chunkArray';
import { getWeekColor } from 'utils/getWeekColor';
import Ingredient from './Ingredient';

export interface IngredientsProps {
  title: string;
  week: number;
  ingredientList: IIngredient[];
}

export default function Ingredients({ title, week, ingredientList }: IngredientsProps) {
  const selectedIngredients = useIngredientStore((state) => state.selectedIngredients);
  const chunkedList = chunkArray(ingredientList, 2);

  return (
    <View className="gap-3">
      <Text className={`text-3xl font-semibold ${getWeekColor(week)}`}>{title}</Text>
      <FlatList
        data={chunkedList}
        extraData={selectedIngredients.length}
        keyExtractor={(_, index) => `ingredients-${index}`}
        renderItem={({ item }) => (
          <View className="mr-4">
            {item.map((ingredient) => (
              <Ingredient
                key={ingredient.name}
                image={ingredient.image}
                name={ingredient.name}
                isSelected={selectedIngredients.some((i) => i.name === ingredient.name)}
              />
            ))}
          </View>
        )}
        showsHorizontalScrollIndicator={false}
        horizontal
      />
    </View>
  );
}
