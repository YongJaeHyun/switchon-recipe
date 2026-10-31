import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { shareCustomTemplate } from '@react-native-kakao/share';
import { RecipeAPI } from 'api/RecipeAPI';
import { Text } from 'components/common/Text';
import { CarbBadge } from 'components/recipes/CarbBadge';
import { ServingsStepper } from 'components/recipes/ServingsStepper';
import { SimilarRecipes } from 'components/recipes/SimilarRecipes';
import { logo } from 'const/assets';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useQueryWith402Retry } from 'hooks/useCustomQuery';
import { useToggleSaveRecipe } from 'hooks/useToggleSaveRecipe';
import { useState } from 'react';
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
import { IngredientSchema, Recipe, RecipeIngredient } from 'types/recipe';
import { carbTypeStyle } from 'utils/carbType';
import { nutritionPerServing } from 'utils/nutritionPerServing';
import {
  SERVINGS_STEPPER_MIN,
  baseServingsOf,
  scaleAmount,
  servingsStepperMax,
} from 'utils/scaleAmount';

const BUTTONS_BOTTOM = 48 + 48 + 8;
// 제목 상자 윗변에 걸친 저탄수식·무탄수식 라벨이 위로 튀어나온 높이 (-top-4)
const CARB_LABEL_OVERHANG = 16;

export default function RecipeDetailScreen() {
  const { recipe }: { recipe: string } = useLocalSearchParams();

  const parsedRecipe: RecipeDB = JSON.parse(recipe);
  const {
    id,
    recipe_name,
    cooking_time,
    ingredients,
    nutrition,
    cooking_steps,
    image_uri,
    is_zero_carb,
  } = parsedRecipe;
  const carbType = carbTypeStyle(is_zero_carb);

  const parsedIngredients: RecipeIngredient[] = JSON.parse(ingredients ?? '');
  parsedIngredients.sort((a: RecipeIngredient, b: RecipeIngredient) => {
    if (typeof a === 'string' || typeof b === 'string') return 0;
    if (a.isOptional === b.isOptional) return 0;
    return a.isOptional ? 1 : -1;
  });

  const parsedCookingSteps: Recipe['cookingSteps'] = JSON.parse(cooking_steps ?? '');

  // 기준 인분을 모르면(null) 인분 조절을 숨기고 재료 양을 그대로 보여 준다.
  // 비슷한 레시피로 이동해 같은 화면이 다른 레시피로 바뀌면 그 레시피의 기준 인분부터 다시 시작한다
  const baseServings = baseServingsOf(parsedRecipe);
  const [selected, setSelected] = useState<{ id: number; servings: number } | null>(null);
  const servings = selected?.id === id ? selected.servings : (baseServings ?? 1);
  const servingsFactor = baseServings ? servings / baseServings : 1;
  // 영양 정보는 항상 1인분 기준 (재료 전체 양 기준으로 저장돼 있어 기준 인분으로 나눈다)
  const parsedNutrition: Recipe['nutrition'] = nutritionPerServing(
    JSON.parse(nutrition ?? ''),
    baseServings
  );

  const { data: isSaved = false } = useQueryWith402Retry({
    queryKey: ['savedRecipe', id],
    queryFn: () => RecipeAPI.checkIsSavedRecipe(id),
  });
  const { toggleIsSaved } = useToggleSaveRecipe({ id });

  const scrollY = useSharedValue(0);
  // 위 사진 영역 높이. 제목 카드가 올라가도 뒤로가기·공유·저장 버튼(top-12 + h-12)을 덮지 않게 멈출 위치를 정한다
  const heroHeight = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const animatedTitleStyle = useAnimatedStyle(() => {
    // 카드 윗변 = 사진 아래 - 56(-top-14) + translateY. 윗변에 걸친 라벨 꼭대기가
    // 버튼 아래(48 + 48)에서 8 더 띄운 곳까지만 올린다
    const lowestUp =
      heroHeight.value > 0 ? BUTTONS_BOTTOM + CARB_LABEL_OVERHANG - (heroHeight.value - 56) : -90;
    const translateY = interpolate(
      scrollY.value,
      [0, 150],
      [20, Math.min(20, Math.max(-90, lowestUp))],
      Extrapolation.CLAMP
    );
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
        title: recipe_name ?? '',
        image_uri: image_uri ?? '',
        recipe,
        description: `🕒 ${cooking_time}분`,
      },
    });
  };

  return (
    <View className="flex-1 bg-white">
      <View
        className="relative flex-[3]"
        onLayout={(event) => {
          heroHeight.value = event.nativeEvent.layout.height;
        }}>
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
        <View
          className={`absolute -top-14 h-40 w-full items-center justify-evenly rounded-xl border-2 bg-white px-8 pt-3 ${carbType.border}`}
          style={{
            // 회색 대신 저탄수·무탄수 색으로 옅게 번지는 그림자. Android 9 미만은 그림자 색을 무시하고
            // 기본 회색 elevation으로 그려지지만 테두리 색이 있어 구분은 그대로 된다
            shadowColor: carbType.hex,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 14,
            elevation: 10,
          }}>
          <View className="absolute -top-4 left-0 right-0 items-center">
            <CarbBadge isZeroCarb={is_zero_carb} variant="title" />
          </View>
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
            {baseServings !== null && <Text className="text-sm text-neutral-400">1인분</Text>}
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
            <View className="flex-row items-center justify-between">
              <Text className="text-2xl font-bold">재료 요약</Text>
              {baseServings !== null && (
                <ServingsStepper
                  value={servings}
                  min={SERVINGS_STEPPER_MIN}
                  max={servingsStepperMax(baseServings)}
                  onChange={(value) => setSelected({ id, servings: value })}
                />
              )}
            </View>
            <View className="mb-10 mt-2 border border-neutral-300" />
            {parsedIngredients.map((item: RecipeIngredient) => {
              const ingredient = IngredientSchema.safeParse(item);

              if (ingredient.success) {
                const { name, isOptional, amount } = ingredient.data;
                return (
                  <View key={name} className="mb-8 flex-row items-center justify-between">
                    <View className="flex-row items-center gap-4">
                      <Text className="text-medium font-bold tracking-wide">{name}</Text>
                      {isOptional && (
                        <View className="rounded-full bg-neutral-200 px-3 py-1.5">
                          <Text className="text-sm">선택</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-medium font-semibold tracking-wide">
                      {scaleAmount(amount, servingsFactor)}
                    </Text>
                  </View>
                );
              } else if (typeof item === 'string') {
                return (
                  <View key={item} className="mb-8 flex-row items-center">
                    <View className="mr-4 h-2 w-2 rounded-full bg-green-500" />
                    <Text className="text-medium font-semibold tracking-wide">{item}</Text>
                  </View>
                );
              }
            })}
            {baseServings !== null && servings !== baseServings && (
              <Text className="-mt-4 text-sm text-neutral-500">
                조리 순서의 양은 {baseServings}인분 기준이에요
              </Text>
            )}
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

          <SimilarRecipes recipeId={id} />
        </Animated.View>
      </Animated.ScrollView>
      <StatusBar style="light" />
    </View>
  );
}
