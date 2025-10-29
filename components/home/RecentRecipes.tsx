import ListEmptyText from 'components/common/ListEmptyText';
import { Text } from 'components/common/Text';
import { ActivityIndicator, FlatList, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { RecipeDB } from 'types/database';
import { RecipeCard } from './RecipeCard';

interface RecentRecipesProps {
  recipes: RecipeDB[];
  refreshing: boolean;
}

export default function RecentRecipes({ recipes, refreshing }: RecentRecipesProps) {
  return (
    <View className="">
      <Text className="mb-1 text-2xl font-bold">최근 만든 레시피</Text>
      <Text className="mb-6 text-neutral-500">
        저장하지 않은 레시피는 한 달이 지나면 자동으로 삭제돼요.
      </Text>
      {refreshing ? (
        <ActivityIndicator className="h-48" size="large" color={colors.green[500]} />
      ) : (
        <FlatList
          className="h-52"
          data={recipes}
          contentContainerClassName={`gap-5 flex-grow ${recipes.length === 0 ? 'justify-center' : 'justify-start'}`}
          keyExtractor={(item) => 'RecentRecipes' + item.id.toString()}
          renderItem={({ item }) => <RecipeCard {...item} />}
          ListEmptyComponent={
            <ListEmptyText href={'/(tabs)/home/recipeCreation/low'} emptyListName="recentRecipes" />
          }
          showsHorizontalScrollIndicator={false}
          horizontal
        />
      )}
    </View>
  );
}
