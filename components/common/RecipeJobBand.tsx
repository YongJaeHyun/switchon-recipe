import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PassOnlyModal, type PassOnlyModalView } from 'components/common/PassOnlyModal';
import { Text } from 'components/common/Text';
import QuotaExceededModal from 'components/recipeCreation/QuotaExceededModal';
import { router, useSegments } from 'expo-router';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { useQuotaGate } from 'hooks/useQuotaGate';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openRecipeDetail, runRecipeJob, type SavedRecipeJob } from 'services/recipeJobRunner';
import { useRecipeByNameSheetStore } from 'stores/recipeByNameSheetStore';
import { useRecipeJobStore } from 'stores/recipeJobStore';
import colors from 'tailwindcss/colors';
import { requireOnline } from 'utils/network';
import { isPassOnSale } from 'utils/passScreen';
import {
  RECIPE_BY_NAME_DESCRIPTION,
  RECIPE_BY_NAME_TITLE,
  RECIPE_BY_NAME_TRIAL_LIMIT,
} from 'utils/recipeByName';
import { type RecipeJobBand as Band, recipeJobBand } from 'utils/recipeJob';

const GAP = 8;
// 탭 바 높이 (@react-navigation/bottom-tabs 기본, 아이콘 아래 글자) + 아래 안전 영역
const TAB_BAR_HEIGHT = 49;
// 띠를 띄우지 않는 화면 (로그인 전·첫 안내)
const HIDDEN_GROUPS = new Set(['(auth)', '(greet)', 'index']);

const TONE = {
  running: { box: 'border-green-700 bg-green-700', title: 'text-white', icon: null },
  done: { box: 'border-green-600 bg-white', title: 'text-neutral-900', icon: null },
  error: { box: 'border-red-200 bg-white', title: 'text-neutral-800', icon: 'error-outline' },
  warn: { box: 'border-amber-300 bg-amber-50', title: 'text-neutral-800', icon: 'info-outline' },
} as const;

// ●●○ 차례로 차오르는 점 (만드는 중)
function RunningDots() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => (s + 1) % 3), 450);
    return () => clearInterval(timer);
  }, []);
  return (
    <View className="flex-row gap-1" accessibilityElementsHidden>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          className="h-2 w-2 rounded-full bg-white"
          style={{ opacity: i <= step ? 1 : 0.35 }}
        />
      ))}
    </View>
  );
}

function BandBody({
  band,
  onPress,
  onDismiss,
}: {
  band: Band;
  onPress: (() => void) | null;
  onDismiss(): void;
}) {
  const tone = TONE[band.tone];
  const iconColor = band.tone === 'error' ? colors.red[500] : colors.amber[600];
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress ?? undefined}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLiveRegion="polite"
      className={`flex-row items-center gap-2.5 rounded-2xl border px-4 py-3 ${tone.box}`}
      style={{
        elevation: 6,
        shadowColor: colors.black,
        shadowOpacity: 0.15,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
      }}>
      {tone.icon && <MaterialIcons name={tone.icon} size={20} color={iconColor} />}
      <Text className={`flex-1 text-sm font-bold leading-5 ${tone.title}`} numberOfLines={2}>
        {band.title}
      </Text>
      {band.tone === 'running' && <RunningDots />}
      {band.action && (
        <Text
          className={`text-sm font-bold ${
            band.tone === 'done' ? 'text-green-700' : 'text-amber-700'
          }`}>
          {band.action}
        </Text>
      )}
      {band.dismissible && (
        <TouchableOpacity
          hitSlop={10}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="알림 닫기">
          <MaterialIcons name="close" size={18} color={colors.neutral[400]} />
        </TouchableOpacity>
      )}
    </Pressable>
  );
}

// 뒤에서 만드는 레시피의 하단 띠. 앱에 하나(app/_layout): 탭 화면에서는 탭 바 위, 다른 화면에서는 맨 아래.
// 만드는 중 → 완성(눌러서 보기) / 오류 / 한도 초과(누르면 한도 창: 광고 보고 같은 요청 다시) /
// 이름 거절(누르면 같은 이름·주차·탄수로 시트 다시) / 무료 체험 끝(누르면 결제 화면 또는 패스 안내)
export function RecipeJobBand() {
  const state = useRecipeJobStore();
  const band = recipeJobBand(state);
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const quotaGate = useQuotaGate();
  const { status } = usePass();
  const billingAvailable = useBillingAvailable();
  const [passModal, setPassModal] = useState<PassOnlyModalView | null>(null);
  // 한도 창에서 광고를 보면 다시 보낼 요청
  const retryJob = useRef<SavedRecipeJob | null>(null);

  const { setWaitingBonus, setBandHeight, dismiss } = state;
  useEffect(() => {
    setWaitingBonus(quotaGate.isWaitingBonus);
  }, [quotaGate.isWaitingBonus, setWaitingBonus]);

  const hidden = !band || HIDDEN_GROUPS.has(segments[0] ?? 'index');
  useEffect(() => {
    if (hidden) setBandHeight(0);
  }, [hidden, setBandHeight]);

  const onPress = (): (() => void) | null => {
    const { job } = state;
    switch (job.phase) {
      case 'done':
        return () => {
          dismiss();
          openRecipeDetail(job.recipe);
        };
      case 'quota':
        return () => {
          retryJob.current = job.input as SavedRecipeJob;
          dismiss();
          quotaGate.showExceeded(job.quota);
        };
      case 'rejected':
        return () => {
          const saved = job.input as SavedRecipeJob | null;
          if (saved?.input.kind !== 'byName') return;
          const { input, meta } = saved;
          dismiss();
          useRecipeByNameSheetStore.getState().open({
            name: input.request.name,
            isZeroCarb: input.request.isZeroCarb,
            weekChoice: input.weekChoice,
            message: job.message,
            origin: meta.origin,
          });
        };
      case 'locked':
        return () => {
          dismiss();
          const canBuy = isPassOnSale(status?.sales, billingAvailable);
          if (canBuy) {
            router.push('/pass');
            return;
          }
          setPassModal({
            feature: RECIPE_BY_NAME_TITLE,
            description: RECIPE_BY_NAME_DESCRIPTION,
            trialNote: `무료 체험 ${RECIPE_BY_NAME_TRIAL_LIMIT}번을 모두 썼어요`,
            canBuy,
          });
        };
      default:
        return null;
    }
  };

  const retry = async () => {
    const saved = retryJob.current;
    if (saved) runRecipeJob(saved.input, saved.meta);
  };

  const inTabs = segments[0] === '(tabs)';
  const bottom = (inTabs ? TAB_BAR_HEIGHT : 0) + insets.bottom + GAP;

  return (
    <>
      {!hidden && band && (
        <View
          pointerEvents="box-none"
          className="absolute left-0 right-0 px-4"
          style={{ bottom }}
          onLayout={(e) => setBandHeight(e.nativeEvent.layout.height + GAP)}>
          <BandBody band={band} onPress={onPress()} onDismiss={dismiss} />
        </View>
      )}
      <QuotaExceededModal
        view={quotaGate.view}
        onWatchAd={requireOnline(() => void quotaGate.watchAd(retry))}
        onPass={quotaGate.goPass}
        onClose={quotaGate.close}
      />
      <PassOnlyModal view={passModal} onClose={() => setPassModal(null)} />
    </>
  );
}

// 아래에 버튼이 있는 화면(재료로 만들기, 맞춤 추천)의 맨 아래에 둔다: 띠가 보이는 동안 그 높이만큼 비워
// 띠가 버튼을 가리지 않게 한다
export function RecipeJobBandSpacer() {
  const height = useRecipeJobStore((state) => state.bandHeight);
  const inTabs = useSegments()[0] === '(tabs)';
  const insets = useSafeAreaInsets();
  if (height <= 0) return null;
  // 탭 밖 화면은 아래 안전 영역까지 그려지므로 그만큼 더 비운다 (띠는 안전 영역 위에 뜬다)
  return <View style={{ height: height + (inTabs ? 0 : insets.bottom) }} />;
}
