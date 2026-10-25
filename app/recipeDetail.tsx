import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { shareCustomTemplate } from '@react-native-kakao/share';
import { RecipeAPI } from 'api/RecipeAPI';
import { Text } from 'components/common/Text';
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
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import colors from 'tailwindcss/colors';
import { RecipeDB } from 'types/database';
import { IngredientSchema, Recipe, RecipeIngredient } from 'types/recipe';

// 뒤로가기·공유·저장 버튼 아래(top-12 48 + h-12 48)에서 8 띄운 곳
const BUTTONS_BOTTOM = 48 + 48 + 8;
const CARD_HEIGHT = 160;
const CARD_OVERLAP = 56; // 처음에 카드가 사진 아래쪽과 겹치는 만큼
// 이만큼 스크롤하면 카드가 화면 맨 위까지 늘어나 사진을 다 덮는다
const COLLAPSE_SCROLL = 150;
// 버튼 모양(사진 위 → 카드 위)이 바뀌는 구간
const COVER_RANGE = [COLLAPSE_SCROLL - 60, COLLAPSE_SCROLL];

export default function RecipeDetailScreen() {
  const { recipe }: { recipe: string } = useLocalSearchParams();

  const parsedRecipe: RecipeDB = JSON.parse(recipe);
  const { id, recipe_name, cooking_time, ingredients, nutrition, cooking_steps, image_uri } =
    parsedRecipe;

  const parsedIngredients: RecipeIngredient[] = JSON.parse(ingredients ?? '');
  parsedIngredients.sort((a: RecipeIngredient, b: RecipeIngredient) => {
    if (typeof a === 'string' || typeof b === 'string') return 0;
    if (a.isOptional === b.isOptional) return 0;
    return a.isOptional ? 1 : -1;
  });

  const parsedNutrition: Recipe['nutrition'] = JSON.parse(nutrition ?? '');
  const parsedCookingSteps: Recipe['cookingSteps'] = JSON.parse(cooking_steps ?? '');

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

  // 제목 카드: 처음엔 사진 아래쪽에 겹쳐 있고, 스크롤하면 윗변이 화면 맨 위까지 올라가며 늘어나 사진을 덮는다.
  // 제목·영양 정보는 카드 아래쪽에 남도록 늘어난 만큼 위 여백을 준다 (버튼과 겹치지 않게)
  const animatedTitleStyle = useAnimatedStyle(() => {
    const progress = interpolate(scrollY.value, [0, COLLAPSE_SCROLL], [0, 1], Extrapolation.CLAMP);
    const startTop = heroHeight.value - CARD_OVERLAP + 20;
    return {
      top: startTop * (1 - progress),
      height: CARD_HEIGHT + BUTTONS_BOTTOM * progress,
      opacity: heroHeight.value > 0 ? 1 : 0,
      paddingHorizontal: 20 * (1 - progress),
    };
  });
  const animatedCardStyle = useAnimatedStyle(() => {
    const progress = interpolate(scrollY.value, [0, COLLAPSE_SCROLL], [0, 1], Extrapolation.CLAMP);
    return {
      paddingTop: BUTTONS_BOTTOM * progress,
      borderTopLeftRadius: 12 * (1 - progress),
      borderTopRightRadius: 12 * (1 - progress),
    };
  });

  // 버튼: 사진 위에선 어두운 원 배경 + 밝은 아이콘, 카드 위에선 배경 없이 어두운 아이콘
  const coverStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, COVER_RANGE, [0, 1], Extrapolation.CLAMP),
  }));
  const onPhotoStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, COVER_RANGE, [1, 0], Extrapolation.CLAMP),
  }));

  // 카드가 사진을 덮으면 상태 표시줄 글자도 어둡게
  const [isCovered, setIsCovered] = useState(false);
  useAnimatedReaction(
    () => scrollY.value > COVER_RANGE[1] - 30,
    (covered, previous) => {
      if (covered !== previous) runOnJS(setIsCovered)(covered);
    }
  );

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
        {image_uri ? (
          <Image source={{ uri: image_uri }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <Image source={logo} style={{ width: '100%', height: '100%' }} />
        )}
      </View>

      {/* 제목 카드 (높이·위치는 animatedTitleStyle) */}
      <Animated.View style={animatedTitleStyle} className="absolute left-0 right-0 z-50">
        <Animated.View
          style={animatedCardStyle}
          className="h-full w-full items-center justify-evenly rounded-b-xl bg-white px-8 shadow-xl">
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
        </Animated.View>
      </Animated.View>

      {/* 버튼은 카드보다 위에 (카드가 사진을 덮어도 누를 수 있게) */}
      <View pointerEvents="box-none" className="absolute inset-x-0 top-0 z-[60]">
        <TouchableOpacity onPress={handleGoBack} className="absolute left-5 top-12">
          <MaterialIcons name="arrow-back" size={32} color="black" />
        </TouchableOpacity>
        <Pressable
          onPress={shareRecipeWithKakao}
          className="absolute right-24 top-12 h-12 w-12 items-center justify-center">
          <Animated.View
            className="absolute left-0 top-0 h-full w-full rounded-full bg-black/30"
            style={onPhotoStyle}
          />
          <Animated.View style={onPhotoStyle}>
            <MaterialIcons name="share" size={32} color={colors.neutral[200]} />
          </Animated.View>
          <Animated.View className="absolute" style={coverStyle}>
            <MaterialIcons name="share" size={32} color={colors.neutral[700]} />
          </Animated.View>
        </Pressable>
        <Pressable
          onPress={toggleIsSaved}
          className="absolute right-5 top-12 h-12 w-12 items-center justify-center">
          <Animated.View
            className="absolute left-0 top-0 h-full w-full rounded-full bg-black/30"
            style={onPhotoStyle}
          />
          {isSaved ? (
            <MaterialIcons name="star" size={36} color={colors.yellow[500]} />
          ) : (
            <>
              {/* 빈 별은 흰 바탕에서 노란색이 잘 안 보여 어두운색으로 바꾼다 */}
              <Animated.View style={onPhotoStyle}>
                <MaterialIcons name="star-outline" size={36} color={colors.yellow[500]} />
              </Animated.View>
              <Animated.View className="absolute" style={coverStyle}>
                <MaterialIcons name="star-outline" size={36} color={colors.neutral[700]} />
              </Animated.View>
            </>
          )}
        </Pressable>
      </View>

      <Animated.ScrollView
        className="relative mb-10 flex-[7]"
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 20 }}>
        <Animated.View style={animatedContentStyle} className="w-full gap-6 px-3">
          <View>
            <Text className="text-2xl font-bold">재료 요약</Text>
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
                    <Text className="text-medium font-semibold tracking-wide">{amount}</Text>
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
      <StatusBar style={isCovered ? 'dark' : 'light'} />
    </View>
  );
}
