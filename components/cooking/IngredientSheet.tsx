import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { CustomBottomSheet } from 'components/common/CustomBottomSheet';
import { Text } from 'components/common/Text';
import { forwardRef } from 'react';
import { View } from 'react-native';
import { IngredientSchema, type RecipeIngredient } from 'types/recipe';
import { scaleAmount } from 'utils/scaleAmount';

interface Props {
  ingredients: RecipeIngredient[];
  servings: number;
  baseServings: number | null;
}

// 요리 모드의 [재료 보기]: 상세 화면에서 고른 인분이 반영된 재료 양
export const IngredientSheet = forwardRef<BottomSheetMethods, Props>(
  ({ ingredients, servings, baseServings }, ref) => {
    const factor = baseServings ? servings / baseServings : 1;
    return (
      <CustomBottomSheet ref={ref} keyboard={{ snapPoints: ['65%'], enableDynamicSizing: false }}>
        <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
          <View className="mb-3 flex-row items-baseline justify-between">
            <Text className="text-2xl font-bold">재료</Text>
            {baseServings !== null && (
              <Text className="font-semibold text-neutral-500">{servings}인분</Text>
            )}
          </View>
          {ingredients.map((item, i) => {
            const parsed = IngredientSchema.safeParse(item);
            if (parsed.success) {
              const { name, isOptional, amount } = parsed.data;
              return (
                <View
                  key={`${name}${i}`}
                  className="flex-row items-center justify-between border-b border-neutral-100 py-3">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-medium font-bold">{name}</Text>
                    {isOptional && (
                      <View className="rounded-full bg-neutral-200 px-2 py-0.5">
                        <Text className="text-xs">선택</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-medium font-semibold text-green-700">
                    {scaleAmount(amount, factor)}
                  </Text>
                </View>
              );
            }
            if (typeof item === 'string') {
              return (
                <View
                  key={`${item}${i}`}
                  className="flex-row items-center border-b border-neutral-100 py-3">
                  <View className="mr-3 h-2 w-2 rounded-full bg-green-500" />
                  <Text className="text-medium font-semibold">{item}</Text>
                </View>
              );
            }
            return null;
          })}
          {baseServings !== null && servings !== baseServings && (
            <Text className="mt-3 text-sm text-neutral-500">
              조리 순서의 양은 {baseServings}인분 기준이에요
            </Text>
          )}
        </BottomSheetScrollView>
      </CustomBottomSheet>
    );
  }
);
IngredientSheet.displayName = 'IngredientSheet';
