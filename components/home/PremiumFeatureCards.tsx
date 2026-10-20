import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { type Href, router } from 'expo-router';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { usePremiumGate } from 'hooks/usePremiumGate';
import { type ComponentProps } from 'react';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import { shouldShowPremiumEntry } from 'utils/passScreen';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

interface PremiumFeature {
  title: string;
  description: string;
  icon: IconName;
  href: Href;
}

// 구독 전용 기능 목록. 새 기능(냉장고 사진, 주간 식단표 등)은 여기에 카드를 추가한다
const PREMIUM_FEATURES: PremiumFeature[] = [
  {
    title: '편의점 판정',
    description: '먹어도 되는지 바로 확인',
    icon: 'storefront',
    href: '/foodCheck',
  },
];

interface PremiumFeatureCardProps {
  title: string;
  description: string;
  icon: IconName;
  locked: boolean;
  onPress(): void;
}

function PremiumFeatureCard({
  title,
  description,
  icon,
  locked,
  onPress,
}: PremiumFeatureCardProps) {
  return (
    <RippleButton
      outerClassName="border border-neutral-200 bg-white"
      className="w-full flex-row !justify-between px-4 py-3"
      rippleColor={colors.neutral[300]}
      onPress={onPress}>
      <View className="flex-1 flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-green-50">
          <MaterialIcons name={icon} size={24} color={colors.green[600]} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-neutral-800">{title}</Text>
          <Text className="text-sm text-neutral-500">{description}</Text>
        </View>
      </View>
      <View className="flex-row items-center gap-1">
        {locked && (
          <View className="flex-row items-center gap-0.5 rounded-full bg-green-600 px-2 py-0.5">
            <MaterialIcons name="lock" size={12} color={colors.white} />
            <Text className="text-xs font-bold text-white">패스</Text>
          </View>
        )}
        <MaterialIcons name="navigate-next" size={24} color={colors.neutral[400]} />
      </View>
    </RippleButton>
  );
}

// 홈의 구독 전용 기능 진입 카드 묶음. 패스를 팔지 않고 권한도 없으면 통째로 숨긴다.
// 권한이 없으면 누를 때 usePremiumGate가 결제 화면으로 보낸다
export function PremiumFeatureCards() {
  const { status } = usePass();
  const billingAvailable = useBillingAvailable();
  const gate = usePremiumGate();

  if (!shouldShowPremiumEntry(status, billingAvailable)) return null;
  const locked = status?.hasAccess !== true;

  return (
    <View className="gap-3">
      {PREMIUM_FEATURES.map((feature) => (
        <PremiumFeatureCard
          key={feature.title}
          title={feature.title}
          description={feature.description}
          icon={feature.icon}
          locked={locked}
          onPress={gate(() => router.push(feature.href))}
        />
      ))}
    </View>
  );
}
