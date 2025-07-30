import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { deleteSavedRecipeFromDB, insertSavedRecipeToDB } from 'api/supabaseAPI';
import { logo } from 'const/assets';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { Pressable, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import colors from 'tailwindcss/colors';
import { RecipeDB } from 'types/database';
import { Recipe } from 'types/recipe';

export default function RecipeDetailScreen() {
  const { recipe }: { recipe: string } = useLocalSearchParams();

  const parsedRecipe: RecipeDB = JSON.parse(recipe);
  const { id, uid, recipe_name, cooking_time, ingredients, nutrition, cooking_steps, image_uri } =
    parsedRecipe;

  const parsedIngredients: Recipe['ingredients'] = JSON.parse(ingredients);
  const parsedNutrition: Recipe['nutrition'] = JSON.parse(nutrition);
  const parsedCookingSteps: Recipe['cookingSteps'] = JSON.parse(cooking_steps);

  const [isSaved, setIsSaved] = useState(parsedRecipe?.is_saved ?? false);
  const timer = useRef<NodeJS.Timeout>(null);

  const toggleIsSaved = () => {
    const next = !isSaved;
    setIsSaved(next);

    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(async () => {
      if (next) {
        await insertSavedRecipeToDB(id, uid);
      } else {
        await deleteSavedRecipeFromDB(id);
      }
      timer.current = null;
    }, 500);
  };

  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const animatedTitleStyle = useAnimatedStyle(() => {
    const translateY = interpolate(scrollY.value, [0, 150], [20, -90], Extrapolation.CLAMP);
    const paddingHorizontal = interpolate(scrollY.value, [0, 150], [20, 0], Extrapolation.CLAMP);

    return {
      transform: [{ translateY }],
      paddingHorizontal,
    };
  });

  const animatedContentStyle = useAnimatedStyle(() => {
    const translateY = interpolate(scrollY.value, [0, 100], [160, 110], Extrapolation.CLAMP);

    return {
      transform: [{ translateY }],
      paddingBottom: 130,
    };
  });

  return (
    <View className="flex-1 bg-white">
      <View className="relative flex-[3]">
        <TouchableOpacity onPress={router.back} className="absolute left-5 top-12 z-10">
          <MaterialIcons name="arrow-back" size={32} color="black" />
        </TouchableOpacity>
        {image_uri ? (
          <Image source={{ uri: image_uri }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <Image source={logo} style={{ width: '100%', height: '100%' }} />
        )}
        <Pressable onPress={toggleIsSaved} className="absolute right-5 top-12 z-10">
          <View className="absolute left-0 top-0 h-full w-full rounded-full bg-black/30" />
          <MaterialIcons
            name={isSaved ? 'star' : 'star-outline'}
            size={40}
            color={colors.yellow[500]}
          />
        </Pressable>
      </View>

      <Animated.View style={animatedTitleStyle} className="relative z-50 items-center">
        <View className="absolute -top-14 h-40 w-full items-center justify-evenly rounded-xl bg-white shadow-xl">
          <Text className="break-keep text-center text-3xl font-semibold">{recipe_name}</Text>
          <View className="flex-row gap-6">
            <View className="flex-row items-center gap-1">
              <MaterialCommunityIcons name="rice" size={14} color={colors.blue[500]} />
              <Text className="font-medium">약 {parsedNutrition.carbohydrates}g</Text>
            </View>
            <View className="flex-row items-center gap-1">
              <FontAwesome6 name="cow" size={14} color={colors.red[500]} />
              <Text className="font-medium">약 {parsedNutrition.protein}g</Text>
            </View>
            <View className="flex-row items-center gap-1">
              <FontAwesome5 name="cheese" size={14} color={colors.yellow[500]} />
              <Text className="font-medium">약 {parsedNutrition.fat}g</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      <Animated.ScrollView
        className="relative flex-[7]"
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 20 }}>
        <Animated.View style={animatedContentStyle} className="w-full gap-6 px-3">
          <View>
            <Text className="text-2xl font-semibold">재료 요약</Text>
            <View className="mb-10 mt-2 border border-neutral-300" />
            {parsedIngredients.map((item) => (
              <View key={item} className="mb-8 flex-row items-center">
                <View className="mr-4 h-2 w-2 rounded-full bg-green-500" />
                <Text className="tracking-wide">{item}</Text>
              </View>
            ))}
          </View>

          <View className="mt-10">
            <View className="flex-row items-center gap-4">
              <Text className="text-2xl font-semibold">조리순서</Text>
              <View className="flex-row items-center gap-1">
                <Ionicons name="time-outline" size={16} color="black" />
                <Text>약 {cooking_time}분</Text>
              </View>
            </View>
            <View className="mb-10 mt-2 border border-neutral-300" />
            {parsedCookingSteps.map((step, index) => (
              <View key={index} className="mb-10 w-full flex-row">
                <View className="mr-4 h-6 w-6 items-center justify-center rounded-full bg-green-600">
                  <Text className="text-center text-white">{index + 1}</Text>
                </View>
                <Text className="flex-1 leading-6 tracking-wide">{step}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </Animated.ScrollView>
      <StatusBar style="light" />
    </View>
  );
}
