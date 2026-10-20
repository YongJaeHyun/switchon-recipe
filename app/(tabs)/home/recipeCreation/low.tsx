import { createRecipe } from 'api/gemini';
import { CustomSelect } from 'components/common/CustomSelect';
import RippleButton from 'components/common/RippleButton';
import { SafeAreaViewWithNav } from 'components/common/SafeAreaViewWithNav';
import { SearchInput } from 'components/common/SearchInput';
import { Text } from 'components/common/Text';
import { IngredientRequest } from 'components/recipeCreation/IngredientRequest';
import { IngredientsLoadError } from 'components/recipeCreation/IngredientsLoadError';
import Ingredients, { IngredientsProps } from 'components/recipeCreation/Ingredients';
import Loading from 'components/recipeCreation/Loading';
import QuotaExceededModal from 'components/recipeCreation/QuotaExceededModal';
import SelectedIngredient from 'components/recipeCreation/SelectedIngredient';
import { QueryKey } from 'const/queryKey';
import { getChoseong } from 'es-hangul';
import { Link, router } from 'expo-router';
import { useIngredients } from 'hooks/useIngredients';
import { useQuotaGate } from 'hooks/useQuotaGate';
import { useSelect } from 'hooks/useSelect';
import { useSelectedIngredients } from 'hooks/useSelectedIngredients';
import { queryClient } from 'lib/queryClient';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  TouchableHighlight,
  TouchableOpacity,
  View,
} from 'react-native';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { RecipeCategory, RecipeMethod } from 'types/recipe';
import { isQuotaExceeded } from 'types/recipeQuota';
import { getWeekAndDay } from 'utils/date';
import { getCreationLoadingKind } from 'utils/creationLoading';
import { isCompletedHangul } from 'utils/hangul';
import { requireOnline } from 'utils/network';

export default function LowRecipeCreationScreen() {
  const {
    selectedIngredients,
    resetIngredients,
    isLoading: isIngredientsLoading,
  } = useSelectedIngredients({ type: 'low' });

  const {
    ingredients,
    lowLists,
    isLoading: isIngredientListLoading,
    isError: isIngredientListError,
    refetch: refetchIngredientList,
  } = useIngredients();

  const [category, toggleCategory] = useSelect<RecipeCategory>(null);
  const [method, toggleMethod] = useSelect<RecipeMethod>(null);

  const [keyword, setKeyword] = useState('');
  const [isRecipeLoading, setIsRecipeLoading] = useState(false);
  const controller = useRef<AbortController>(null);

  const [resetTrigger, setResetTrigger] = useState(false);

  const quotaGate = useQuotaGate();

  const getUserWeek = () => {
    const startDate = useUserStore.getState().start_date;
    const { week: userWeek } = getWeekAndDay(startDate);

    return userWeek;
  };

  const getSearchedIngredients = (item: IngredientsProps) =>
    item.ingredientList.filter((ingredient) => {
      const { name, subKeywords = [] } = ingredient;
      const trimmedKeyword = keyword.trim();

      const isMatch = [...subKeywords, name].some((ingredientName) => {
        if (isCompletedHangul(trimmedKeyword)) {
          const isMatchSubKeyword = ingredientName.includes(trimmedKeyword);
          return isMatchSubKeyword;
        } else {
          const ingredientChoseong = getChoseong(ingredientName);
          const keywordChoseong = getChoseong(trimmedKeyword);
          const isMatchChoseong = ingredientChoseong.includes(keywordChoseong);
          return isMatchChoseong;
        }
      });
      return isMatch;
    });

  const createRecipeWithAI = async () => {
    controller.current = new AbortController();
    const ingredients = selectedIngredients.map((ingredients) => ingredients.name).join(', ');

    const userWeek = getUserWeek();
    const availableWeek = Math.min(userWeek, 4);
    const recipeWeek = Math.min(userWeek, 3);

    let command = '';

    if (selectedIngredients.length === 0) {
      command = `find a delicious low-carb recipe randomly that can be eaten during Switch-On week ${availableWeek}.`;
    } else {
      command = `create a low-carb recipe that can be eaten during Switch-On week ${availableWeek}. You must use only the ingredients listed below, and if possible, use all of them. \nIngredients: ${ingredients}`;
    }

    if (category) command += `\nCooking category: ${category}`;
    if (method) command += `\nCooking method: ${method}`;
    command += '\nRemove Switch-On week or carbohydrate from the recipe name.';
    command += '\nYou may freely use sauces or seasonings.';

    let recipe;
    try {
      recipe = await createRecipe({
        command,
        week: recipeWeek,
        isZeroCarb: false,
        signal: controller.current.signal,
      });
    } finally {
      void quotaGate.invalidateQuota();
    }
    if (!recipe) return null;
    if (isQuotaExceeded(recipe)) {
      quotaGate.showExceeded(recipe);
      return null;
    }

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

  const loadingKind = getCreationLoadingKind({
    isRecipeLoading: isRecipeLoading || quotaGate.isWaitingBonus,
    isDataLoading: isIngredientsLoading || isIngredientListLoading,
  });

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
      {isIngredientListError && ingredients.length === 0 ? (
        <IngredientsLoadError onRetry={refetchIngredientList} />
      ) : (
        <FlatList
          className="mb-4 flex-1"
          contentContainerClassName="gap-6"
          data={lowLists}
          extraData={resetTrigger ? 'reset-1' : 'reset-0'}
          ListFooterComponent={() => <IngredientRequest />}
          renderItem={({ item }) => (
            <Ingredients
              title={item.title}
              week={item.week}
              ingredientList={getSearchedIngredients(item)}
            />
          )}
        />
      )}

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
            <Text className="text-lg font-semibold text-amber-500">재료 초기화</Text>
          </TouchableOpacity>
          <TouchableHighlight
            className="flex-[6.5] items-center justify-center rounded-lg bg-amber-500 py-4"
            underlayColor={colors.amber[600]}
            onPress={requireOnline(handleCreateRecipe)}
            disabled={isRecipeLoading || quotaGate.isWaitingBonus}>
            <Text className="text-lg font-semibold text-white">
              {selectedIngredients.length > 0 ? '레시피 제작' : `랜덤 레시피 제작`}
            </Text>
          </TouchableHighlight>
        </View>
        {quotaGate.remainingText && (
          <View className="items-center gap-0.5">
            <Text className="text-sm text-neutral-500">{quotaGate.remainingText}</Text>
            {quotaGate.adBonusText && (
              <Text className="text-xs text-green-600">{quotaGate.adBonusText}</Text>
            )}
          </View>
        )}
      </View>
      {loadingKind === 'data' && (
        <View className="absolute inset-0 z-50 items-center justify-center">
          <ActivityIndicator size="large" color={colors.amber[500]} />
        </View>
      )}
      {loadingKind === 'recipe' && (
        <View className="absolute inset-0 z-50 items-center justify-center">
          <View className="absolute inset-0 bg-black/40" />
          <View className="translate-y-8">
            <Loading />
            <Link href={'/(tabs)/explore'} asChild>
              <RippleButton outerClassName="bg-white self-center mb-6" className="px-4 py-3">
                <Text className="text-green-600">다른 레시피 둘러보기</Text>
              </RippleButton>
            </Link>
            <Text className="border-b-4 border-green-300 font-bold text-white">
              Tip. 아래 탐색 탭으로도 이동할 수 있어요!
            </Text>
          </View>
        </View>
      )}
      <QuotaExceededModal
        visible={!!quotaGate.exceeded}
        actions={quotaGate.actions}
        adBonusText={quotaGate.adBonusText}
        onWatchAd={requireOnline(() => void quotaGate.watchAd(handleCreateRecipe))}
        onPass={quotaGate.goPass}
        onClose={quotaGate.close}
      />
    </SafeAreaViewWithNav>
  );
}
