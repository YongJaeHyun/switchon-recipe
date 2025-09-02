import Ionicons from '@expo/vector-icons/Ionicons';
import { createRecipe } from 'api/gemini';
import { RecipeAPI } from 'api/RecipeAPI';
import { CustomSelect } from 'components/common/CustomSelect';
import { Text } from 'components/common/Text';
import { IngredientRequest } from 'components/recipeCreation/IngredientRequest';
import Ingredients, { IngredientsProps } from 'components/recipeCreation/Ingredients';
import SelectedIngredient from 'components/recipeCreation/SelectedIngredient';
import { allZeroIngredients } from 'const/zeroIngredients';
import { disassemble } from 'es-hangul';
import { router } from 'expo-router';
import { useSelect } from 'hooks/useSelect';
import { useSelectedIngredients } from 'hooks/useSelectedIngredients';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  TextInput,
  TouchableHighlight,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRecipeStore } from 'stores/recipeStore';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { RecipeCategory, RecipeMethod } from 'types/recipe';
import { getWeekAndDay } from 'utils/date';
import { isCompletedHangul } from 'utils/hangul';

export default function ZeroRecipeCreationScreen() {
  const {
    selectedIngredients,
    resetIngredients,
    isLoading: isIngredientsLoading,
  } = useSelectedIngredients({ type: 'zero' });

  const setRecentRecipes = useRecipeStore((state) => state.setRecentRecipes);

  const [category, toggleCategory] = useSelect<RecipeCategory>(null);
  const [method, toggleMethod] = useSelect<RecipeMethod>(null);

  const [keyword, setKeyword] = useState('');
  const [isRecipeLoading, setIsRecipeLoading] = useState(false);
  const controller = useRef<AbortController>(null);

  const [resetTrigger, setResetTrigger] = useState(false);

  const getUserWeek = () => {
    const today = new Date().toISOString();
    const startDate = useUserStore.getState().start_date;
    const { week: userWeek } = getWeekAndDay(startDate ?? today);

    return userWeek;
  };

  const getSearchedIngredients = (item: IngredientsProps) =>
    item.ingredientList.filter((ingredient) => {
      const { name: ingredientName, subKeywords: ingredientSubKeywords } = ingredient;
      const trimmedKeyword = keyword.trim();

      if (isCompletedHangul(trimmedKeyword)) {
        const isIncludeKeyword = ingredientName.includes(trimmedKeyword);
        const isIncludeSubKeyword = ingredientSubKeywords?.some(
          (ingredientKeyword) => ingredientKeyword === trimmedKeyword
        );
        return isIncludeKeyword || isIncludeSubKeyword;
      }

      const disassembledIngredient = disassemble(ingredientName);
      const disassembledKeyword = disassemble(keyword);

      const isIncludeKeyword = disassembledIngredient.includes(disassembledKeyword);
      return isIncludeKeyword;
    });

  const createRecipeWithAI = async () => {
    const ingredients = selectedIngredients.map((ingredients) => ingredients.name).join(', ');
    const week = getUserWeek();

    const command =
      selectedIngredients.length === 0
        ? `다음 정보를 참고해서, 스위치온 ${week}주차에 먹을 수 있는 가장 맛있는 무탄수식 레시피를 만들어줘. 소스나 조미료는 자유롭게 활용해도 돼. ${category ? `\n요리 카테고리: ${category}` : ''} ${method ? `\n요리 방식: ${method}` : ''}`
        : `다음 정보를 참고해서, 스위치온 ${week}주차에 먹을 수 있는 무탄수식 레시피를 만들어줘. 가능하다면, 모든 재료를 사용해야해. 재료가 많다면, 모든 재료를 이용할 필요는 없어. 소스나 조미료는 자유롭게 활용해도 돼. \n재료: ${ingredients} ${category ? `\n요리 카테고리: ${category}` : ''} ${method ? `\n요리 방식: ${method}` : ''}`;

    controller.current = new AbortController();

    const recipe = await createRecipe({
      command,
      week,
      isZeroCarb: true,
      signal: controller.current.signal,
    });
    if (!recipe) return null;

    const recentRecipes = await RecipeAPI.selectAllRecent();
    setRecentRecipes(recentRecipes);

    return recipe;
  };

  const handleCreateRecipe = async () => {
    setIsRecipeLoading(true);

    const recipe = await createRecipeWithAI();
    if (recipe) {
      router.push(`/(tabs)/home/recipeDetail?recipe=${JSON.stringify(recipe)}`);
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
    <SafeAreaView className="relative flex-1 bg-white px-5">
      <View className="mb-8 w-full gap-3">
        <View className="relative">
          <TextInput
            className="w-full rounded-lg border border-neutral-400 px-3 py-2.5 pr-10"
            onChangeText={setKeyword}
            value={keyword}
            placeholder="재료를 검색하세요!"
          />
          {keyword.length > 0 && (
            <Pressable
              onPress={() => setKeyword('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              hitSlop={10}>
              <Ionicons name="close-circle" size={20} color="#888" />
            </Pressable>
          )}
        </View>
        <FlatList
          contentContainerClassName="gap-2"
          ListEmptyComponent={<SelectedIngredient />}
          data={selectedIngredients}
          renderItem={({ item }) => <SelectedIngredient ingredient={item} />}
          horizontal
          showsHorizontalScrollIndicator={false}
        />
        <Text className="ml-1 text-sm">
          <Text className="font-bold text-green-600">최대 10개</Text>까지 재료를 선택할 수 있어요!
        </Text>
      </View>
      <FlatList
        className="mb-4 flex-1"
        contentContainerClassName="gap-6"
        data={allZeroIngredients}
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
      <View className="mb-8 gap-4">
        <View className="flex-row gap-3">
          <CustomSelect
            title="요리 카테고리"
            options={['한식', '양식', '중식', '일식']}
            onSelect={toggleCategory}
            selectedValue={category}
          />
          <CustomSelect
            title="요리 방식"
            options={['샐러드류', '구이류', '볶음류', '덮밥류', '탕/국류', '찜류']}
            onSelect={toggleMethod}
            selectedValue={method}
          />
        </View>

        <View className="w-full flex-row gap-2">
          <TouchableOpacity
            className="flex-[3.5] items-center justify-center rounded-lg border border-green-600 py-4"
            onPress={handleReset}
            disabled={isRecipeLoading}>
            <Text className="text-lg font-semibold text-green-600">재료 리셋</Text>
          </TouchableOpacity>
          <TouchableHighlight
            className="flex-[6.5] items-center justify-center rounded-lg bg-green-600 py-4"
            underlayColor="#379237"
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
          <View className="absolute inset-0 bg-black/30" />
          <ActivityIndicator className="-translate-y-20" size={56} color={colors.emerald[300]} />
        </View>
      )}
    </SafeAreaView>
  );
}
