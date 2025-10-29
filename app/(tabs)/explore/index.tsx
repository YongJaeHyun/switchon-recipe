import { FlashList } from '@shopify/flash-list';
import { Filter } from 'components/common/Filter';
import { SafeAreaViewWithNav } from 'components/common/SafeAreaViewWithNav';
import { SearchInput } from 'components/common/SearchInput';
import { Sort } from 'components/common/Sort';
import { Text } from 'components/common/Text';
import { RecipeCard } from 'components/explore/RecipeCard';
import { Tabs } from 'components/explore/Tabs';
import { RECIPE_FILTERS, RecipeFilterType } from 'const/filter';
import { RECIPE_SORTS, RecipeSortType } from 'const/sort';
import { Link } from 'expo-router';
import { useInfiniteRecipeCards } from 'hooks/useInfiniteRecipes';
import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { RecipeDB } from 'types/database';

const TABS = ['1주차', '2주차', '3주차+'] as const;

const renderRecipeItem = ({ item }: { item: RecipeDB }) => {
  return <RecipeCard {...item} />;
};

export default function ExploreScreen() {
  const [tabIndex, setTabIndex] = useState(0);
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<RecipeFilterType>('전체');
  const [sort, setSort] = useState<RecipeSortType>('최신순');

  const week = tabIndex + 1;

  const {
    data: recipes,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteRecipeCards({ week, sortType: sort, filterType: filter });

  const flattenedRecipes = useMemo(() => recipes?.pages.flatMap((page) => page) ?? [], [recipes]);

  return (
    <SafeAreaViewWithNav className="flex-1 bg-neutral-50 ">
      <Link href={'/(tabs)/explore/search'} className="px-5">
        <View className="w-full">
          <Text className="pt-5 text-center text-lg font-bold">탐색</Text>
          <SearchInput
            keyword={keyword}
            onChangeText={setKeyword}
            className="my-4"
            placeholder="다른 레시피들을 둘러보세요!"
            editable={false}
            selectTextOnFocus={false}
          />
        </View>
      </Link>

      <View className="h-14 px-5">
        <Tabs tabItems={TABS} onSelect={setTabIndex} selectedIndex={tabIndex} />
      </View>

      <View className="flex-row items-center justify-between px-5 py-3">
        <Filter currentOption={filter} onOptionPress={setFilter} options={RECIPE_FILTERS} />
        <Sort currentOption={sort} onOptionPress={setSort} options={RECIPE_SORTS} />
      </View>

      {isLoading ? (
        <View className="absolute inset-0 z-50 items-center justify-center">
          <ActivityIndicator size={56} color={colors.emerald[300]} />
        </View>
      ) : (
        <FlashList
          contentContainerStyle={{ paddingHorizontal: 20 }}
          ItemSeparatorComponent={() => <View style={{ height: 20 }} />}
          data={flattenedRecipes}
          ListFooterComponent={
            isFetchingNextPage ? <ActivityIndicator size={32} color={colors.emerald[300]} /> : null
          }
          onEndReachedThreshold={0.9}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }}
          renderItem={renderRecipeItem}
        />
      )}
    </SafeAreaViewWithNav>
  );
}
