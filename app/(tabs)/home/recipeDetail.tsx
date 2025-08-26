import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { shareCustomTemplate } from '@react-native-kakao/share';
import { useQuery } from '@tanstack/react-query';
import { Text } from 'components/common/Text';
import { logo } from 'const/assets';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useToggleSaveRecipe } from 'hooks/useToggleSaveRecipe';
import { Pressable, TouchableOpacity, View } from 'react-native';
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
import { RecipeAPI } from '../../../api/RecipeAPI';

export default function RecipeDetailScreen() {
  const { recipe }: { recipe: string } = useLocalSearchParams();

  const parsedRecipe: RecipeDB = JSON.parse(recipe);
  const { id, recipe_name, cooking_time, ingredients, nutrition, cooking_steps, image_uri } =
    parsedRecipe;

  const parsedIngredients: Recipe['ingredients'] = JSON.parse(ingredients);
  const parsedNutrition: Recipe['nutrition'] = JSON.parse(nutrition);
  const parsedCookingSteps: Recipe['cookingSteps'] = JSON.parse(cooking_steps);

  const { data: isSaved = false } = useQuery({
    queryKey: ['savedRecipe', id],
    queryFn: () => RecipeAPI.checkIsSavedRecipe(id),
  });
  const { toggleIsSaved } = useToggleSaveRecipe({ id });

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

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/home');
    }
  };

  const shareRecipeWithKakao = async () => {
    await shareCustomTemplate({
      templateId: 122968,
      templateArgs: {
        title: recipe_name,
        image_uri,
        recipe,
        description: `탄수화물 🍚 ${parsedNutrition.carbohydrates}g  |  단백질 🍗 ${parsedNutrition.protein}g  |  지방 🧀 ${parsedNutrition.fat}g`,
      },
    });
  };

  return (
    <View className="flex-1 bg-white">
      <View className="relative flex-[3]">
        <TouchableOpacity onPress={handleGoBack} className="absolute left-5 top-12 z-10">
          <MaterialIcons name="arrow-back" size={32} color="black" />
        </TouchableOpacity>
        {image_uri ? (
          <Image source={{ uri: image_uri }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <Image source={logo} style={{ width: '100%', height: '100%' }} />
        )}

        <Pressable
          onPress={shareRecipeWithKakao}
          className="absolute right-24 top-12 z-10 h-12 w-12 items-center justify-center">
          <View className="absolute left-0 top-0 h-full w-full rounded-full bg-black/30" />
          <MaterialIcons name={'share'} size={32} color={colors.neutral[200]} />
        </Pressable>
        <Pressable
          onPress={toggleIsSaved}
          className="absolute right-5 top-12 z-10 h-12 w-12 items-center justify-center">
          <View className="absolute left-0 top-0 h-full w-full rounded-full bg-black/30" />
          <MaterialIcons
            name={isSaved ? 'star' : 'star-outline'}
            size={36}
            color={colors.yellow[500]}
          />
        </Pressable>
      </View>

      <Animated.View style={animatedTitleStyle} className="relative z-50 items-center">
        <View className="absolute -top-14 h-40 w-full items-center justify-evenly rounded-xl bg-white px-8 shadow-xl">
          <Text className="break-keep text-center text-3xl font-bold">{recipe_name}</Text>
          <View className="flex-row gap-6">
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name="rice" size={16} color={colors.blue[500]} />
              <Text className="text-medium font-semibold">약 {parsedNutrition.carbohydrates}g</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <FontAwesome6 name="cow" size={16} color={colors.red[500]} />
              <Text className="text-medium font-semibold">약 {parsedNutrition.protein}g</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <FontAwesome5 name="cheese" size={16} color={colors.yellow[500]} />
              <Text className="text-medium font-semibold">약 {parsedNutrition.fat}g</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      <Animated.ScrollView
        className="relative mb-10 flex-[7]"
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 20 }}>
        <Animated.View style={animatedContentStyle} className="w-full gap-6 px-3">
          <View>
            <Text className="text-2xl font-bold">재료 요약</Text>
            <View className="mb-10 mt-2 border border-neutral-300" />
            {parsedIngredients.map((item) => {
              const lastSpace = item.lastIndexOf(' ');
              const ingredient = item.slice(0, lastSpace);
              const amount = item.slice(lastSpace);
              return (
                <View key={item} className="mb-8 flex-row items-center justify-between">
                  <Text className="text-medium font-bold tracking-wide">{ingredient}</Text>
                  <Text className="text-medium font-semibold tracking-wide">{amount}</Text>
                </View>
              );
            })}
          </View>

          <View className="mt-10">
            <View className="flex-row items-center gap-4">
              <Text className="text-2xl font-bold">조리순서</Text>
              <View className="flex-row items-center gap-1">
                <Ionicons name="time-outline" size={16} color="black" />
                <Text>약 {cooking_time}분</Text>
              </View>
            </View>
            <View className="mb-10 mt-2 border border-neutral-300" />
            {parsedCookingSteps.map((step, index) => (
              <View key={index} className="mb-8 w-full flex-row">
                <View className="mr-4 h-6 w-6 items-center justify-center rounded-full bg-green-600">
                  <Text className="text-center text-white">{index + 1}</Text>
                </View>
                <Text className="flex-1 text-medium leading-6 tracking-wide">{step}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </Animated.ScrollView>
      <StatusBar style="light" />
    </View>
  );
}
