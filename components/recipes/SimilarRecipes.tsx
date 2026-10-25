import { ImageSkeleton } from 'components/common/ImageSkeleton';
import { Text } from 'components/common/Text';
import { useSimilarRecipes } from 'hooks/useSimilarRecipes';
import { FlatList, View } from 'react-native';
import { RecipeCard } from './RecipeCard';

const SKELETON_COUNT = 3;
// 상세 화면 본문 좌우 여백(스크롤 20 + 본문 12). 가로 목록은 화면 끝까지 닿게 해 옆으로 넘길 수 있다는 게 보이게 한다
const PAGE_INSET = 32;

// 레시피 상세 아래의 비슷한 레시피 (무료). 불러오는 중엔 카드 자리 스켈레톤, 실패·빈 결과면 섹션을 숨긴다
export function SimilarRecipes({ recipeId }: { recipeId: number }) {
  // isLoading: 첫 조회 중 (로그인 전처럼 조회하지 않는 동안은 false라 스켈레톤이 남지 않는다)
  const { data: recipes, isLoading } = useSimilarRecipes(recipeId);

  if (!isLoading && !recipes?.length) return null;

  return (
    <View className="mt-10">
      <Text className="mb-4 text-lg font-bold">비슷한 레시피</Text>
      {isLoading ? (
        <View
          className="h-52 flex-row gap-5 overflow-hidden"
          style={{ marginHorizontal: -PAGE_INSET, paddingHorizontal: PAGE_INSET }}>
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <View key={i} className="h-48 w-48 overflow-hidden rounded-xl">
              <ImageSkeleton />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          className="h-52"
          style={{ marginHorizontal: -PAGE_INSET }}
          data={recipes}
          contentContainerClassName="gap-5"
          contentContainerStyle={{ paddingHorizontal: PAGE_INSET }}
          keyExtractor={(item) => 'SimilarRecipes' + item.id?.toString()}
          renderItem={({ item }) => <RecipeCard {...item} push />}
          showsHorizontalScrollIndicator={false}
          horizontal
        />
      )}
    </View>
  );
}
