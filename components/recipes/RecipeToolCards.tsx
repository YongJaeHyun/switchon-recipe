import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PassBadge } from 'components/common/PassBadge';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { TrialBadge } from 'components/common/TrialBadge';
import { type Href, router } from 'expo-router';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { usePremiumGate } from 'hooks/usePremiumGate';
import { type ComponentProps, type ReactNode } from 'react';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import { RECOMMEND_LOCKED_MESSAGE } from 'types/recommend';
import { getWeekAndDay } from 'utils/date';
import { useUserStore } from 'stores/userStore';
import { foodCheckEntryState } from 'utils/foodCheckTrial';
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

const FOOD_CHECK_HREF = '/foodCheck';

// 레시피 탭의 구독 전용 도구 목록
const TOOLS: Tool[] = [
  {
    title: '맞춤 레시피 추천',
    description: '먹고 싶은 걸 고르면 레시피를 골라 드려요',
    icon: 'restaurant-menu',
    href: '/recommend',
    notice: (week, day) => (isRecommendLocked(week, day) ? RECOMMEND_LOCKED_MESSAGE : null),
  },
  {
    title: '편의점 판정',
    description: '먹어도 되는지 바로 확인',
    icon: 'storefront',
    href: FOOD_CHECK_HREF,
  },
];

interface ToolCardProps {
  title: string;
  description: string;
  icon: IconName;
  // 오른쪽 표시 (패스 잠금, 무료 체험 남은 횟수). 없으면 화살표만
  badge: ReactNode;
  onPress(): void;
}

function ToolCard({ title, description, icon, badge, onPress }: ToolCardProps) {
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
        {badge}
        <MaterialIcons name="navigate-next" size={24} color={colors.neutral[400]} />
      </View>
    </RippleButton>
  );
}

// 패스를 팔지 않고 권한도 없으면 숨긴다. 권한이 없으면 누를 때 usePremiumGate가 결제 화면으로 보낸다.
// 편의점 판정은 무료 체험(패스 없이 3번)이 남았으면 판매 여부와 관계없이 보이고 바로 들어간다.
export function RecipeToolCards() {
  const { status } = usePass();
  const billingAvailable = useBillingAvailable();
  const gate = usePremiumGate();
  const startDate = useUserStore((state) => state.start_date);

  const premiumEntry = shouldShowPremiumEntry(status, billingAvailable);
  const foodCheck = foodCheckEntryState(status, billingAvailable);
  const { week, day } = getWeekAndDay(startDate);

  const cards = TOOLS.flatMap((tool) => {
    const base = {
      title: tool.title,
      description: tool.notice?.(week, day) ?? tool.description,
      icon: tool.icon,
    };
    if (tool.href === FOOD_CHECK_HREF) {
      if (foodCheck.kind === 'hidden') return [];
      if (foodCheck.kind === 'trial') {
        return [
          {
            ...base,
            badge: <TrialBadge remaining={foodCheck.remaining} />,
            onPress: () => router.push(tool.href),
          },
        ];
      }
      return [
        {
          ...base,
          badge: foodCheck.kind === 'locked' ? <PassBadge locked /> : null,
          onPress: gate(() => router.push(tool.href)),
        },
      ];
    }
    if (!premiumEntry) return [];
    return [
      {
        ...base,
        badge: status?.hasAccess !== true ? <PassBadge locked /> : null,
        onPress: gate(() => router.push(tool.href)),
      },
    ];
  });

  if (cards.length === 0) return null;

  return (
    <View className="gap-3">
      {cards.map((card) => (
        <ToolCard key={card.title} {...card} />
      ))}
    </View>
  );
}
