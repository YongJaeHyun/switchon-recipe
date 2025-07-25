import Ionicons from '@expo/vector-icons/Ionicons';
import { selectRecentRecipeFromDB } from 'api/supabaseAPI';
import Ingredients from 'components/recipeCreation/Ingredients';
import { allIngredients } from 'const/ingredients';
import { router, useNavigation } from 'expo-router';
import { useGemini } from 'hooks/useGemini';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Pressable,
  Text,
  TextInput,
  TouchableHighlight,
  View,
} from 'react-native';
import { useIngredientStore } from 'stores/ingredientStore';
import { useRecipeStore } from 'stores/recipeStore';

export default function RecipeCreationScreen() {
  const navigation = useNavigation();
  const selectedIngredients = useIngredientStore((state) => state.selectedIngredients);
  const setRecentRecipes = useRecipeStore((state) => state.setRecentRecipes);

  const [keyword, setKeyword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isCanceled = useRef(false);

  const { mutateAsync } = useGemini();
  const createRecipe = async () => {
    const ingredients = selectedIngredients.map((ingredients) => ingredients.name).join(', ');
    // const command = `다음 재료들만 이용해서 스위치온 1주차에 먹을 수 있는 음식의 레시피를 만들어줘. 하지만, 모든 재료를 이용할 필요는 없어. 소스나 조미료는 자유롭게 활용해도 돼. \n재료: ${ingredients}`;
    const command = `다음 재료들만 이용해서 만들 수 있는 점심 레시피를 만들어줘. 하지만, 모든 재료를 이용할 필요는 없어. 소스나 조미료는 자유롭게 활용해도 돼. \n재료: ${ingredients}`;

    const recipe = await mutateAsync(command);
    if (!recipe) return null;

    const recentRecipes = await selectRecentRecipeFromDB();
    setRecentRecipes(recentRecipes);

    return recipe;
  };

  const handleCreateRecipe = async () => {
    setIsLoading(true);

    const recipe = await createRecipe();
    if (recipe && !isCanceled.current) {
      router.push(`/(tabs)/home/recipeDetail?recipe=${JSON.stringify(recipe)}`);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      e.preventDefault();
      isCanceled.current = true;
      navigation.dispatch(e.data.action);
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    isCanceled.current = false;
    const onBackPress = () => {
      isCanceled.current = true;
      router.back();
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
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
        <View className="absolute z-50 h-full w-screen items-center justify-center bg-black opacity-30">
          <ActivityIndicator size={'large'} color="#00ff00" />
        </View>
      )}
    </View>
  );
}
