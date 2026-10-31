import { CustomSelect } from 'components/common/CustomSelect';
import { RecipeJobBandSpacer } from 'components/common/RecipeJobBand';
import { SafeAreaViewWithNav } from 'components/common/SafeAreaViewWithNav';
import { SearchInput } from 'components/common/SearchInput';
import { Text } from 'components/common/Text';
import { IngredientRequest } from 'components/recipeCreation/IngredientRequest';
import { IngredientsLoadError } from 'components/recipeCreation/IngredientsLoadError';
import Ingredients, { IngredientsProps } from 'components/recipeCreation/Ingredients';
import SelectedIngredient from 'components/recipeCreation/SelectedIngredient';
import { WeekChips } from 'components/recipeCreation/WeekChips';
import { getChoseong } from 'es-hangul';
import { useIngredients } from 'hooks/useIngredients';
import { type RecipeCreationJob, useRecipeCreation } from 'hooks/useRecipeCreation';
import { useRecipeWeekChoice } from 'hooks/useRecipeWeekChoice';
import { useSelect } from 'hooks/useSelect';
import { useSelectedIngredients } from 'hooks/useSelectedIngredients';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  TouchableHighlight,
  TouchableOpacity,
  View,
} from 'react-native';
import colors from 'tailwindcss/colors';
import { RecipeCategory, RecipeMethod } from 'types/recipe';
import { ingredientListsForWeek, ingredientsForWeek } from 'utils/ingredientLists';
import { recipeRuleWeek, recipeSaveWeek } from 'utils/recipeWeekChoice';
import { isCompletedHangul } from 'utils/hangul';

export default function LowRecipeCreationScreen() {
  const {
    selectedIngredients,
    resetIngredients,
    upsertIngredients,
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

  // 탐색에서 결과가 없어 "직접 만들기"로 오면 찾던 말을 재료 검색칸에 미리 넣는다
  const { keyword: initialKeyword } = useLocalSearchParams<{ keyword?: string }>();
  const [keyword, setKeyword] = useState(initialKeyword ?? '');

  const [resetTrigger, setResetTrigger] = useState(false);

  // 어느 주차 규칙으로 만들지 (처음은 지금 주차). 바꾸면 재료 칸과 선택 재료가 그 주차에 맞춰진다
  const weekChoice = useRecipeWeekChoice({
    type: 'low',
    selectedIngredients,
    upsertIngredients,
    isReady: !isIngredientsLoading && !isIngredientListLoading && ingredients.length > 0,
  });

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

  // 기존 명령문 그대로. 생성(뒤에서)·한도·완성 안내는 useRecipeCreation과 하단 띠가 맡는다
  const buildJob = (): RecipeCreationJob => {
    const chosenWeek = weekChoice.week;
    // 고른 주차보다 높은 주차 재료는 보내지 않는다 (선택 목록 정리를 못 했을 때)
    const usable = ingredientsForWeek(selectedIngredients, chosenWeek);
    const ingredients = usable.map((ingredient) => ingredient.name).join(', ');

    const availableWeek = recipeRuleWeek(chosenWeek);
    const recipeWeek = recipeSaveWeek(chosenWeek);

    let command = '';

    if (usable.length === 0) {
      command = `find a delicious low-carb recipe randomly that can be eaten during Switch-On week ${availableWeek}.`;
    } else {
      command = `create a low-carb recipe that can be eaten during Switch-On week ${availableWeek}. You must use only the ingredients listed below, and if possible, use all of them. \nIngredients: ${ingredients}`;
    }

    if (category) command += `\nCooking category: ${category}`;
    if (method) command += `\nCooking method: ${method}`;
    command += '\nRemove Switch-On week or carbohydrate from the recipe name.';
    command += '\nYou may freely use sauces or seasonings.';

    return {
      request: { command, week: recipeWeek, isZeroCarb: false },
      label: { kind: 'ingredients', names: usable.map((i) => i.name), isZeroCarb: false },
    };
  };

  const creation = useRecipeCreation(buildJob);
  const { quotaGate } = creation;

  const handleReset = () => {
    resetIngredients();
    setResetTrigger((prev) => !prev);
  };

  const isDataLoading = isIngredientsLoading || isIngredientListLoading;

  return (
    <SafeAreaViewWithNav className="relative flex-1 bg-white px-5">
      <View className="mb-8 w-full gap-3">
        <WeekChips
          value={weekChoice.week}
          currentWeek={weekChoice.currentWeek}
          onChange={weekChoice.changeWeek}
        />
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
          data={ingredientListsForWeek(lowLists, weekChoice.week)}
          extraData={resetTrigger ? 'reset-1' : 'reset-0'}
          ListFooterComponent={() => <IngredientRequest />}
          renderItem={({ item }) => (
            <Ingredients
              title={item.title}
              week={item.week}
              ingredientList={getSearchedIngredients(item)}
              selectableWeek={weekChoice.week}
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
            onPress={handleReset}>
            <Text className="text-lg font-semibold text-amber-500">재료 초기화</Text>
          </TouchableOpacity>
          <TouchableHighlight
            className={`flex-[6.5] items-center justify-center rounded-lg bg-amber-500 py-4 ${
              creation.isCreating ? 'opacity-50' : ''
            }`}
            underlayColor={colors.amber[600]}
            onPress={creation.create}
            disabled={creation.isCreating}>
            <Text className="text-lg font-semibold text-white">
              {creation.isCreating
                ? '만드는 중…'
                : selectedIngredients.length > 0
                  ? '레시피 제작'
                  : `랜덤 레시피 제작`}
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
      {isDataLoading && (
        <View className="absolute inset-0 z-50 items-center justify-center">
          <ActivityIndicator size="large" color={colors.amber[500]} />
        </View>
      )}
      <RecipeJobBandSpacer />
    </SafeAreaViewWithNav>
  );
}
