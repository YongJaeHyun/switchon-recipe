import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useQuery } from '@tanstack/react-query';
import { SearchCategoryHistoryAPI } from 'api/SearchCategoryHistoryAPI';
import { Chip } from 'components/common/Chip';
import { SafeAreaViewWithNav } from 'components/common/SafeAreaViewWithNav';
import { Text } from 'components/common/Text';
import { SearchInputWithoutBorder } from 'components/explore/SearchInputWithoutBorder';
import { QueryKey } from 'const/queryKey';
import { router } from 'expo-router';
import { useRecentKeywords } from 'hooks/useRecentKeywords';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

export default function SearchScreen() {
  const {
    data: recentKeywords,
    insertKeyword,
    deleteKeyword,
    deleteAllKeywords,
  } = useRecentKeywords();
  const { data: popularCategories } = useQuery({
    queryKey: [QueryKey.popularCategories],
    queryFn: SearchCategoryHistoryAPI.getPopularCategories,
    staleTime: 60 * 60 * 1000, // 1시간
  });

  const [keyword, setKeyword] = useState('');

  const hasRecentKeywords = recentKeywords && recentKeywords.length > 0;

  const search = (keyword: string) => {
    insertKeyword(keyword);

    router.push({
      pathname: '/(tabs)/explore/searchResult',
      params: { keyword },
    });
  };

  const onSubmitEditing = () => {
    const trimmedKeyword = keyword.trim();
    setKeyword('');

    search(trimmedKeyword);
  };

  return (
    <SafeAreaViewWithNav className="flex-1 bg-neutral-50 px-5">
      <View className="flex-row items-center gap-3">
        <MaterialIcons name="arrow-back" size={24} />
        <SearchInputWithoutBorder
          keyword={keyword}
          onChangeText={setKeyword}
          onSubmitEditing={onSubmitEditing}
          autoFocus
        />
      </View>

      <View className="flex-row items-center justify-between py-3">
        <Text className="font-bold">최근 검색어</Text>
        {hasRecentKeywords && (
          <Text className="text-sm text-neutral-500" onPress={() => deleteAllKeywords()}>
            전체 삭제
          </Text>
        )}
      </View>

      <ScrollView
        className="flex-grow-0"
        contentContainerClassName="gap-2 py-2"
        showsHorizontalScrollIndicator={false}
        horizontal>
        {!hasRecentKeywords ? (
          <Chip
            value={'검색 기록이 아직 없어요 🔍'}
            outerClassName="border-neutral-300"
            showDeleteIcon={false}
          />
        ) : (
          recentKeywords.map((keyword) => (
            <Chip
              key={`keyword-${keyword.id}`}
              value={keyword.value ?? ''}
              onPress={() => search(keyword.value)}
              onDelete={() => deleteKeyword(keyword.id)}
              outerClassName="border-neutral-300"
            />
          ))
        )}
      </ScrollView>

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
    </SafeAreaViewWithNav>
  );
}
