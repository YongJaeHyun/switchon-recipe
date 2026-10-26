import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PassAPI } from 'api/PassAPI';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { QueryKey } from 'const/queryKey';
import { TIME_ZONE } from 'const/const';
import { formatInTimeZone } from 'date-fns-tz';
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
import { getKoreanDateString } from 'utils/date';
import { getWeekColorHex } from 'utils/getWeekColor';
import { passJourney } from 'utils/passJourney';
import { formatPassRemaining, formatSalesHeadline } from 'utils/passDisplay';
import { getVerifyResultToast, isPassOnSale } from 'utils/passScreen';
import { showErrorToast, showSuccessToast } from 'utils/showToast';

// 패스로 쓸 수 있는 기능 (스펙 1절)
const PREMIUM_FEATURES = [
  { icon: 'storefront', title: '편의점 판정', description: '먹어도 되는지 바로 확인' },
  {
    icon: 'restaurant-menu',
    title: '맞춤 레시피 추천',
    description: '먹고 싶은 걸 고르면 레시피를 골라 드려요',
  },
  { icon: 'insights', title: 'AI 주간 리포트', description: '체중·식단·단식을 한 주씩 정리' },
] as const;

const weekLabel = (week: number) => (week >= 5 ? '유지기' : `${week}주차`);
// 유지기는 앱의 5주차 색(검정) 대신 조금 부드러운 색
const weekBarColor = (week: number) => (week >= 5 ? colors.neutral[700] : getWeekColorHex(week));

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

// 맨 위: 패스 5주(35일)가 내 다이어트 일정(주차)의 어디까지를 덮는지
const JourneyHero = ({ status }: { status: PassStatus }) => {
  const startDate = useUserStore((state) => state.start_date);
  const remaining = formatPassRemaining(status.passExpiresAt, new Date());
  // 이미 패스가 있으면 연장분은 지금 패스가 끝나는 날부터
  const from =
    remaining && status.passExpiresAt
      ? formatInTimeZone(new Date(status.passExpiresAt), TIME_ZONE, 'yyyy-MM-dd')
      : getKoreanDateString({ formatType: 'date' });
  const { endsOn, segments } = passJourney({ startDate: startDate ?? null, from });

  return (
    <View className="gap-4">
      {remaining && (
        <View className="flex-row items-center gap-1.5 self-start rounded-full bg-green-50 px-3 py-1.5">
          <MaterialIcons name="verified" size={16} color={colors.green[600]} />
          <Text className="text-sm text-green-800">
            이용 중 · <Text className="text-sm font-bold text-green-800">{remaining}</Text>
          </Text>
        </View>
      )}
      <View>
        <Text className="text-6xl font-bold text-neutral-900">5주</Text>
        <Text className="mt-1 text-lg text-neutral-700">
          {remaining ? '연장하면' : '오늘 결제하면'}{' '}
          <Text className="text-lg font-bold text-neutral-900">{endsOn}까지</Text> 모든 기능을 써요
        </Text>
      </View>

      <View className="gap-2">
        <View className="h-3 flex-row gap-0.5 overflow-hidden rounded-full">
          {segments.map(({ week, days }) => (
            <View key={week} style={{ flex: days, backgroundColor: weekBarColor(week) }} />
          ))}
        </View>
        <View className="flex-row gap-0.5">
          {segments.map(({ week, days }) => (
            <View key={week} style={{ flex: days }}>
              {days >= 5 && (
                <Text className="text-xs font-bold" style={{ color: weekBarColor(week) }}>
                  {weekLabel(week)}
                </Text>
              )}
            </View>
          ))}
        </View>
        <View className="flex-row justify-between">
          <Text className="text-xs text-neutral-500">{remaining ? '지금 패스 끝' : '오늘'}</Text>
          <Text className="text-xs text-neutral-500">{endsOn}</Text>
        </View>
      </View>
    </View>
  );
};

const FeatureList = () => (
  <View className="gap-4">
    <Text className="text-base font-bold text-neutral-900">패스로 쓸 수 있는 것</Text>
    {PREMIUM_FEATURES.map(({ icon, title, description }) => (
      <View key={title} className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-green-50">
          <MaterialIcons name={icon} size={22} color={colors.green[700]} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-neutral-900">{title}</Text>
          <Text className="text-sm text-neutral-500">{description}</Text>
        </View>
      </View>
    ))}
  </View>
);

const PriceBlock = ({ status }: { status: PassStatus }) => {
  const { sales } = status;
  const { price, original, badge, next } = formatSalesHeadline(sales);

  return (
    <View className="gap-2 border-t border-neutral-100 pt-6">
      {sales.freeActive && (
        <Text className="text-sm font-bold text-green-700">
          지금은 무료 기간이에요 ({sales.freeDaysLeft}일 남음). 끝난 뒤에도 쓰려면 패스가 필요해요.
        </Text>
      )}
      <View className="flex-row items-center gap-2">
        <Text className="text-3xl font-bold text-neutral-900">{price}</Text>
        {original && <Text className="text-base text-neutral-400 line-through">{original}</Text>}
        {badge && (
          <View className="rounded-full bg-green-600 px-2 py-0.5">
            <Text className="text-xs font-bold text-white">{badge}</Text>
          </View>
        )}
      </View>
      {next && <Text className="text-sm text-neutral-500">{next}로 올라요</Text>}
      <View className="mt-1 flex-row items-center gap-1">
        <MaterialIcons name="check" size={16} color={colors.green[600]} />
        <Text className="text-sm text-neutral-600">
          한 번만 결제해요. 자동으로 다시 결제되지 않아요.
        </Text>
      </View>
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
        <ScrollView contentContainerClassName="gap-8 px-5 pb-6 pt-4">
          <JourneyHero status={status} />
          <FeatureList />
          <PriceBlock status={status} />
        </ScrollView>
        <View className="gap-2 border-t border-neutral-100 px-5 pb-6 pt-3">
          <RippleButton
            outerClassName={disabled ? 'bg-neutral-300' : 'bg-green-600'}
            className="w-full py-4"
            disabled={disabled}
            onPress={requireOnline(handlePurchase)}>
            {purchasing ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text className="text-lg font-bold text-white">
                {price}으로 5주 {hasPass ? '연장하기' : '시작하기'}
              </Text>
            )}
          </RippleButton>
          <Text className="text-center text-xs text-neutral-400">
            Google Play로 결제되고, 결제하면 바로 적용돼요.
          </Text>
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
