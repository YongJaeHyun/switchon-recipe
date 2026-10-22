import { MaterialIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { Filter } from 'components/common/Filter';
import ListEmptyText from 'components/common/ListEmptyText';
import { SafeAreaViewWithNav } from 'components/common/SafeAreaViewWithNav';
import { Sort } from 'components/common/Sort';
import { RecipeCard } from 'components/explore/RecipeCard';
import { SearchInputWithoutBorder } from 'components/explore/SearchInputWithoutBorder';
import { Tabs } from 'components/explore/Tabs';
import { RECIPE_FILTERS, RecipeFilterType } from 'const/filter';
import { RECIPE_SORTS, RecipeSortType } from 'const/sort';
import { router, useLocalSearchParams } from 'expo-router';
import { useInfiniteRecipeCards } from 'hooks/useInfiniteRecipes';
import { useRecentKeywords } from 'hooks/useRecentKeywords';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import colors from 'tailwindcss/colors';

type SearchParamsProps = {
  keyword: string;
  week?: string;
};

const TABS = ['1주차', '2주차', '3주차+'] as const;

export default function SearchScreen() {
  const { keyword: keywordProp, week: weekProp = '1' } = useLocalSearchParams<SearchParamsProps>();

  const [tabIndex, setTabIndex] = useState(Number(weekProp) - 1);
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
  } = useInfiniteRecipeCards({ week, keyword: keywordProp, sortType: sort, filterType: filter });
  const { insertKeyword } = useRecentKeywords();

  const flattenedRecipes = useMemo(() => recipes?.pages.flatMap((page) => page) ?? [], [recipes]);

  const onSubmitEditing = () => {
    const trimmedKeyword = keyword.trim();
    console.log('searched');
    insertKeyword(trimmedKeyword);

    router.setParams({ keyword: trimmedKeyword, week });
  };

  useEffect(() => {
    setKeyword(keywordProp);
  }, [keywordProp]);

  return (
    <SafeAreaViewWithNav className="flex-1 bg-neutral-50 ">
      <View className="w-full flex-row items-center gap-3 px-5">
        <MaterialIcons name="arrow-back" size={24} />
        <SearchInputWithoutBorder
          keyword={keyword}
          onChangeText={setKeyword}
          onSubmitEditing={onSubmitEditing}
        />
      </View>

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
      ) : flattenedRecipes.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ListEmptyText emptyListName="searchResults" />
        </View>
      ) : (
        <FlashList
          contentContainerStyle={{ padding: 20 }}
          ItemSeparatorComponent={() => <View style={{ height: 20 }} />}
          data={flattenedRecipes}
          ListFooterComponent={
            isFetchingNextPage ? <ActivityIndicator size={32} color={colors.emerald[300]} /> : null
          }
          onEndReachedThreshold={0.9}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          renderItem={({ item }) => <RecipeCard keyword={keywordProp} {...item} />}
        />
      )}
    </SafeAreaViewWithNav>
  );
}
