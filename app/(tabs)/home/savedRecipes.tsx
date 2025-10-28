import { useQuery } from '@tanstack/react-query';
import { RecipeAPI } from 'api/RecipeAPI';
import ListEmptyText from 'components/common/ListEmptyText';
import { SafeAreaViewWithNav } from 'components/common/SafeAreaViewWithNav';
import { Text } from 'components/common/Text';
import { RecipeCard } from 'components/home/RecipeCard';
import { RECIPE_FILTERS, RecipeFilterType } from 'const/filter';
import { QueryKey } from 'const/queryKey';
import { RECIPE_SORTS, RecipeSortType } from 'const/sort';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, TouchableOpacity, View } from 'react-native';
import { useSavedRecipeStore } from 'stores/savedRecipeStore';
import colors from 'tailwindcss/colors';
import { RecipeDB } from 'types/database';
import { Week } from 'types/week';
import { getWeekColor } from 'utils/getWeekColor';
import { Sort } from '../../../components/common/Sort';
import RippleButton from 'components/common/RippleButton';

const weekTabs = ['1주차', '2주차', '3주차+'] satisfies Week[];

export default function SavedRecipes() {
  const [selectedWeek, setSelectedWeek] = useState<Week>('1주차');
  const [refreshing, setRefreshing] = useState(false);

  const filter = useSavedRecipeStore((state) => state.filter);
  const sort = useSavedRecipeStore((state) => state.sort);
  const setFilter = useSavedRecipeStore((state) => state.setFilter);
  const setSort = useSavedRecipeStore((state) => state.setSort);

  const {
    data: recipes = [],
    isLoading,
    refetch,
  } = useQuery({
    queryFn: async () => await RecipeAPI.selectAllSavedByWeek(parseInt(selectedWeek[0])),
    queryKey: [QueryKey.savedRecipes, selectedWeek, filter, sort],
    staleTime: Infinity,
  });

  const filledRecipes: (RecipeDB & { isDummy?: true })[] = [...recipes];
  if (recipes.length === 1) {
    filledRecipes.push({ ...recipes[0], isDummy: true });
  }

  const changeSelectedWeek = async (week: Week) => {
    setSelectedWeek(week);
  };

  const changeFilter = async (filter: RecipeFilterType) => {
    setFilter(filter);
  };
  const changeSort = async (sort: RecipeSortType) => {
    setSort(sort);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <SafeAreaViewWithNav className="relative flex-1 gap-5 px-5">
      <View className="flex-row justify-around rounded-xl bg-white px-4 py-3">
        {weekTabs.map((week: Week, index: number) => (
          <View
            key={week}
            className={`flex-1 items-center ${
              index !== weekTabs.length - 1 ? 'border-r-2 border-neutral-100' : ''
            }`}>
            <TouchableOpacity onPress={() => changeSelectedWeek(week)}>
              <Text
                className={`text-lg font-semibold ${
                  selectedWeek === week ? getWeekColor(parseInt(week[0])) : 'text-neutral-400'
                }`}>
                {week}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View className="mb-10 flex-1 rounded-xl bg-white p-4">
        <View className="mb-4 flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            {RECIPE_FILTERS.map((filterName) => {
              const isActive = filter === filterName;
              return (
                <RippleButton
                  key={filterName}
                  onPress={() => changeFilter(filterName)}
                  className={`px-3 py-2 ${isActive ? 'bg-green-600' : 'bg-neutral-200'}`}>
                  <Text className={isActive ? 'text-white' : 'text-neutral-500'}>{filterName}</Text>
                </RippleButton>
              );
            })}
          </View>
          <Sort currentOption={sort} onOptionPress={changeSort} options={RECIPE_SORTS} />
        </View>

        {isLoading ? (
          <View className="absolute inset-0 z-50 items-center justify-center">
            <ActivityIndicator size={56} color={colors.emerald[300]} />
          </View>
        ) : (
          <FlatList
            data={filledRecipes}
            numColumns={2}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
            ListEmptyComponent={
              <ListEmptyText
                emptyListName="savedRecipes"
                href={'/(tabs)/home/recipeCreation/low'}
              />
            }
            contentContainerClassName={`items-start gap-4 py-4 flex-grow mx-auto ${recipes.length === 0 ? 'justify-center' : 'justify-start'}`}
            columnWrapperClassName="justify-start gap-4"
            renderItem={({ item }) =>
              item.isDummy ? <View className="h-48 w-48" /> : <RecipeCard {...item} />
            }
          />
        )}
      </View>
    </SafeAreaViewWithNav>
  );
}
