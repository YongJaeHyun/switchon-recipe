import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PassAPI } from 'api/PassAPI';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { QueryKey } from 'const/queryKey';
import { router } from 'expo-router';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { queryClient } from 'lib/queryClient';
import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BillingUnavailableError, purchasePass } from 'services/billing';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import type { PassStatus } from 'types/pass';
import { requireOnline } from 'utils/network';
import { formatPassRemaining, formatSalesHeadline } from 'utils/passDisplay';
import { getVerifyResultToast, isPassOnSale } from 'utils/passScreen';
import { showErrorToast, showSuccessToast } from 'utils/showToast';

// 패스 전용 기능 (스펙 1절). 배포되기 전까지는 "곧 추가돼요"로 표시한다
const PREMIUM_FEATURES = [
  '편의점 판정: 먹어도 되는지 바로 확인',
  '맞춤 레시피 추천: 먹고 싶은 걸 고르면 레시피를 골라 드려요',
  'AI 주간 리포트: 체중·식단·단식을 한 주씩 정리',
];

const Header = () => (
  <View className="flex-row items-center gap-3 px-5 pb-2 pt-4">
    <TouchableOpacity onPress={router.back} hitSlop={10}>
      <MaterialIcons name="arrow-back" size={28} color="black" />
    </TouchableOpacity>
    <Text className="text-xl font-bold">스위치온 패스</Text>
  </View>
);

const Centered = ({ children }: { children: React.ReactNode }) => (
  <View className="flex-1 items-center justify-center gap-3 px-5">{children}</View>
);

const PassIntro = () => (
  <View className="gap-4">
    <View className="gap-2">
      <Text className="text-2xl font-bold text-neutral-800">5주 동안 모든 기능을 쓰세요</Text>
      <Text className="text-base text-neutral-600">한 번 결제하면 35일 동안 이용할 수 있어요.</Text>
      <View className="flex-row items-center gap-1">
        <MaterialIcons name="check-circle" size={18} color={colors.green[600]} />
        <Text className="font-bold text-green-600">자동 결제 없음</Text>
        <Text className="text-neutral-500">· 기간이 끝나면 그대로 종료돼요</Text>
      </View>
    </View>

    <View className="gap-3 rounded-xl border border-neutral-200 bg-white p-4">
      <Text className="font-bold text-neutral-700">패스 전용 기능</Text>
      {PREMIUM_FEATURES.map((feature) => (
        <View key={feature} className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <MaterialIcons name="lock-open" size={18} color={colors.green[600]} />
            <Text className="text-neutral-700">{feature}</Text>
          </View>
          <Text className="text-sm text-neutral-400">곧 추가돼요</Text>
        </View>
      ))}
    </View>
  </View>
);

const PriceCard = ({ status }: { status: PassStatus }) => {
  const { sales } = status;
  const { price, original, badge, next } = formatSalesHeadline(sales);
  const remaining = formatPassRemaining(status.passExpiresAt, new Date());

  return (
    <View className="gap-3 rounded-xl bg-green-50 p-5">
      {remaining && (
        <View className="flex-row items-center gap-2 rounded-lg bg-white px-3 py-2">
          <MaterialIcons name="verified" size={18} color={colors.green[600]} />
          <Text className="text-neutral-700">
            이용 중 · <Text className="font-bold">{remaining}</Text>
          </Text>
        </View>
      )}
      {sales.freeActive && (
        <Text className="font-bold text-green-700">무료 기간 {sales.freeDaysLeft}일 남음</Text>
      )}
      <View className="flex-row items-end gap-2">
        {badge && <Text className="text-2xl font-bold text-red-500">{badge}</Text>}
        <Text className="text-3xl font-bold text-neutral-900">{price}</Text>
        {original && <Text className="pb-1 text-neutral-400 line-through">{original}</Text>}
      </View>
      {next && <Text className="text-sm text-neutral-500">{next}</Text>}
      {remaining && (
        <Text className="text-sm text-neutral-500">연장하면 남은 기간 뒤에 35일이 더해져요.</Text>
      )}
    </View>
  );
};

export default function PassScreen() {
  const uid = useUserStore((state) => state.id);
  const { status, isLoading, refetch } = usePass();
  const billingAvailable = useBillingAvailable();

  // 결제/검증이 진행 중이면 다시 누를 수 없다 (상태 반영 전 연타도 ref로 막는다)
  const inFlightRef = useRef(false);
  const [purchasing, setPurchasing] = useState(false);

  const handlePurchase = async () => {
    const productId = status?.sales.productId;
    if (inFlightRef.current || !uid || !productId) return;

    inFlightRef.current = true;
    setPurchasing(true);
    try {
      let purchase;
      try {
        purchase = await purchasePass(productId, uid);
      } catch (error) {
        console.error('[PassScreen.purchasePass]', error);
        showErrorToast({
          textType:
            error instanceof BillingUnavailableError
              ? 'PASS_BILLING_UNAVAILABLE'
              : 'PASS_PURCHASE_ERROR',
        });
        return;
      }
      // 취소했거나 결제가 보류 중. 보류 결제는 완료된 뒤 복구 흐름이 서버로 보낸다
      if (!purchase) return;

      let result;
      try {
        result = await PassAPI.verify(purchase);
      } catch {
        // 결제는 Play에 남아 있으므로 복구 흐름(usePassPurchaseRecovery)이 다시 검증한다
        showErrorToast({ textType: 'PASS_VERIFY_DELAYED' });
        return;
      }

      const toast = getVerifyResultToast(result, new Date());
      if (toast.type === 'success') showSuccessToast({ textType: toast.textType });
      else showErrorToast({ textType: toast.textType });

      // 만료일(granted)이나 가격 구간(price_changed)이 바뀌었을 수 있다
      await queryClient.invalidateQueries({ queryKey: [QueryKey.pass] });
    } finally {
      inFlightRef.current = false;
      setPurchasing(false);
    }
  };

  const renderBody = () => {
    if (!status) {
      if (isLoading) {
        return (
          <Centered>
            <ActivityIndicator size={48} color={colors.green[600]} />
          </Centered>
        );
      }
      return (
        <Centered>
          <Text className="text-neutral-600">패스 정보를 불러오지 못했어요.</Text>
          <RippleButton outerClassName="bg-green-600" className="px-5 py-2" onPress={refetch}>
            <Text className="text-white">다시 시도</Text>
          </RippleButton>
        </Centered>
      );
    }

    if (billingAvailable === undefined) {
      return (
        <Centered>
          <ActivityIndicator size={48} color={colors.green[600]} />
        </Centered>
      );
    }

    // 판매 중이 아니거나 이 빌드에서 결제를 쓸 수 없으면(결제 모듈 없는 구 빌드) 같은 "준비 중" 화면
    if (!isPassOnSale(status.sales, billingAvailable)) {
      return (
        <Centered>
          <MaterialIcons name="hourglass-empty" size={48} color={colors.neutral[400]} />
          <Text className="text-lg font-bold text-neutral-700">스위치온 패스는 준비 중이에요</Text>
          <Text className="text-neutral-500">곧 만나요 :)</Text>
        </Centered>
      );
    }

    const hasPass = formatPassRemaining(status.passExpiresAt, new Date()) !== null;
    const { price } = formatSalesHeadline(status.sales);
    const disabled = purchasing || !status.sales.productId;

    return (
      <>
        <ScrollView contentContainerClassName="gap-6 px-5 py-4">
          <PassIntro />
          <PriceCard status={status} />
          <Text className="text-xs text-neutral-400">
            Google Play로 결제돼요. 결제 후 패스는 바로 적용되며, 자동으로 다시 결제되지 않아요.
          </Text>
        </ScrollView>
        <View className="px-5 pb-6 pt-2">
          <RippleButton
            outerClassName={disabled ? 'bg-neutral-300' : 'bg-green-600'}
            className="w-full py-4"
            disabled={disabled}
            onPress={requireOnline(handlePurchase)}>
            {purchasing ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text className="text-lg font-bold text-white">
                {hasPass ? '연장하기' : '패스 구매하기'} · {price}
              </Text>
            )}
          </RippleButton>
        </View>
      </>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header />
      {renderBody()}
    </SafeAreaView>
  );
}
