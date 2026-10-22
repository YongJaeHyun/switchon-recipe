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
import { RECOMMEND_LOCKED_MESSAGE } from 'types/recommend';
import { getWeekAndDay } from 'utils/date';
import { useUserStore } from 'stores/userStore';
import { shouldShowPremiumEntry } from 'utils/passScreen';
import { isRecommendLocked } from 'utils/recommendForm';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

interface Tool {
  title: string;
  description: string;
  icon: IconName;
  href: Href;
  // 지금 주차·일차에 쓸 수 없으면 설명 대신 보여줄 안내
  notice?(week: number, day: number): string | null;
}

// 레시피 탭의 구독 전용 도구 목록
const TOOLS: Tool[] = [
  {
    title: '편의점 판정',
    description: '먹어도 되는지 바로 확인',
    icon: 'storefront',
    href: '/foodCheck',
  },
  {
    title: '맞춤 레시피 추천',
    description: '먹고 싶은 걸 고르면 레시피를 골라 드려요',
    icon: 'restaurant-menu',
    href: '/recommend',
    notice: (week, day) => (isRecommendLocked(week, day) ? RECOMMEND_LOCKED_MESSAGE : null),
  },
];

interface ToolCardProps {
  title: string;
  description: string;
  icon: IconName;
  locked: boolean;
  onPress(): void;
}

function ToolCard({ title, description, icon, locked, onPress }: ToolCardProps) {
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

// 패스를 팔지 않고 권한도 없으면 통째로 숨긴다. 권한이 없으면 누를 때 usePremiumGate가 결제 화면으로 보낸다.
export function RecipeToolCards() {
  const { status } = usePass();
  const billingAvailable = useBillingAvailable();
  const gate = usePremiumGate();
  const startDate = useUserStore((state) => state.start_date);

  if (!shouldShowPremiumEntry(status, billingAvailable)) return null;

  const locked = status?.hasAccess !== true;
  const { week, day } = getWeekAndDay(startDate);

  return (
    <View className="gap-3">
      {TOOLS.map((tool) => (
        <ToolCard
          key={tool.title}
          title={tool.title}
          description={tool.notice?.(week, day) ?? tool.description}
          icon={tool.icon}
          locked={locked}
          onPress={gate(() => router.push(tool.href))}
        />
      ))}
    </View>
  );
}
