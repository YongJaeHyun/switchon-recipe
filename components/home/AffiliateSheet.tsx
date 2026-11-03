import Ionicons from '@expo/vector-icons/Ionicons';
import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { AffiliateAPI } from 'api/AffiliateAPI';
import { CustomBottomSheet } from 'components/common/CustomBottomSheet';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { AFFILIATE_DISCLOSURE, AFFILIATE_SHEETS } from 'const/week1Guide';
import { Image } from 'expo-image';
import { forwardRef } from 'react';
import { Linking, View } from 'react-native';
import colors from 'tailwindcss/colors';
import type { AffiliateProduct, AffiliateSlot } from 'types/affiliate';
import { isHttpsUrl } from 'utils/affiliateProducts';

// 누른 기록은 기다리지 않고(실패해도) 링크를 연다
const openProduct = (product: AffiliateProduct) => {
  void AffiliateAPI.logClick(product);
  if (isHttpsUrl(product.url)) void Linking.openURL(product.url).catch(() => {});
};

// 시작 전 준비 [사러 가기] 시트: 책 기준 → 추천 제품(서버 순서, 최대 4개) → 대가성 안내(항상)
export const AffiliateSheet = forwardRef<
  BottomSheetMethods,
  { slot: AffiliateSlot | null; products: AffiliateProduct[] }
>(({ slot, products }, ref) => {
  const sheet = slot ? AFFILIATE_SHEETS[slot] : null;
  return (
    <CustomBottomSheet ref={ref}>
      <BottomSheetView className="px-5 pb-4">
        {sheet && (
          <>
            <Text className="mb-3 text-2xl font-bold">{sheet.title}</Text>

            <View className="mb-4 gap-1.5 rounded-xl bg-green-50 px-4 py-3">
              {sheet.criteria.map((line) => (
                <View key={line} className="flex-row items-start gap-2">
                  <Ionicons
                    name="checkmark"
                    size={16}
                    color={colors.green[600]}
                    style={{ marginTop: 2 }}
                  />
                  <Text className="flex-1 text-green-800">{line}</Text>
                </View>
              ))}
            </View>

            <View className="gap-2">
              {products.map((product) => (
                <RippleButton
                  key={product.id}
                  onPress={() => openProduct(product)}
                  rippleColor={colors.neutral[200]}
                  outerClassName="w-full border border-neutral-200 bg-white"
                  className="w-full flex-row items-center gap-3 p-2.5">
                  {product.image_url ? (
                    <Image
                      source={{ uri: product.image_url }}
                      style={{ width: 52, height: 52, borderRadius: 8 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View className="h-[52px] w-[52px] items-center justify-center rounded-lg bg-neutral-100">
                      <Ionicons name="bag-handle-outline" size={22} color={colors.neutral[400]} />
                    </View>
                  )}
                  <View className="flex-1 gap-0.5">
                    <Text className="font-bold text-neutral-800" numberOfLines={2}>
                      {product.name}
                    </Text>
                    {!!product.description && (
                      <Text className="text-sm text-neutral-500" numberOfLines={2}>
                        {product.description}
                      </Text>
                    )}
                  </View>
                  <View className="rounded-lg bg-green-600 px-2.5 py-1.5">
                    <Text className="text-sm font-bold text-white">쿠팡에서 보기</Text>
                  </View>
                </RippleButton>
              ))}
            </View>

            <Text className="mt-4 text-xs leading-5 text-neutral-400">{AFFILIATE_DISCLOSURE}</Text>
          </>
        )}
      </BottomSheetView>
    </CustomBottomSheet>
  );
});
AffiliateSheet.displayName = 'AffiliateSheet';
