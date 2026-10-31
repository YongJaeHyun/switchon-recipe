import MaterialIcons from '@expo/vector-icons/MaterialIcons';
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
import { PassOnlyModal, type PassOnlyModalView } from 'components/common/PassOnlyModal';
import { RecommendView } from 'components/recommend/RecommendView';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { useUserStore } from 'stores/userStore';
import { getWeekAndDay } from 'utils/date';
import { isPassOnSale, shouldShowPremiumEntry } from 'utils/passScreen';
import { useInfiniteRecipeCards } from 'hooks/useInfiniteRecipes';
import { flattenRecipePages } from 'utils/recipePages';
import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { RecipeCardData } from 'types/recipe';

const WEEK_TABS = ['1주차', '2주차', '3주차+'] as const;
const RECOMMEND_TAB = '추천';

type ExploreTab = typeof RECOMMEND_TAB | 1 | 2 | 3;

// 앱을 켜 둔 동안 마지막으로 고른 탭 (추천을 즐겨 쓰면 다시 열어도 추천부터)
let lastExploreTab: ExploreTab | null = null;

const renderRecipeItem = ({ item }: { item: RecipeCardData }) => {
  return <RecipeCard {...item} />;
};

export default function ExploreScreen() {
  const { status } = usePass();
  const billingAvailable = useBillingAvailable();
  const startDate = useUserStore((state) => state.start_date);
  const showRecommend = shouldShowPremiumEntry(status, billingAvailable);
  const hasAccess = status?.hasAccess === true;
  // 처음엔 내 주차 탭 (3주차 이후는 3주차+). 추천은 패스 없는 사람이 잠긴 화면부터 보지 않게 기본으로 열지 않는다
  const [tab, setTab] = useState<ExploreTab>(
    () => lastExploreTab ?? (Math.min(Math.max(getWeekAndDay(startDate).week, 1), 3) as 1 | 2 | 3)
  );
  const [passModal, setPassModal] = useState<PassOnlyModalView | null>(null);
  const tabItems = showRecommend ? [RECOMMEND_TAB, ...WEEK_TABS] : [...WEEK_TABS];
  const shownTab: ExploreTab = tab === RECOMMEND_TAB && !showRecommend ? 1 : tab;
  const tabIndex = shownTab === RECOMMEND_TAB ? 0 : shownTab - (showRecommend ? 0 : 1);
  const isRecommend = shownTab === RECOMMEND_TAB;

  const selectTab = (index: number) => {
    const next: ExploreTab = showRecommend
      ? index === 0
        ? RECOMMEND_TAB
        : (index as 1 | 2 | 3)
      : ((index + 1) as 1 | 2 | 3);
    // 추천은 패스 기능: 패스가 없으면 탭을 바꾸지 않고 "패스 기능이에요" 창으로 묻는다
    if (next === RECOMMEND_TAB && !hasAccess) {
      setPassModal({
        feature: '맞춤 레시피 추천',
        description: '먹고 싶은 걸 고르면 지금 주차에 맞는 레시피를 골라 드려요',
        canBuy: isPassOnSale(status?.sales, billingAvailable),
      });
      return;
    }
    lastExploreTab = next;
    setTab(next);
  };
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<RecipeFilterType>('전체');
  const [sort, setSort] = useState<RecipeSortType>('최신순');

  const week = isRecommend ? 1 : (shownTab as number);

  const {
    data: recipes,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteRecipeCards({ week, sortType: sort, filterType: filter });
  // 목록은 5분 동안 다시 받지 않으므로(useInfiniteRecipeCards), 새 레시피는 당겨서 새로고침으로 본다
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const flattenedRecipes = useMemo(() => flattenRecipePages(recipes?.pages), [recipes]);

  return (
    <SafeAreaViewWithNav className="flex-1 bg-neutral-50">
      <Text className="mt-4 px-5 text-2xl font-bold">탐색</Text>
      <Link href={'/(tabs)/explore/search'} className="px-5">
        <View className="w-full">
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
        <Tabs
          tabItems={tabItems}
          onSelect={selectTab}
          selectedIndex={tabIndex}
          // 추천 탭은 패스 기능: 패스가 있으면 다이아, 없으면 자물쇠
          accessory={(index) =>
            showRecommend && index === 0 ? (
              <MaterialIcons
                name={hasAccess ? 'diamond' : 'lock'}
                size={14}
                color={colors.green[600]}
              />
            ) : null
          }
        />
      </View>

      {isRecommend ? (
        <RecommendView embedded />
      ) : (
        <>
          <View className="flex-row items-center justify-between px-5 py-3">
            <Filter currentOption={filter} onOptionPress={setFilter} options={RECIPE_FILTERS} />
            <Sort currentOption={sort} onOptionPress={setSort} options={RECIPE_SORTS} />
          </View>

          {isLoading ? (
            // 화면 전체를 덮는 로딩 표시라 터치를 막지 않게 한다 (로딩 중에도 검색창·탭·필터를 누를 수 있게)
            <View
              pointerEvents="none"
              className="absolute inset-0 z-50 items-center justify-center">
              <ActivityIndicator size={56} color={colors.emerald[300]} />
            </View>
          ) : (
            <FlashList
              contentContainerStyle={{ padding: 20 }}
              ItemSeparatorComponent={() => <View style={{ height: 20 }} />}
              data={flattenedRecipes}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              ListFooterComponent={
                isFetchingNextPage ? (
                  <ActivityIndicator size={32} color={colors.emerald[300]} />
                ) : null
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
        </>
      )}
      <PassOnlyModal view={passModal} onClose={() => setPassModal(null)} />
    </SafeAreaViewWithNav>
  );
}
