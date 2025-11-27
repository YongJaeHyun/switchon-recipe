import { Text } from 'components/common/Text';
import { useLastPathname } from 'hooks/useLastPathname';
import { useSelectedIngredients } from 'hooks/useSelectedIngredients';
import { FlatList, View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { RecipeType } from 'types/database';
import { Ingredient as IngredientType } from 'types/recipe';
import { chunkArray } from 'utils/chunkArray';
import { getWeekAndDay } from 'utils/date';
import { getWeekColor } from 'utils/getWeekColor';
import Ingredient from './Ingredient';

export interface IngredientsProps {
  title: string;
  week: number;
  ingredientList: IngredientType[];
}

export default function Ingredients({ title, week, ingredientList }: IngredientsProps) {
  const type = useLastPathname() as RecipeType;
  const startDate = useUserStore((state) => state.start_date);
  const { week: userWeek } = getWeekAndDay(startDate);

  const { selectedIngredients } = useSelectedIngredients({ type });
  const chunkedList = chunkArray(ingredientList, week === 1 ? 3 : 2);

  return (
    <View className="gap-3">
      <Text className={`text-3xl font-bold ${getWeekColor(week)}`}>{title}</Text>
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
                week={ingredient.week}
                isSelected={selectedIngredients.some((i) => i.name === ingredient.name)}
                disabled={ingredient.week > userWeek}
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
