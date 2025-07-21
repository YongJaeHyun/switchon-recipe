import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Ingredients, { IngredientsProps } from 'components/recipeCreation/Ingredients';
import {
  firstWeekIngredients,
  secondWeekIngredients,
  thirdForthWeekIngredients,
} from 'const/ingredients';
import { router, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Text,
  TextInput,
  TouchableHighlight,
  View,
} from 'react-native';

const allIngredients: IngredientsProps[] = [
  {
    title: '1주차',
    week: 1,
    ingredientList: firstWeekIngredients,
  },
  {
    title: '2주차',
    week: 2,
    ingredientList: secondWeekIngredients,
  },
  {
    title: '3, 4주차',
    week: 3,
    ingredientList: thirdForthWeekIngredients,
  },
];

export default function RecipeCreationScreen() {
  const navigation = useNavigation();
  const [keyword, setKeyword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isCanceled = useRef(false);

  const handleCreateRecipe = async () => {
    try {
      setIsLoading(true);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (!isCanceled.current) {
        router.push('/(tabs)/home/recipeDetail');
      }
    } catch (error) {
      console.error('레시피 생성 실패:', error);
    } finally {
      setIsLoading(false);
    }
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
      <View className="my-8 w-full flex-row items-center gap-4">
        <TextInput
          className="flex-1 rounded-lg border border-neutral-400 px-3 py-2"
          onChangeText={setKeyword}
          value={keyword}
          placeholder="재료를 검색하세요!"
        />
        <MaterialIcons name="search" size={30} />
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
        className="mb-4 w-full items-center justify-center rounded-lg bg-green-500 py-4"
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
