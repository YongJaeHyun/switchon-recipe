import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import ListEmptyText from 'components/common/ListEmptyText';
import { Text } from 'components/common/Text';
import { Link } from 'expo-router';
import { ActivityIndicator, FlatList, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { RecipeDB } from 'types/database';
import { RecipeCard } from './RecipeCard';

interface SavedRecipesProps {
  recipes: RecipeDB[];
  refreshing: boolean;
}

export default function SavedRecipes({ recipes, refreshing }: SavedRecipesProps) {
  return (
    <View className="">
      <View className="mb-6 flex-row items-center justify-between">
        <Text className="text-2xl font-bold">저장한 레시피</Text>
        <Link href={'/(tabs)/home/savedRecipes'}>
          <View className="flex-row items-center">
            <Text className="text-neutral-500">모두보기</Text>
            <MaterialIcons name="keyboard-arrow-right" size={20} color={colors.neutral[500]} />
          </View>
        </Link>
      </View>

      {refreshing ? (
        <ActivityIndicator className="h-48" size="large" color={colors.green[500]} />
      ) : (
        <FlatList
          className="h-52"
          data={recipes}
          contentContainerClassName={`gap-5 flex-grow ${recipes?.length === 0 ? 'justify-center' : 'justify-start'}`}
          keyExtractor={(item) => 'SavedRecipes' + item.id.toString()}
          renderItem={({ item }) => <RecipeCard {...item} />}
          ListEmptyComponent={
            <ListEmptyText href={'/(tabs)/home/recipeCreation/low'} emptyListName="savedRecipes" />
          }
          showsHorizontalScrollIndicator={false}
          horizontal
        />
      )}
    </View>
  );
}
