import { FlatList, Text, View } from 'react-native';
import { useIngredientStore } from 'stores/ingredientStore';
import { IIngredient } from 'types/recipe';
import { chunkArray } from 'utils/chunkArray';
import Ingredient from './Ingredient';

export interface IngredientsProps {
  title: string;
  week: number;
  ingredientList: IIngredient[];
}

export default function Ingredients({ title, week, ingredientList }: IngredientsProps) {
  const selectedIngredients = useIngredientStore((state) => state.selectedIngredients);
  const chunkedList = chunkArray(ingredientList, 2);

  const getColorFromWeek = (week) => {
    if (week === 1) return 'text-green-500';
    else if (week === 2) return 'text-teal-500';
    else if (week === 3) return 'text-blue-500';
    else return;
  };

  return (
    <View className="gap-3">
      <Text className={`text-3xl font-semibold text-green-500 ${getColorFromWeek(week)}`}>
        {title}
      </Text>
      <FlatList
        data={chunkedList}
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
