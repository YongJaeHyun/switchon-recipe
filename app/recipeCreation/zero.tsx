import { CustomSelect } from 'components/common/CustomSelect';
import { SafeAreaViewWithNav } from 'components/common/SafeAreaViewWithNav';
import { SearchInput } from 'components/common/SearchInput';
import { Text } from 'components/common/Text';
import { IngredientRequest } from 'components/recipeCreation/IngredientRequest';
import CreationLoadingOverlay from 'components/recipeCreation/CreationLoadingOverlay';
import { IngredientsLoadError } from 'components/recipeCreation/IngredientsLoadError';
import Ingredients, { IngredientsProps } from 'components/recipeCreation/Ingredients';
import QuotaExceededModal from 'components/recipeCreation/QuotaExceededModal';
import SelectedIngredient from 'components/recipeCreation/SelectedIngredient';
import { WeekChips } from 'components/recipeCreation/WeekChips';
import { getChoseong } from 'es-hangul';
import { useIngredients } from 'hooks/useIngredients';
import { useRecipeCreation } from 'hooks/useRecipeCreation';
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
import { getCreationLoadingKind } from 'utils/creationLoading';
import { isCompletedHangul } from 'utils/hangul';

export default function ZeroRecipeCreationScreen() {
  const {
    selectedIngredients,
    resetIngredients,
    upsertIngredients,
    isLoading: isIngredientsLoading,
  } = useSelectedIngredients({ type: 'zero' });

  const {
    ingredients,
    allWeekLists,
    zeroLists,
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
    type: 'zero',
    selectedIngredients,
    upsertIngredients,
    isReady: !isIngredientsLoading && !isIngredientListLoading && ingredients.length > 0,
  });

  // 검색할 때는 같은 주차의 저탄수(탄수화물) 재료도 보여 준다 (고른 주차에 쓸 수 있는 것만)
  const getSearchedIngredients = (item: IngredientsProps) =>
    ingredientsForWeek(
      allWeekLists.find((l) => l.week === item.week)?.ingredientList ?? [],
      weekChoice.week
    ).filter((ingredient) => {
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

  // 기존 명령문 그대로. 생성·한도·이동 흐름은 useRecipeCreation이 맡는다
  const buildRequest = () => {
    const chosenWeek = weekChoice.week;
    // 고른 주차보다 높은 주차 재료는 보내지 않는다 (선택 목록 정리를 못 했을 때)
    const usable = ingredientsForWeek(selectedIngredients, chosenWeek);
    const ingredients = usable.map((ingredient) => ingredient.name).join(', ');

    const availableWeek = recipeRuleWeek(chosenWeek);
    const recipeWeek = recipeSaveWeek(chosenWeek);

    let command = '';

    if (usable.length === 0) {
      command = `find a delicious zero-carb recipe randomly that can be eaten during Switch-On week ${availableWeek}.`;
    } else {
      command = `create a zero-carb recipe that can be eaten during Switch-On week ${availableWeek}. You must use only the ingredients listed below, and if possible, use all of them. \nIngredients: ${ingredients}`;
    }

    if (category) command += `\nCooking category: ${category}`;
    if (method) command += `\nCooking method: ${method}`;
    command += '\nRemove Switch-On week or carbohydrate from the recipe name.';
    command += '\nYou may freely use sauces or seasonings.';

    return { command, week: Math.min(recipeWeek, 3), isZeroCarb: true };
  };

  const creation = useRecipeCreation(buildRequest);
  const { quotaGate } = creation;

  const handleReset = () => {
    resetIngredients();
    setResetTrigger((prev) => !prev);
  };

  const loadingKind = getCreationLoadingKind({
    isRecipeLoading: creation.isCreating,
    isDataLoading: isIngredientsLoading || isIngredientListLoading,
  });

  return (
    <SafeAreaViewWithNav className="relative flex-1 bg-white px-5">
      <View className="mb-8 w-full gap-3">
        <WeekChips
          value={weekChoice.week}
          currentWeek={weekChoice.currentWeek}
          onChange={weekChoice.changeWeek}
          disabled={creation.isCreating}
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
          <Text className="font-bold text-green-600">최대 10개</Text>까지 재료를 선택할 수 있어요!
        </Text>
      </View>
      {isIngredientListError && ingredients.length === 0 ? (
        <IngredientsLoadError onRetry={refetchIngredientList} />
      ) : (
        <FlatList
          className="mb-4 flex-1"
          contentContainerClassName="gap-6"
          data={ingredientListsForWeek(zeroLists, weekChoice.week)}
          extraData={resetTrigger ? 'reset-1' : 'reset-0'}
          ListFooterComponent={() => <IngredientRequest />}
          renderItem={({ item }) => (
            <Ingredients
              title={item.title}
              week={item.week}
              ingredientList={!!keyword.trim() ? getSearchedIngredients(item) : item.ingredientList}
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
            disabled={creation.isRecipeLoading}>
            <Text className="text-lg font-semibold text-green-600">재료 초기화</Text>
          </TouchableOpacity>
          <TouchableHighlight
            className="flex-[6.5] items-center justify-center rounded-lg bg-green-600 py-4"
            underlayColor="#379237"
            onPress={creation.create}
            disabled={creation.isCreating}>
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
          <ActivityIndicator size="large" color={colors.green[600]} />
        </View>
      )}
      {loadingKind === 'recipe' && <CreationLoadingOverlay />}
      <QuotaExceededModal {...creation.quotaModalProps} />
    </SafeAreaViewWithNav>
  );
}
