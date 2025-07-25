import Ionicons from '@expo/vector-icons/Ionicons';
import { selectRecentRecipeFromDB } from 'api/supabaseAPI';
import Ingredients from 'components/recipeCreation/Ingredients';
import { allIngredients } from 'const/ingredients';
import { router } from 'expo-router';
import { useGemini } from 'hooks/useGemini';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  TouchableHighlight,
  View,
} from 'react-native';
import { useIngredientStore } from 'stores/ingredientStore';
import { useRecipeStore } from 'stores/recipeStore';
import colors from 'tailwindcss/colors';

export default function RecipeCreationScreen() {
  const selectedIngredients = useIngredientStore((state) => state.selectedIngredients);
  const setRecentRecipes = useRecipeStore((state) => state.setRecentRecipes);

  const [keyword, setKeyword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const controller = useRef<AbortController>(null);

  const { mutateAsync } = useGemini();

  const createRecipe = async () => {
    const ingredients = selectedIngredients.map((ingredients) => ingredients.name).join(', ');
    // const command = `다음 재료들만 이용해서 스위치온 1주차에 먹을 수 있는 음식의 레시피를 만들어줘. 하지만, 모든 재료를 이용할 필요는 없어. 소스나 조미료는 자유롭게 활용해도 돼. \n재료: ${ingredients}`;
    const command = `다음 재료들만 이용해서 만들 수 있는 점심 레시피를 만들어줘. 하지만, 모든 재료를 이용할 필요는 없어. 소스나 조미료는 자유롭게 활용해도 돼. \n재료: ${ingredients}`;

    controller.current = new AbortController();

    const recipe = await mutateAsync({ message: command, signal: controller.current.signal });
    if (!recipe) return null;

    const recentRecipes = await selectRecentRecipeFromDB();
    setRecentRecipes(recentRecipes);

    return recipe;
  };

  const handleCreateRecipe = async () => {
    setIsLoading(true);

    const recipe = await createRecipe();
    if (recipe) {
      router.push(`/(tabs)/home/recipeDetail?recipe=${JSON.stringify(recipe)}`);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    return () => controller.current?.abort();
  }, []);

  return (
    <View className="relative flex-1 bg-white px-5">
      <View className="relative mb-8 mt-6 w-full">
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
        className="mb-4 flex-1"
        contentContainerStyle={{ gap: 24 }}
        data={allIngredients}
        renderItem={({ item }) => (
          <Ingredients
            title={item.title}
            week={item.week}
            ingredientList={item.ingredientList.filter((ingredient) =>
              ingredient.name.includes(keyword)
            )}
          />
        )}
      />
      <TouchableHighlight
        className="mb-4 w-full items-center justify-center rounded-lg bg-green-600 py-4"
        underlayColor="#379237"
        onPress={handleCreateRecipe}
        disabled={isLoading}>
        <Text className="text-lg font-semibold text-white">레시피 제작</Text>
      </TouchableHighlight>

      {isLoading && (
        <View className="absolute z-50 h-full w-screen items-center justify-center">
          <View className="absolute h-full w-full bg-black/30" />
          <ActivityIndicator size={56} color={colors.emerald[300]} />
        </View>
      )}
    </View>
  );
}
