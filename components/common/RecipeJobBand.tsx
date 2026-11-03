import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PassOnlyModal, type PassOnlyModalView } from 'components/common/PassOnlyModal';
import { Text } from 'components/common/Text';
import QuotaExceededModal from 'components/recipeCreation/QuotaExceededModal';
import { router, useSegments } from 'expo-router';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { useQuotaGate } from 'hooks/useQuotaGate';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
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
import {
  type RecipeJobBand as Band,
  isRecipeJobBandHidden,
  recipeJobBand,
  recipeJobProgress,
  recipeJobRemainingText,
} from 'utils/recipeJob';
import { showInfoToast } from 'utils/showToast';

const GAP = 8;
// 탭 바 높이 (@react-navigation/bottom-tabs 기본, 아이콘 아래 글자) + 아래 안전 영역
const TAB_BAR_HEIGHT = 49;

const SHADOW = {
  elevation: 6,
  shadowColor: colors.black,
  shadowOpacity: 0.15,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
} as const;
// 완성 직전 막대를 100%로 채워 보여 주는 시간
const FINISH_MS = 450;

const TONE = {
  error: { box: 'border-red-200 bg-white', icon: 'error-outline', color: colors.red[500] },
  warn: { box: 'border-amber-300 bg-amber-50', icon: 'info-outline', color: colors.amber[600] },
} as const;

function DismissButton({ onPress, color }: { onPress(): void; color: string }) {
  return (
    <TouchableOpacity
      hitSlop={10}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="알림 닫기">
      <MaterialIcons name="close" size={18} color={color} />
    </TouchableOpacity>
  );
}

// 만드는 중: 흰 띠 + 얇은 초록 막대(예상 30초에 맞춰 90%까지) + 남은 시간. finishing이면 100%로 채운다
function RunningBand({
  title,
  startedAt,
  finishing,
}: {
  title: string;
  startedAt: number;
  finishing: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (finishing) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [finishing]);

  const elapsed = now - startedAt;
  const target = finishing ? 1 : recipeJobProgress(elapsed);
  const progress = useSharedValue(target);
  useEffect(() => {
    progress.value = withTiming(target, {
      duration: finishing ? FINISH_MS - 100 : 500,
      easing: Easing.out(Easing.quad),
    });
  }, [target, finishing, progress]);
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View
      accessibilityLiveRegion="polite"
      className="gap-2.5 rounded-2xl border border-neutral-200 bg-white px-4 pb-3 pt-3"
      style={SHADOW}>
      <Text className="text-sm font-bold leading-5 text-neutral-800" numberOfLines={2}>
        {title}
      </Text>
      <View className="flex-row items-center gap-3">
        <View className="h-1 flex-1 overflow-hidden rounded-full bg-green-100">
          <Animated.View className="h-full rounded-full bg-green-600" style={barStyle} />
        </View>
        <Text className="text-xs text-neutral-500">
          {finishing ? '다 됐어요' : recipeJobRemainingText(elapsed)}
        </Text>
      </View>
    </View>
  );
}

// 완성: 진한 초록 띠 + 레시피 사진. 나타날 때 한 번 톡 튀어나온다 (동작 줄이기 설정이면 생략)
function DoneBand({
  title,
  action,
  imageUri,
  onPress,
  onDismiss,
}: {
  title: string;
  action: string;
  imageUri: string | null;
  onPress: (() => void) | null;
  onDismiss(): void;
}) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(reduceMotion ? 1 : 0.94);
  useEffect(() => {
    if (reduceMotion) return;
    scale.value = withSequence(
      withTiming(1.03, { duration: 160, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 12, stiffness: 220 })
    );
  }, [reduceMotion, scale]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={popStyle}>
      <Pressable
        disabled={!onPress}
        onPress={onPress ?? undefined}
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        className="flex-row items-center gap-3 rounded-2xl bg-green-700 py-2.5 pl-2.5 pr-4"
        style={SHADOW}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={{ width: 36, height: 36, borderRadius: 8 }}
            contentFit="cover"
            accessible={false}
          />
        ) : (
          <View className="h-9 w-9 items-center justify-center rounded-lg bg-green-600">
            <MaterialIcons name="restaurant" size={20} color={colors.white} />
          </View>
        )}
        <Text className="flex-1 text-sm font-bold leading-5 text-white" numberOfLines={2}>
          {title}
        </Text>
        <Text className="text-sm font-bold text-white">{action}</Text>
        <DismissButton onPress={onDismiss} color={colors.green[200]} />
      </Pressable>
    </Animated.View>
  );
}

// 오류·한도·이름 거절·체험 끝: 흰(오류)·노란(경고) 띠
function NoticeBand({
  band,
  onPress,
  onDismiss,
}: {
  band: Band & { tone: 'error' | 'warn' };
  onPress: (() => void) | null;
  onDismiss(): void;
}) {
  const tone = TONE[band.tone];
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress ?? undefined}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLiveRegion="polite"
      className={`flex-row items-center gap-2.5 rounded-2xl border px-4 py-3 ${tone.box}`}
      style={SHADOW}>
      <MaterialIcons name={tone.icon} size={20} color={tone.color} />
      <Text className="flex-1 text-sm font-bold leading-5 text-neutral-800" numberOfLines={2}>
        {band.title}
      </Text>
      {band.action && <Text className="text-sm font-bold text-amber-700">{band.action}</Text>}
      <DismissButton onPress={onDismiss} color={colors.neutral[400]} />
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

  const { setWaitingBonus, setBandHeight, dismiss } = state;
  // 만드는 중 → 완성: 막대를 100%로 채운 띠를 잠깐 보여 준 뒤 완성 띠로 바꾼다
  const lastRunning = useRef<{ id: number; title: string; startedAt: number } | null>(null);
  const [finishing, setFinishing] = useState<{ title: string; startedAt: number } | null>(null);
  const { job } = state;
  if (job.phase === 'running') {
    lastRunning.current = { id: job.id, title: job.label, startedAt: job.startedAt };
  }
  const doneId = job.phase === 'done' ? job.id : null;
  useEffect(() => {
    const running = lastRunning.current;
    if (doneId === null || running?.id !== doneId) return;
    lastRunning.current = null;
    setFinishing({ title: running.title, startedAt: running.startedAt });
    const timer = setTimeout(() => setFinishing(null), FINISH_MS);
    return () => clearTimeout(timer);
  }, [doneId]);
  useEffect(() => {
    setWaitingBonus(quotaGate.isWaitingBonus);
  }, [quotaGate.isWaitingBonus, setWaitingBonus]);

  const hidden = !band || isRecipeJobBandHidden(segments);
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
          useRecipeJobStore.getState().setRetryJob(job.input);
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
            router.push({ pathname: '/pass', params: { feature: 'byName' } });
            return;
          }
          setPassModal({
            featureId: 'byName',
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
    // 로그아웃하면 지워진다 (다른 계정으로 앞 계정의 요청을 보내지 않게)
    const saved = useRecipeJobStore.getState().retryJob as SavedRecipeJob | null;
    if (!saved) return;
    if (!runRecipeJob(saved.input, saved.meta)) {
      showInfoToast({
        textType: 'CUSTOM',
        title: '다른 레시피를 만드는 중이에요',
        subtitle: '다 되면 다시 만들어 주세요',
      });
    }
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
          {finishing && job.phase === 'done' ? (
            <RunningBand title={finishing.title} startedAt={finishing.startedAt} finishing />
          ) : job.phase === 'running' ? (
            <RunningBand title={job.label} startedAt={job.startedAt} finishing={false} />
          ) : job.phase === 'done' && band.action ? (
            <DoneBand
              key={job.id}
              title={band.title}
              action={band.action}
              imageUri={job.recipe.image_uri}
              onPress={onPress()}
              onDismiss={dismiss}
            />
          ) : band.tone === 'error' || band.tone === 'warn' ? (
            <NoticeBand
              band={band as Band & { tone: 'error' | 'warn' }}
              onPress={onPress()}
              onDismiss={dismiss}
            />
          ) : null}
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
