import { SearchCategoryHistoryAPI } from 'api/SearchCategoryHistoryAPI';
import { Chip } from 'components/common/Chip';
import { Text } from 'components/common/Text';
import { QueryKey } from 'const/queryKey';
import { router } from 'expo-router';
import { useQueryWith402Retry } from 'hooks/useCustomQuery';
import { View } from 'react-native';
import { Nullable } from '../../types/common';
import { requireOnline } from 'utils/network';
import { uniqueSearchKeywords } from 'utils/searchKeyword';

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
          // 예전에 괄호 설명째 기록된 값('식용유 (코코넛 오일 …)')도 검색어로 정리해 보여준다
          uniqueSearchKeywords(
            (popularCategories ?? []).flatMap((category) =>
              category.value ? [category.value] : []
            )
          ).map((keyword) => (
            <Chip
              key={`category-${keyword}`}
              onPress={() => search(keyword)}
              value={keyword}
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
