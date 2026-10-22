import { SafeAreaViewWithNav } from 'components/common/SafeAreaViewWithNav';
import { Text } from 'components/common/Text';
import { Link } from 'expo-router';

// 임시 자리: 레시피 탭 내용은 다음 작업에서 채운다
export default function RecipesScreen() {
  return (
    <SafeAreaViewWithNav className="flex-1 gap-4 bg-neutral-50 px-5 pt-5">
      <Text className="text-center text-lg font-bold">레시피</Text>
      <Link href={'/(tabs)/recipes/recipeCreation/zero'}>
        <Text className="text-green-600">무탄수 레시피 만들기</Text>
      </Link>
      <Link href={'/(tabs)/recipes/recipeCreation/low'}>
        <Text className="text-green-600">저탄수 레시피 만들기</Text>
      </Link>
      <Link href={'/(tabs)/recipes/savedRecipes'}>
        <Text className="text-green-600">저장한 레시피</Text>
      </Link>
      <Link href={'/(tabs)/recipes/explore'}>
        <Text className="text-green-600">다른 사람들의 레시피 둘러보기</Text>
      </Link>
    </SafeAreaViewWithNav>
  );
}
