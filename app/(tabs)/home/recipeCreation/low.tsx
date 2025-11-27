import { createRecipe } from 'api/gemini';
import { CustomSelect } from 'components/common/CustomSelect';
import RippleButton from 'components/common/RippleButton';
import { SafeAreaViewWithNav } from 'components/common/SafeAreaViewWithNav';
import { SearchInput } from 'components/common/SearchInput';
import { Text } from 'components/common/Text';
import { IngredientRequest } from 'components/recipeCreation/IngredientRequest';
import Ingredients, { IngredientsProps } from 'components/recipeCreation/Ingredients';
import Loading from 'components/recipeCreation/Loading';
import SelectedIngredient from 'components/recipeCreation/SelectedIngredient';
import { Tip } from 'components/recipeCreation/Tip';
import { allIngredientsList } from 'const/ingredients';
import { QueryKey } from 'const/queryKey';
import { disassemble, getChoseong } from 'es-hangul';
import { Link, router } from 'expo-router';
import { useSelect } from 'hooks/useSelect';
import { useSelectedIngredients } from 'hooks/useSelectedIngredients';
import { queryClient } from 'lib/queryClient';
import { useEffect, useRef, useState } from 'react';
import { FlatList, TouchableHighlight, TouchableOpacity, View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { RecipeCategory, RecipeMethod } from 'types/recipe';
import { getWeekAndDay } from 'utils/date';
import { isCompletedHangul } from 'utils/hangul';

export default function LowRecipeCreationScreen() {
  const {
    selectedIngredients,
    resetIngredients,
    isLoading: isIngredientsLoading,
  } = useSelectedIngredients({ type: 'low' });

  const [category, toggleCategory] = useSelect<RecipeCategory>(null);
  const [method, toggleMethod] = useSelect<RecipeMethod>(null);

  const [keyword, setKeyword] = useState('');
  const [isRecipeLoading, setIsRecipeLoading] = useState(false);
  const controller = useRef<AbortController>(null);

  const [resetTrigger, setResetTrigger] = useState(false);

  const getUserWeek = () => {
    const startDate = useUserStore.getState().start_date;
    const { week: userWeek } = getWeekAndDay(startDate);

    return userWeek;
  };

  const getSearchedIngredients = (item: IngredientsProps) =>
    item.ingredientList.filter((ingredient) => {
      const { name: ingredientName, subKeywords: ingredientSubKeywords } = ingredient;
      const trimmedKeyword = keyword.trim();

      const disassembledIngredient = disassemble(ingredientName);
      const disassembledKeyword = disassemble(trimmedKeyword);
      const isIncludeKeyword = disassembledIngredient.includes(disassembledKeyword);

      if (isCompletedHangul(trimmedKeyword)) {
        const isIncludeSubKeyword = ingredientSubKeywords?.some(
          (ingredientKeyword) => ingredientKeyword === trimmedKeyword
        );
        return isIncludeKeyword || isIncludeSubKeyword;
      } else {
        const ingredientChoseong = getChoseong(ingredientName);
        const keywordChoseong = getChoseong(trimmedKeyword);
        const isIncludeChoseong = ingredientChoseong.includes(keywordChoseong);

        return isIncludeKeyword || isIncludeChoseong;
      }
    });

  const createRecipeWithAI = async () => {
    const ingredients = selectedIngredients.map((ingredients) => ingredients.name).join(', ');

    const userWeek = getUserWeek();
    const availableWeek = Math.min(userWeek, 4);
    const recipeWeek = Math.min(userWeek, 3);

    const command =
      selectedIngredients.length === 0
        ? `Based on the following information, please find a delicious low-carb recipe that can be eaten during Switch-On week ${availableWeek}. You may freely use sauces or seasonings. ${category ? `\nCooking category: ${category}` : ''} ${method ? `\nCooking method: ${method}` : ''}`
        : `Based on the following information, please create a low-carb recipe that can be eaten during Switch-On week ${availableWeek}. You must use only the ingredients listed below, and if possible, use all of them. You may freely use sauces or seasonings. \nIngredients: ${ingredients} ${category ? `\nCooking category: ${category}` : ''} ${method ? `\nCooking method: ${method}` : ''}`;

    controller.current = new AbortController();

    const recipe = await createRecipe({
      command,
      week: recipeWeek,
      isZeroCarb: false,
      signal: controller.current.signal,
    });
    if (!recipe) return null;

    queryClient.removeQueries({ queryKey: [QueryKey.recentRecipes] });
    return recipe;
  };

  const handleCreateRecipe = async () => {
    setIsRecipeLoading(true);

    const recipe = await createRecipeWithAI();
    if (recipe) {
      router.push(`/recipeDetail?recipe=${JSON.stringify(recipe)}`);
    }

    setIsRecipeLoading(false);
  };

  const handleReset = () => {
    resetIngredients();
    setResetTrigger((prev) => !prev);
  };

  useEffect(() => {
    return () => controller.current?.abort();
  }, []);

  return (
    <SafeAreaViewWithNav className="relative flex-1 bg-white px-5">
      <View className="mb-8 w-full gap-3">
        <SearchInput keyword={keyword} onChangeText={setKeyword} placeholder="재료를 검색하세요!" />
        <FlatList
          contentContainerClassName="gap-2"
          ListEmptyComponent={<SelectedIngredient />}
          data={selectedIngredients}
          renderItem={({ item }) => <SelectedIngredient ingredient={item} />}
          horizontal
          showsHorizontalScrollIndicator={false}
        />
        <Text className="ml-1 text-sm">
          <Text className="font-bold text-amber-500">최대 10개</Text>까지 재료를 선택할 수 있어요!
        </Text>
      </View>
      <FlatList
        className="mb-4 flex-1"
        contentContainerClassName="gap-6"
        data={allIngredientsList}
        extraData={resetTrigger ? 'reset-1' : 'reset-0'}
        ListHeaderComponent={() => <IngredientRequest />}
        renderItem={({ item }) => (
          <Ingredients
            title={item.title}
            week={item.week}
            ingredientList={getSearchedIngredients(item)}
          />
        )}
      />

      <View className="mb-4 gap-4">
        <View className="flex-row gap-3">
          <CustomSelect
            title="요리 카테고리"
            options={['한식', '양식', '중식', '일식']}
            onSelect={toggleCategory}
            selectedValue={category}
            itemBgColor="bg-amber-50"
            bgColor="bg-amber-500"
            itemTextColor="text-amber-500"
            borderColor="border-amber-500"
            rippleColor={colors.amber[600]}
          />
          <CustomSelect
            title="요리 방식"
            options={['샐러드류', '구이류', '볶음류', '덮밥류', '탕/국류', '찜류']}
            onSelect={toggleMethod}
            selectedValue={method}
            itemBgColor="bg-amber-50"
            bgColor="bg-amber-500"
            itemTextColor="text-amber-500"
            borderColor="border-amber-500"
            rippleColor={colors.amber[600]}
          />
        </View>

        <View className="w-full flex-row gap-2">
          <TouchableOpacity
            className="flex-[3.5] items-center justify-center rounded-lg border border-amber-500 py-4"
            onPress={handleReset}
            disabled={isRecipeLoading}>
            <Text className="text-lg font-semibold text-amber-500">재료 리셋</Text>
          </TouchableOpacity>
          <TouchableHighlight
            className="flex-[6.5] items-center justify-center rounded-lg bg-amber-500 py-4"
            underlayColor={colors.amber[600]}
            onPress={handleCreateRecipe}
            disabled={isRecipeLoading}>
            <Text className="text-lg font-semibold text-white">
              {selectedIngredients.length > 0 ? '레시피 제작' : `랜덤 레시피 제작`}
            </Text>
          </TouchableHighlight>
        </View>
      </View>

      {(isIngredientsLoading || isRecipeLoading) && (
        <View className="absolute inset-0 z-50 items-center justify-center">
          <View className="absolute inset-0 bg-black/40" />
          <View className="translate-y-8">
            <Loading />
            <Link href={'/(tabs)/explore'} asChild>
              <RippleButton outerClassName="bg-white self-center mb-6" className="px-4 py-2.5">
                <Text className="text-green-600">다른 레시피 둘러보기</Text>
              </RippleButton>
            </Link>
            <Tip />
          </View>
        </View>
      )}
    </SafeAreaViewWithNav>
  );
}
