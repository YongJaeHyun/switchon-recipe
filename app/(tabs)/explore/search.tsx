import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useQuery } from '@tanstack/react-query';
import { SearchCategoryHistoryAPI } from 'api/SearchCategoryHistoryAPI';
import { SafeAreaViewWithNav } from 'components/common/SafeAreaViewWithNav';
import { PopularCategories } from 'components/explore/PopularCategories';
import { SearchInputWithoutBorder } from 'components/explore/SearchInputWithoutBorder';
import { QueryKey } from 'const/queryKey';
import { router } from 'expo-router';
import { useRecentKeywords } from 'hooks/useRecentKeywords';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { RecentKeywords } from '../../../components/explore/RecentKeywords';

export default function SearchScreen() {
  const { isLoading: isLoadingRecentKeywords, insertKeyword } = useRecentKeywords();

  const { isLoading: isLoadingPopularCategories } = useQuery({
    queryKey: [QueryKey.popularCategories],
    queryFn: SearchCategoryHistoryAPI.getPopularCategories,
    staleTime: 60 * 60 * 1000, // 1시간
  });

  const [keyword, setKeyword] = useState('');

  const isLoading = isLoadingRecentKeywords || isLoadingPopularCategories;

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

      {isLoading ? (
        <View className="absolute inset-0 z-50 items-center justify-center">
          <ActivityIndicator size={56} color={colors.emerald[300]} />
        </View>
      ) : (
        <View>
          <RecentKeywords />
          <PopularCategories />
        </View>
      )}
    </SafeAreaViewWithNav>
  );
}
