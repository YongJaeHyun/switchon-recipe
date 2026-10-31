import { Text } from 'components/common/Text';
import { useLastPathname } from 'hooks/useLastPathname';
import { useSelectedIngredients } from 'hooks/useSelectedIngredients';
import { FlatList, View } from 'react-native';
import { RecipeType } from 'types/database';
import { Ingredient as IngredientType } from 'types/recipe';
import { chunkArray } from 'utils/chunkArray';
import { getWeekColor } from 'utils/getWeekColor';
import Ingredient from './Ingredient';

export interface IngredientsProps {
  title: string;
  week: number;
  ingredientList: IngredientType[];
}

interface IngredientsSectionProps extends IngredientsProps {
  // 화면에서 고른 주차. 이보다 높은 주차 재료는 잠근다
  selectableWeek: number;
}

export default function Ingredients({
  title,
  week,
  ingredientList,
  selectableWeek,
}: IngredientsSectionProps) {
  const type = useLastPathname() as RecipeType;

  const { selectedIngredients } = useSelectedIngredients({ type });
  const chunkedList = chunkArray(ingredientList, week === 1 ? 3 : 2);

  return (
    <View className="gap-3">
      <Text className={`text-2xl font-bold ${getWeekColor(week)}`}>{title}</Text>
      <FlatList
        data={chunkedList}
        extraData={selectedIngredients.length}
        keyExtractor={(_, index) => `ingredients-${index}`}
        renderItem={({ item }) => (
          <View className="mr-3.5">
            {item.map((ingredient) => (
              <Ingredient
                key={ingredient.name}
                image={ingredient.image}
                name={ingredient.name}
                week={ingredient.week}
                isCarbohydrate={ingredient.isCarbohydrate}
                isSelected={selectedIngredients.some((i) => i.name === ingredient.name)}
                disabled={ingredient.week > selectableWeek}
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
