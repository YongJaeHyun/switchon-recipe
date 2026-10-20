import { Chip } from 'components/common/Chip';
import { Text } from 'components/common/Text';
import { router } from 'expo-router';
import { useRecentKeywords } from 'hooks/useRecentKeywords';
import { ScrollView, View } from 'react-native';
import { requireOnline } from 'utils/network';

export function RecentKeywords() {
  const {
    data: recentKeywords,
    insertKeyword,
    deleteKeyword,
    deleteAllKeywords,
  } = useRecentKeywords();

  const hasRecentKeywords = recentKeywords && recentKeywords.length > 0;

  const search = requireOnline((keyword: string) => {
    insertKeyword(keyword);

    router.push({
      pathname: '/(tabs)/explore/searchResult',
      params: { keyword },
    });
  });

  return (
    <>
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
    </>
  );
}
