import { useQuery } from '@tanstack/react-query';
import { RecipeAPI } from 'api/RecipeAPI';
import ListEmptyText from 'components/common/ListEmptyText';
import RecipeCard from 'components/home/RecipeCard';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import colors from 'tailwindcss/colors';
import { RecipeDB } from 'types/database';
import { getWeekColor } from 'utils/getWeekColor';

const weekTabs = ['1주차', '2주차', '3주차+'];

export default function SavedRecipes() {
  const [selectedWeek, setSelectedWeek] = useState<'1주차' | '2주차' | '3주차+'>('1주차');

  const {
    data: recipes = [],
    isLoading,
    refetch,
  } = useQuery({
    queryFn: async () => await RecipeAPI.selectAllSavedByWeek(parseInt(selectedWeek[0])),
    queryKey: [`savedRecipes-${selectedWeek}`],
  });

  const filledRecipes: (RecipeDB & { isDummy?: true })[] = [...recipes];
  if (recipes.length === 1) {
    filledRecipes.push({ ...recipes[0], isDummy: true });
  }

  const changeSelectedWeek = async (week: typeof selectedWeek) => {
    setSelectedWeek(week);
    await refetch();
  };

  return (
    <SafeAreaView className="relative flex-1 gap-5 px-5">
      <View className="flex-row justify-around rounded-xl bg-white px-4 py-3">
        {weekTabs.map((week: typeof selectedWeek) => (
          <TouchableOpacity key={week} onPress={() => changeSelectedWeek(week)}>
            <Text
              className={`text-lg font-semibold ${
                selectedWeek === week ? getWeekColor(parseInt(week[0])) : 'text-neutral-400'
              }`}>
              {week}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View className="absolute inset-0 z-50 items-center justify-center">
          <ActivityIndicator size={56} color={colors.emerald[300]} />
        </View>
      ) : (
        <FlatList
          data={filledRecipes}
          numColumns={2}
          className="mb-10 rounded-xl bg-white"
          ListEmptyComponent={
            <ListEmptyText emptyListName="savedRecipes" href={'/(tabs)/home/recipeCreation/low'} />
          }
          contentContainerClassName={`items-start gap-4 py-4 flex-grow mx-auto ${recipes.length === 0 ? 'justify-center' : 'justify-start'}`}
          columnWrapperClassName="justify-start gap-4"
          renderItem={({ item }) =>
            item.isDummy ? <View className="h-48 w-48" /> : <RecipeCard {...item} />
          }
        />
      )}
    </SafeAreaView>
  );
}
