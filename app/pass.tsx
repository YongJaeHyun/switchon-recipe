import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PassAPI } from 'api/PassAPI';
import { UserAPI } from 'api/UserAPI';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { PASS_FEATURES } from 'const/passFeatures';
import { QueryKey } from 'const/queryKey';
import { TIME_ZONE } from 'const/const';
import { formatInTimeZone } from 'date-fns-tz';
import { router } from 'expo-router';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { useRecipeQuota } from 'hooks/useRecipeQuota';
import { queryClient } from 'lib/queryClient';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { BillingUnavailableError, purchasePass } from 'services/billing';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import type { PassStatus } from 'types/pass';
import { requireOnline } from 'utils/network';
import { getKoreanDateString } from 'utils/date';
import { getWeekColorHex } from 'utils/getWeekColor';
import { passBar } from 'utils/passBar';
import { formatPassRemaining, formatSalesHeadline } from 'utils/passDisplay';
import {
  canPurchasePassSelection,
  getPassCtaLabel,
  getPassOptions,
  getPassRecipeLine,
  getRepeatWeekNote,
  passProgramWeek,
  selectPassOption,
  type PassOption,
  type PassOptionKind,
} from 'utils/passOptions';
import { getVerifyResultToast, isPassOnSale } from 'utils/passScreen';
import { showErrorToast, showSuccessToast } from 'utils/showToast';

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

// 패스가 없으면 고른 기간을 5주(35일) 눈금 위에 그린다. 1주 패스는 앞 7일만 칠하고 나머지는 회색.
// 패스가 있으면 눈금 없이 오늘 → 지금 패스 끝 → 연장분 끝까지
const SCALE_DAYS = 35;
const BAR_HEIGHT = 12;

const durationLabel = (days: number) => (days % 7 === 0 ? `${days / 7}주` : `${days}일`);

// 연장분: 같은 주차 색을 옅게 + 사선 무늬
const HatchFill = ({ color, id }: { color: string; id: string }) => (
  <View style={{ flex: 1, height: BAR_HEIGHT, overflow: 'hidden' }}>
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: color,
        opacity: 0.28,
      }}
    />
    <Svg width="100%" height={BAR_HEIGHT} style={{ position: 'absolute' }}>
      <Defs>
        <Pattern
          id={id}
          width={5}
          height={5}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)">
          <Line x1={0} y1={0} x2={0} y2={5} stroke={color} strokeWidth={1.6} strokeOpacity={0.55} />
        </Pattern>
      </Defs>
      <Rect width="100%" height={BAR_HEIGHT} fill={`url(#${id})`} />
    </Svg>
  </View>
);

// 맨 위: 고른 패스가 내 다이어트 일정(주차)의 어디까지를 덮는지.
// scheduleLoading = 유저를 아직 불러오지 않아 주차를 모름 → 주차 색 대신 회색 막대
const JourneyHero = ({
  status,
  option,
  scheduleLoading,
}: {
  status: PassStatus;
  option: PassOption;
  scheduleLoading: boolean;
}) => {
  const startDate = useUserStore((state) => state.start_date);
  const remaining = formatPassRemaining(status.passExpiresAt, new Date());
  const holder = Boolean(remaining && status.passExpiresAt);
  const bar = passBar({
    startDate: startDate ?? null,
    today: getKoreanDateString({ formatType: 'date' }),
    passEnd:
      holder && status.passExpiresAt
        ? formatInTimeZone(new Date(status.passExpiresAt), TIME_ZONE, 'yyyy-MM-dd')
        : null,
    days: option.days,
  });
  // 패스가 없을 때만 35일 눈금의 남는 칸을 회색으로
  const restDays = holder ? 0 : Math.max(0, SCALE_DAYS - option.days);
  const showMarker = holder && bar.currentDays > 0 && bar.currentEndsOn;
  // 표시 위치: 지금 패스가 막대의 반 이상이면 경계 왼쪽에 붙이고, 아니면 경계 오른쪽에서 시작
  const markerOnLeft = bar.currentDays * 2 >= bar.totalDays;
  const repeatNote = getRepeatWeekNote(option);

  return (
    <View className="gap-5">
      {remaining && (
        <View className="flex-row items-center gap-1.5 self-start rounded-full bg-green-50 px-3 py-1.5">
          <MaterialIcons name="verified" size={16} color={colors.green[600]} />
          <Text className="text-sm text-green-800">
            이용 중 · <Text className="text-sm font-bold text-green-800">{remaining}</Text>
          </Text>
        </View>
      )}
      <View className="gap-2">
        <Text className="text-3xl font-bold leading-10 text-neutral-900">
          한 회차를 끝까지 함께해요
        </Text>
        <Text className="text-base leading-6 text-neutral-600">
          1주차 첫 쉐이크부터 유지기까지, 스위치온의 모든 기능을 한 회차 내내 써요.
        </Text>
      </View>

      <View className="gap-2">
        {scheduleLoading ? (
          <Text className="text-xs text-neutral-400">내 일정을 불러오고 있어요</Text>
        ) : (
          <View className="flex-row gap-0.5">
            {bar.weeks.map(({ week, current, extension }) => (
              <View key={week} style={{ flex: current + extension }}>
                {current + extension >= 5 && (
                  <Text className="text-xs font-bold" style={{ color: weekBarColor(week) }}>
                    {weekLabel(week)}
                  </Text>
                )}
              </View>
            ))}
            {restDays > 0 && <View style={{ flex: restDays }} />}
          </View>
        )}
        <View className="h-3 flex-row gap-0.5 overflow-hidden rounded-full">
          {scheduleLoading ? (
            <>
              {holder && bar.currentDays > 0 && (
                <View style={{ flex: bar.currentDays, backgroundColor: colors.neutral[300] }} />
              )}
              <View style={{ flex: option.days, flexDirection: 'row' }}>
                {holder ? (
                  <HatchFill color={colors.neutral[400]} id="hatch-loading" />
                ) : (
                  <View style={{ flex: 1, backgroundColor: colors.neutral[300] }} />
                )}
              </View>
            </>
          ) : (
            bar.weeks.map(({ week, current, extension }) => (
              <View key={week} style={{ flex: current + extension, flexDirection: 'row' }}>
                {current > 0 && (
                  <View style={{ flex: current, backgroundColor: weekBarColor(week) }} />
                )}
                {extension > 0 && (
                  <View style={{ flex: extension, flexDirection: 'row' }}>
                    {holder ? (
                      <HatchFill color={weekBarColor(week)} id={`hatch-${week}`} />
                    ) : (
                      <View style={{ flex: 1, backgroundColor: weekBarColor(week) }} />
                    )}
                  </View>
                )}
              </View>
            ))
          )}
          {restDays > 0 && (
            <View style={{ flex: restDays, backgroundColor: colors.neutral[100] }} />
          )}
        </View>
        {showMarker && (
          <View className="flex-row">
            <View
              style={{ flex: bar.currentDays }}
              className={markerOnLeft ? 'items-end border-r-2 border-neutral-900 pr-1.5' : ''}>
              {markerOnLeft && (
                <Text className="text-sm font-bold text-neutral-900">{bar.currentEndsOn}까지</Text>
              )}
            </View>
            <View
              style={{ flex: option.days }}
              className={markerOnLeft ? '' : 'items-start border-l-2 border-neutral-900 pl-1.5'}>
              {!markerOnLeft && (
                <Text className="text-sm font-bold text-neutral-900">{bar.currentEndsOn}까지</Text>
              )}
            </View>
          </View>
        )}
        <View className="flex-row justify-between">
          <Text className="text-xs text-neutral-500">오늘</Text>
          <Text className="text-sm font-bold text-neutral-900">
            {holder ? `연장하면 ${bar.endsOn}까지` : `${bar.endsOn}까지`}
          </Text>
        </View>
        {holder && !scheduleLoading && (
          <View className="mt-1 flex-row items-center gap-4">
            <View className="flex-row items-center gap-1.5">
              <View
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: colors.neutral[700] }}
              />
              <Text className="text-xs text-neutral-500">지금 패스</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className="h-2.5 w-2.5 flex-row overflow-hidden rounded-sm">
                <HatchFill color={colors.neutral[700]} id="hatch-legend" />
              </View>
              <Text className="text-xs text-neutral-500">
                연장분 ({durationLabel(option.days)})
              </Text>
            </View>
          </View>
        )}
      </View>

      {repeatNote && (
        <View className="flex-row items-center gap-1.5">
          <MaterialIcons name="autorenew" size={16} color={colors.green[700]} />
          <Text className="text-sm text-neutral-700">{repeatNote}</Text>
        </View>
      )}
    </View>
  );
};

const OptionCard = ({
  option,
  selected,
  next,
  onPress,
}: {
  option: PassOption;
  selected: boolean;
  next: string | null;
  onPress(): void;
}) => (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={onPress}
    accessibilityRole="radio"
    accessibilityState={{ selected }}
    className={`flex-row items-center gap-3 rounded-2xl border-2 px-4 py-4 ${
      selected ? 'border-green-600 bg-green-50' : 'border-neutral-200 bg-white'
    }`}>
    <View className="flex-1 gap-1">
      <View className="flex-row items-center gap-2">
        <Text className="text-base font-bold text-neutral-900">{option.title}</Text>
        {option.recommended && (
          <View className="rounded-full bg-green-600 px-2 py-0.5">
            <Text className="text-xs font-bold text-white">추천</Text>
          </View>
        )}
      </View>
      <Text className="text-sm text-neutral-500">{option.subtitle}</Text>
      <View className="mt-1 flex-row items-baseline gap-2">
        <Text className="text-2xl font-bold text-neutral-900">{option.price}</Text>
        {option.original && (
          <Text className="text-sm text-neutral-400 line-through">{option.original}</Text>
        )}
        {option.badge && (
          <View className="self-center rounded-full bg-green-600 px-2 py-0.5">
            <Text className="text-xs font-bold text-white">{option.badge}</Text>
          </View>
        )}
      </View>
      {option.perWeek && <Text className="text-sm text-neutral-500">{option.perWeek}</Text>}
      {next && <Text className="text-xs text-neutral-500">{next}으로 올라요</Text>}
    </View>
    <MaterialIcons
      name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
      size={24}
      color={selected ? colors.green[600] : colors.neutral[300]}
    />
  </TouchableOpacity>
);

const FeatureRow = ({
  icon,
  title,
  description,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  description?: string;
}) => (
  <View className="flex-row items-center gap-3">
    <View className="h-11 w-11 items-center justify-center rounded-xl bg-green-50">
      <MaterialIcons name={icon} size={22} color={colors.green[700]} />
    </View>
    <View className="flex-1">
      <Text className="text-base font-bold text-neutral-900">{title}</Text>
      {description && <Text className="text-sm text-neutral-500">{description}</Text>}
    </View>
  </View>
);

const FeatureList = ({ recipeLine }: { recipeLine: string | null }) => (
  <View className="gap-4 border-t border-neutral-100 pt-6">
    <Text className="text-base font-bold text-neutral-900">패스로 쓸 수 있는 것</Text>
    {PASS_FEATURES.map(({ icon, title, description }) => (
      <FeatureRow key={title} icon={icon} title={title} description={description} />
    ))}
    {recipeLine && <FeatureRow icon="menu-book" title={recipeLine} />}
  </View>
);

// 딥링크로 앱을 막 켜 이 화면부터 열리면 시작 화면(index)을 거치지 않아 유저를 불러오지 않는다.
// 그때 여기서 불러온다 (불러오면 store가 바뀌어 화면이 다시 그려진다). 로그인이 안 돼 있으면 시작 화면으로
const useLoadUserIfMissing = (uid: string) => {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (uid) return;
    let cancelled = false;
    setFailed(false);
    UserAPI.checkIsLoggedIn()
      .then((isLoggedIn) => {
        if (!cancelled && !isLoggedIn) router.replace('/');
      })
      .catch((error) => {
        console.error('[PassScreen.loadUser]', error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, attempt]);

  return { failed, retry: () => setAttempt((n) => n + 1) };
};

export default function PassScreen() {
  const uid = useUserStore((state) => state.id);
  const userLoad = useLoadUserIfMissing(uid);
  const { status, isLoading, refetch } = usePass();
  const billingAvailable = useBillingAvailable();
  const { setting: quotaSetting } = useRecipeQuota();

  // 고른 상품. 처음엔 추천 상품(null → 첫 상품)
  const [selectedKind, setSelectedKind] = useState<PassOptionKind | null>(null);
  // 4주차부터는 1주 패스를 추천·기본 선택한다. 딥링크·알림으로 앱을 막 켜 유저를 아직 불러오지 않았으면
  // 주차를 모르므로('loading') 추천하지 않고, 불러오면 다시 그린다
  const startDate = useUserStore((state) => state.start_date);
  const programWeek = passProgramWeek({
    userId: uid,
    startDate,
    today: getKoreanDateString({ formatType: 'date' }),
  });
  const scheduleLoading = programWeek === 'loading';
  const options = status ? getPassOptions(status.sales, programWeek) : [];
  const selected = selectPassOption(options, selectedKind);
  // 주차를 모르는 동안 기본 선택(추천이 아닐 수 있음)으로는 결제하지 않는다. 직접 고른 상품은 그대로 살 수 있다
  const canPurchase = canPurchasePassSelection(programWeek, selectedKind);

  // 결제/검증이 진행 중이면 다시 누를 수 없다 (상태 반영 전 연타도 ref로 막는다)
  const inFlightRef = useRef(false);
  const [purchasing, setPurchasing] = useState(false);

  const handlePurchase = async () => {
    const productId = selected?.productId;
    if (inFlightRef.current || !uid || !productId || !canPurchase) return;

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
      // 유저를 아직 불러오지 않았으면(딥링크·알림으로 앱을 막 켬) 패스 조회가 꺼져 있다 — 실패가 아니라 기다리는 중
      if (isLoading || (scheduleLoading && !userLoad.failed)) {
        return (
          <Centered>
            <ActivityIndicator size={48} color={colors.green[600]} />
          </Centered>
        );
      }
      return (
        <Centered>
          <Text className="text-neutral-600">패스 정보를 불러오지 못했어요.</Text>
          <RippleButton
            outerClassName="bg-green-600"
            className="px-5 py-2"
            onPress={scheduleLoading ? userLoad.retry : refetch}>
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

    if (!selected) {
      return (
        <Centered>
          <MaterialIcons name="hourglass-empty" size={48} color={colors.neutral[400]} />
          <Text className="text-lg font-bold text-neutral-700">스위치온 패스는 준비 중이에요</Text>
          <Text className="text-neutral-500">곧 만나요 :)</Text>
        </Centered>
      );
    }

    const hasPass = formatPassRemaining(status.passExpiresAt, new Date()) !== null;
    const { next } = formatSalesHeadline(status.sales);
    const disabled = purchasing || !canPurchase;

    return (
      <>
        <ScrollView contentContainerClassName="gap-8 px-5 pb-6 pt-4">
          <JourneyHero status={status} option={selected} scheduleLoading={scheduleLoading} />
          <View className="gap-3" accessibilityRole="radiogroup">
            {status.sales.freeActive && (
              <Text className="text-sm font-bold text-green-700">
                지금은 무료 기간이에요 ({status.sales.freeDaysLeft}일 남음). 끝난 뒤에도 쓰려면
                패스가 필요해요.
              </Text>
            )}
            {options.map((option) => (
              <OptionCard
                key={option.kind}
                option={option}
                selected={option.kind === selected.kind}
                next={option.kind === 'fiveWeek' ? next : null}
                onPress={() => setSelectedKind(option.kind)}
              />
            ))}
          </View>
          <FeatureList recipeLine={getPassRecipeLine(quotaSetting?.passDaily)} />
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
                {getPassCtaLabel(selected, hasPass)}
              </Text>
            )}
          </RippleButton>
          <Text className="text-center text-xs text-neutral-400">
            한 번만 결제해요. 자동으로 다시 결제되지 않아요. Google Play로 결제되고 바로 적용돼요.
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
