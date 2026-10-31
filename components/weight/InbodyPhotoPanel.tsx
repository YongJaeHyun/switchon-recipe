import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import colors from 'tailwindcss/colors';

export type PhotoSource = 'camera' | 'library';

// 결과지 안내 그림과 읽는 중 사진 썸네일의 크기 (같은 자리에서 바뀐다)
const THUMB_W = 76;
const THUMB_H = 100;

const GUIDE_ROWS = [
  { label: '체중', value: '72.4', highlight: false },
  { label: '골격근', value: '30.1', highlight: true },
  { label: '체지방', value: '18.6', highlight: true },
];

// 작은 결과지 그림: 골격근·체지방 줄이 보이게 찍으라는 안내
function ResultSheetGuide() {
  return (
    <View
      accessible={false}
      style={{ width: THUMB_W, height: THUMB_H }}
      className="rounded-md border border-neutral-300 bg-white px-1.5 pt-2">
      <View className="mb-0.5 h-1.5 w-10 rounded-full bg-neutral-300" />
      <View className="mb-2 h-1 w-6 rounded-full bg-neutral-200" />
      {GUIDE_ROWS.map(({ label, value, highlight }) => (
        <View
          key={label}
          className={`mb-1 h-[18px] flex-row items-center justify-between rounded-sm border px-1 ${
            highlight ? 'border-green-600 bg-green-50' : 'border-transparent'
          }`}>
          <Text
            style={{ fontSize: 9, lineHeight: 12 }}
            className={highlight ? 'font-bold text-green-600' : 'text-neutral-400'}>
            {label}
          </Text>
          <Text
            style={{ fontSize: 9, lineHeight: 12 }}
            className={highlight ? 'font-bold text-green-600' : 'text-neutral-400'}>
            {value}
          </Text>
        </View>
      ))}
      <View className="mt-0.5 h-1 w-9 rounded-full bg-neutral-200" />
    </View>
  );
}

// 사진 위를 오르내리는 초록 스캔 줄. 동작 줄이기면 가운데 멈춰 있다
function ScanningThumb({ uri, reduceMotion }: { uri: string; reduceMotion: boolean }) {
  const y = useSharedValue(reduceMotion ? 0.5 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    y.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [reduceMotion, y]);

  const lineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value * (THUMB_H - 2) }],
  }));

  return (
    <View
      style={{ width: THUMB_W, height: THUMB_H }}
      className="overflow-hidden rounded-md border border-neutral-300 bg-neutral-100">
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      <View className="absolute inset-0 bg-white/20" />
      <Animated.View
        style={lineStyle}
        className="absolute -top-[5px] left-0 right-0 h-3 justify-center bg-green-600/15"
        pointerEvents="none">
        <View className="h-0.5 bg-green-600" />
      </Animated.View>
    </View>
  );
}

// 끝을 모르는 진행 막대. 동작 줄이기면 가운데 멈춰 있다
function IndeterminateBar({ reduceMotion }: { reduceMotion: boolean }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const x = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || trackWidth === 0) return;
    x.value = 0;
    x.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.cubic) }),
      -1,
      false
    );
  }, [reduceMotion, trackWidth, x]);

  const segment = trackWidth * 0.4;
  const segmentStyle = useAnimatedStyle(() => ({
    width: segment,
    transform: [
      {
        translateX: reduceMotion
          ? (trackWidth - segment) / 2
          : -segment + x.value * (trackWidth + segment),
      },
    ],
  }));

  return (
    <View
      className="h-1.5 overflow-hidden rounded-full bg-white"
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
      <Animated.View style={segmentStyle} className="h-full rounded-full bg-green-600" />
    </View>
  );
}

interface InbodyPhotoPanelProps {
  // 읽는 중이면 고른 사진 주소, 아니면 null (사진 고르기)
  readingUri: string | null;
  onPick: (source: PhotoSource) => void;
  onClose: () => void;
}

// 인바디 줄 아래에 펼쳐지는 결과지 사진 입력 칸: 사진 찍기/앨범 고르기 → 읽는 중
export function InbodyPhotoPanel({ readingUri, onPick, onClose }: InbodyPhotoPanelProps) {
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      className="mb-4 rounded-xl bg-green-50 p-3">
      {readingUri ? (
        <View className="flex-row items-center gap-3" accessibilityLiveRegion="polite">
          <ScanningThumb uri={readingUri} reduceMotion={reduceMotion} />
          <View className="flex-1 gap-3">
            <Text className="text-base font-semibold text-neutral-800">
              결과지에서 숫자를 찾고 있어요
            </Text>
            <IndeterminateBar reduceMotion={reduceMotion} />
          </View>
        </View>
      ) : (
        <>
          <View className="mb-3 flex-row items-center gap-3 pr-6">
            <ResultSheetGuide />
            <Text className="flex-1 text-sm leading-5 text-neutral-600">
              {'체성분분석의 체지방량과\n골격근·지방분석의 골격근량이\n보이게 찍어 주세요'}
            </Text>
          </View>
          <View className="flex-row gap-2">
            {(
              [
                { source: 'camera', icon: 'photo-camera', label: '사진 찍기' },
                { source: 'library', icon: 'photo-library', label: '앨범에서 고르기' },
              ] as const
            ).map(({ source, icon, label }) => (
              <TouchableOpacity
                key={source}
                accessibilityRole="button"
                onPress={() => onPick(source)}
                className="flex-1 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white py-4">
                <MaterialIcons name={icon} size={28} color={colors.green[600]} />
                <Text className="font-semibold text-neutral-800">{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="닫기"
            onPress={onClose}
            hitSlop={10}
            className="absolute right-2 top-2 p-1">
            <MaterialIcons name="close" size={20} color={colors.neutral[400]} />
          </TouchableOpacity>
        </>
      )}
    </Animated.View>
  );
}

// 입력칸 테두리 상자. 사진에서 채우면 잠깐 green-50 바탕·초록 테두리로 깜빡인다
// (flashKey가 바뀔 때마다, 0이면 그대로). 테두리 색은 평소 색(borderColor)으로 돌아간다
export function FlashField({
  flashKey,
  borderColor,
  className,
  children,
}: {
  flashKey: number;
  borderColor: string;
  className: string;
  children: React.ReactNode;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (flashKey === 0) return;
    progress.value = withSequence(
      withTiming(1, { duration: 150 }),
      withDelay(700, withTiming(0, { duration: 400 }))
    );
  }, [flashKey, progress]);

  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['#FFFFFF', colors.green[50]]),
    borderColor: interpolateColor(progress.value, [0, 1], [borderColor, colors.green[600]]),
  }));

  return (
    <Animated.View style={style} className={className}>
      {children}
    </Animated.View>
  );
}
