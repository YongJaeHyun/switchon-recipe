import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { FoodCheckAPI } from 'api/FoodCheckAPI';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { QueryKey } from 'const/queryKey';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { setFoodCheckDetail, useFoodChecks, usePremiumQuota } from 'hooks/useFoodChecks';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { queryClient } from 'lib/queryClient';
import { type ComponentProps, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import type { FoodCheckInput, FoodCheckPhotoType, FoodCheckRecord } from 'types/foodCheck';
import { formatKoreanDate } from 'utils/date';
import { formatPremiumRemaining, verdictLabel } from 'utils/foodCheckDisplay';
import {
  IMAGE_TOO_LARGE_MESSAGE,
  isImageBase64TooLarge,
  MAX_FOOD_CHECK_TEXT_LENGTH,
  resolveImageMimeType,
  validateFoodCheckText,
} from 'utils/foodCheckInput';
import { requireOnline } from 'utils/network';
import { isPassOnSale } from 'utils/passScreen';
import { showErrorToast, showInfoToast } from 'utils/showToast';

type PhotoSource = 'camera' | 'library';

const PHOTO_TYPES: { type: FoodCheckPhotoType; label: string }[] = [
  { type: 'front', label: '제품 앞면' },
  { type: 'label', label: '성분표' },
];

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.6,
  base64: true,
  allowsEditing: false,
  exif: false,
};

const Header = () => (
  <View className="flex-row items-center gap-3 px-5 pb-2 pt-4">
    <TouchableOpacity onPress={router.back} hitSlop={10}>
      <MaterialIcons name="arrow-back" size={28} color="black" />
    </TouchableOpacity>
    <Text className="text-xl font-bold">편의점 판정</Text>
  </View>
);

const PhotoTypeToggle = ({
  value,
  onChange,
  disabled,
}: {
  value: FoodCheckPhotoType;
  onChange(type: FoodCheckPhotoType): void;
  disabled: boolean;
}) => (
  <View className="flex-row rounded-xl bg-neutral-100 p-1">
    {PHOTO_TYPES.map(({ type, label }) => {
      const selected = value === type;
      return (
        <TouchableOpacity
          key={type}
          disabled={disabled}
          onPress={() => onChange(type)}
          className={`flex-1 items-center rounded-lg py-2 ${selected ? 'bg-white shadow-sm' : ''}`}>
          <Text className={selected ? 'font-bold text-green-600' : 'text-neutral-500'}>
            {label}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const PhotoButton = ({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  onPress(): void;
  disabled: boolean;
}) => (
  <View className="flex-1">
    <RippleButton
      outerClassName={`border border-green-600 bg-white ${disabled ? 'opacity-50' : ''}`}
      className="w-full gap-2 py-5"
      rippleColor={colors.green[100]}
      disabled={disabled}
      onPress={onPress}>
      <MaterialIcons name={icon} size={32} color={colors.green[600]} />
      <Text className="font-bold text-green-600">{label}</Text>
    </RippleButton>
  </View>
);

// 기록 한 줄. 썸네일이 없으면(글자 입력, 아직 안 만들어짐) 아이콘으로 대신한다
const HistoryItem = ({ check, disabled }: { check: FoodCheckRecord; disabled: boolean }) => {
  const isAvoid = check.verdict === 'avoid';
  const title = check.productName ?? check.inputText ?? '판정 기록';

  return (
    <RippleButton
      outerClassName="border border-neutral-200 bg-white"
      className="w-full flex-row !justify-start gap-3 p-3"
      rippleColor={colors.neutral[300]}
      animation={false}
      disabled={disabled}
      onPress={() => router.push(`/foodCheck/${check.id}`)}>
      <View className="h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-neutral-100">
        {check.thumbUrl ? (
          <Image
            source={{ uri: check.thumbUrl }}
            style={{ width: 56, height: 56 }}
            contentFit="cover"
          />
        ) : (
          <MaterialIcons
            name={check.inputType === 'text' ? 'edit-note' : 'image'}
            size={28}
            color={colors.neutral[400]}
          />
        )}
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="font-bold text-neutral-800" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-xs text-neutral-400">{formatKoreanDate(check.createdAt)}</Text>
      </View>
      <View className="items-end">
        <Text className={`text-xl font-bold ${isAvoid ? 'text-red-500' : 'text-green-600'}`}>
          {check.score ?? '-'}
        </Text>
        <Text className={`text-xs ${isAvoid ? 'text-red-500' : 'text-green-600'}`}>
          {verdictLabel(check.verdict)}
        </Text>
      </View>
    </RippleButton>
  );
};

export default function FoodCheckScreen() {
  const uid = useUserStore((state) => state.id);
  const { status: passStatus } = usePass();
  const billingAvailable = useBillingAvailable();
  const { data: quota } = usePremiumQuota();
  const { data: history, isLoading: isHistoryLoading } = useFoodChecks();
  // 결과 화면의 [성분표 찍고 더 정확히 보기]가 photoType=label로 돌아온다
  const { photoType: photoTypeParam } = useLocalSearchParams<{ photoType?: string }>();

  const [photoType, setPhotoType] = useState<FoodCheckPhotoType>('front');
  const [text, setText] = useState('');
  const [checking, setChecking] = useState(false);
  // 피커/요청이 진행 중이면 다시 시작하지 않는다 (상태 반영 전 연타도 ref로 막는다)
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const runCheck = useCallback(
    async (input: FoodCheckInput) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setChecking(true);
      try {
        const outcome = await FoodCheckAPI.check(input, controller.signal);
        if (!outcome || controller.signal.aborted) return;

        switch (outcome.status) {
          case 'ok':
            setFoodCheckDetail(uid, outcome.check);
            void queryClient.invalidateQueries({ queryKey: [QueryKey.foodChecks] });
            void queryClient.invalidateQueries({ queryKey: [QueryKey.premiumQuota] });
            if (input.type === 'text') setText('');
            router.push(`/foodCheck/${outcome.check.id}`);
            return;
          case 'unrecognized':
            showInfoToast({
              textType: 'CUSTOM',
              title: '인식하지 못했어요',
              subtitle: outcome.message,
            });
            return;
          case 'locked':
            // 패스가 만료됐을 수 있다. 상태를 다시 받고, 이 빌드에서 살 수 있으면 결제 화면으로
            void queryClient.invalidateQueries({ queryKey: [QueryKey.pass] });
            if (isPassOnSale(passStatus?.sales, billingAvailable)) {
              router.push('/pass');
            } else {
              showInfoToast({ textType: 'CUSTOM', title: '패스가 필요한 기능이에요' });
            }
            return;
          case 'quotaExceeded':
            void queryClient.invalidateQueries({ queryKey: [QueryKey.premiumQuota] });
            showInfoToast({ textType: 'CUSTOM', title: outcome.message });
            return;
          case 'tooLarge':
          case 'invalid':
          case 'error':
            showErrorToast({ textType: 'CUSTOM', title: '판정 실패', subtitle: outcome.message });
            return;
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setChecking(false);
      }
    },
    [uid, passStatus, billingAvailable]
  );

  // 진행 중 표시/재진입 가드를 걸고 action을 실행한다. 오프라인이면 토스트만
  const guarded = useCallback(
    (action: () => Promise<void>) => async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await requireOnline(action)();
      } finally {
        inFlightRef.current = false;
      }
    },
    []
  );

  const pickPhoto = useCallback(
    async (source: PhotoSource, type: FoodCheckPhotoType) => {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showInfoToast({
          textType: 'CUSTOM',
          title: source === 'camera' ? '카메라 권한이 필요해요' : '사진 접근 권한이 필요해요',
          subtitle: '설정에서 권한을 허용해 주세요',
        });
        return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
          : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset?.base64) {
        showErrorToast({
          textType: 'CUSTOM',
          title: '사진을 읽지 못했어요',
          subtitle: '다시 시도해 주세요',
        });
        return;
      }
      if (isImageBase64TooLarge(asset.base64)) {
        showInfoToast({ textType: 'CUSTOM', title: IMAGE_TOO_LARGE_MESSAGE });
        return;
      }
      const mimeType = resolveImageMimeType(asset.mimeType);
      if (!mimeType) {
        showInfoToast({ textType: 'CUSTOM', title: 'JPEG 또는 PNG 사진만 판정할 수 있어요' });
        return;
      }

      // 피커를 여는 동안 연결이 끊겼을 수 있다
      await requireOnline(runCheck)({ type, imageBase64: asset.base64, mimeType });
    },
    [runCheck]
  );

  const handleSubmitText = guarded(async () => {
    const validation = validateFoodCheckText(text);
    if (!validation.ok) {
      showInfoToast({ textType: 'CUSTOM', title: validation.message });
      return;
    }
    await runCheck({ type: 'text', text: validation.text });
  });

  // 결과 화면에서 성분표로 다시 보기를 누르고 돌아오면 성분표로 바꾸고 바로 카메라를 연다
  useEffect(() => {
    if (photoTypeParam !== 'label') return;
    router.setParams({ photoType: undefined });
    setPhotoType('label');
    void guarded(() => pickPhoto('camera', 'label'))();
  }, [photoTypeParam, guarded, pickPhoto]);

  const busy = checking;
  const remainingText = quota ? formatPremiumRemaining(quota) : null;

  return (
    <SafeAreaView className="flex-1 bg-neutral-50">
      <Header />
      <ScrollView
        contentContainerClassName="gap-6 px-5 pb-10 pt-2"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View className="gap-1">
          <Text className="text-base text-neutral-600">
            편의점 음식, 지금 먹어도 되는지 확인해 보세요.
          </Text>
          {remainingText && <Text className="text-sm text-green-600">{remainingText}</Text>}
        </View>

        <View className="gap-3">
          <PhotoTypeToggle value={photoType} onChange={setPhotoType} disabled={busy} />
          <View className="flex-row gap-3">
            <PhotoButton
              icon="photo-camera"
              label="사진 찍기"
              disabled={busy}
              onPress={guarded(() => pickPhoto('camera', photoType))}
            />
            <PhotoButton
              icon="photo-library"
              label="앨범에서 고르기"
              disabled={busy}
              onPress={guarded(() => pickPhoto('library', photoType))}
            />
          </View>
        </View>

        <View className="gap-2">
          <Text className="font-bold text-neutral-700">이름으로 확인하기</Text>
          <View className="flex-row items-center gap-2">
            <TextInput
              className="flex-1 rounded-lg border border-neutral-400 bg-white px-3 py-2.5"
              placeholder="예: 참치마요 삼각김밥"
              placeholderTextColor={colors.neutral[400]}
              value={text}
              onChangeText={setText}
              maxLength={MAX_FOOD_CHECK_TEXT_LENGTH}
              editable={!busy}
              returnKeyType="search"
              onSubmitEditing={handleSubmitText}
            />
            <RippleButton
              outerClassName={`bg-green-600 ${busy || !text.trim() ? 'opacity-50' : ''}`}
              rounded="lg"
              className="px-4 py-3"
              disabled={busy || !text.trim()}
              onPress={handleSubmitText}>
              <Text className="font-bold text-white">판정</Text>
            </RippleButton>
          </View>
        </View>

        <View className="gap-3">
          <Text className="text-lg font-bold text-neutral-800">최근 기록</Text>
          {isHistoryLoading ? (
            <ActivityIndicator color={colors.green[600]} />
          ) : history && history.length > 0 ? (
            history.map((check) => <HistoryItem key={check.id} check={check} disabled={busy} />)
          ) : (
            <Text className="py-4 text-center text-neutral-400">아직 판정 기록이 없어요</Text>
          )}
        </View>
      </ScrollView>

      {busy && (
        <View className="absolute inset-0 z-50 items-center justify-center gap-3 bg-black/40">
          <ActivityIndicator size={56} color={colors.white} />
          <Text className="font-bold text-white">판정하는 중...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
