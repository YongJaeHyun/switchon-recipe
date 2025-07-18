import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Ingredients from 'components/recipeCreation/Ingredients';
import { firstWeekIngredients } from 'const/ingredients';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RecipeCreationScreen() {
  const [keyword, setKeyword] = useState('');

  return (
    <SafeAreaView className="flex-1 bg-white px-5">
      <View className="mb-6 h-12 w-full flex-row items-center justify-between gap-4">
        <TextInput
          className="mb-4 h-full flex-[9] rounded-lg border border-neutral-400 px-3"
          onChangeText={(text) => setKeyword(text)}
          value={keyword}
          placeholder="재료를 검색하세요!"
        />
        <MaterialIcons className="h-full flex-1" name="search" size={30} />
      </View>

      <Ingredients
        weekNumber={1}
        ingredientList={firstWeekIngredients.filter((ingredient) =>
          ingredient.name.includes(keyword)
        )}
      />
    </SafeAreaView>
  );
}
