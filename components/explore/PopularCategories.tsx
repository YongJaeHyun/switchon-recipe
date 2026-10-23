import { SearchCategoryHistoryAPI } from 'api/SearchCategoryHistoryAPI';
import { Chip } from 'components/common/Chip';
import { Text } from 'components/common/Text';
import { QueryKey } from 'const/queryKey';
import { router } from 'expo-router';
import { useQueryWith402Retry } from 'hooks/useCustomQuery';
import { View } from 'react-native';
import { Nullable } from '../../types/common';
import { requireOnline } from 'utils/network';

export function PopularCategories() {
  const { data: popularCategories } = useQueryWith402Retry({
    queryKey: [QueryKey.popularCategories],
    queryFn: SearchCategoryHistoryAPI.getPopularCategories,
    staleTime: 60 * 60 * 1000, // 1시간
  });

  const search = requireOnline((keyword: Nullable<string>) => {
    if (!keyword) return;

    router.push({
      pathname: '/(tabs)/explore/searchResult',
      params: { keyword },
    });
  });

  return (
    <>
      <Text className="mt-4 font-bold">인기 카테고리</Text>
      <View className="mt-4 flex-row flex-wrap gap-2">
        {popularCategories?.length === 0 ? (
          <Chip
            value={'카테고리 기록이 아직 없어요 🔍'}
            outerClassName="border-neutral-300 bg-neutral-100"
            showDeleteIcon={false}
          />
        ) : (
          popularCategories?.map((category) => (
            <Chip
              key={`category-${category.value}`}
              onPress={() => search(category.value)}
              value={category.value}
              outerClassName="border-neutral-300 bg-green-100"
              className="text-green-600"
              showDeleteIcon={false}
            />
          ))
        )}
      </View>
    </>
  );
}
