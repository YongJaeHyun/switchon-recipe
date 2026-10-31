import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PassBadge } from 'components/common/PassBadge';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { TrialBadge } from 'components/common/TrialBadge';
import { PassOnlyModal } from 'components/common/PassOnlyModal';
import { RecipeByNameSheet } from 'components/recipeByName/RecipeByNameSheet';
import { useRecipeByNameEntry } from 'hooks/useRecipeByNameEntry';
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
import type { TrialEntryState } from 'utils/passTrial';
import { RECIPE_BY_NAME_DESCRIPTION, RECIPE_BY_NAME_TITLE } from 'utils/recipeByName';
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
    title: '음식 판정',
    description: '사진 한 장으로 먹어도 되는지 확인',
    icon: 'fact-check',
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

// 먹고 싶은 음식으로 만들기: 다른 도구보다 넓게, 안에 입력칸 모양을 넣어 "이름을 적는 기능"임을 바로 보이게 한다
function RecipeByNameCard({
  entry,
  locked,
  onPress,
}: {
  entry: TrialEntryState;
  locked: boolean;
  onPress(): void;
}) {
  return (
    <RippleButton
      outerClassName="border border-green-600 bg-white"
      className="w-full gap-3 px-4 py-4"
      rippleColor={colors.green[100]}
      accessibilityRole="button"
      accessibilityLabel={RECIPE_BY_NAME_TITLE}
      onPress={onPress}>
      <View className="w-full flex-row items-start gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-green-600">
          <MaterialIcons name="edit-note" size={26} color={colors.white} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-neutral-800">{RECIPE_BY_NAME_TITLE}</Text>
          <Text className="text-sm text-neutral-500">{RECIPE_BY_NAME_DESCRIPTION}</Text>
        </View>
        {entry.kind === 'trial' && <TrialBadge remaining={entry.remaining} />}
        {locked && <PassBadge locked />}
      </View>
      <View className="w-full flex-row items-center gap-2 rounded-full bg-neutral-100 px-4 py-2.5">
        <MaterialIcons name="restaurant" size={16} color={colors.neutral[400]} />
        <Text className="flex-1 text-neutral-400">김치찌개</Text>
        <Text className="text-sm font-bold text-green-700">만들기</Text>
      </View>
    </RippleButton>
  );
}

// 패스를 팔지 않고 권한도 없으면 숨긴다. 권한이 없으면 누를 때 usePremiumGate가 결제 화면으로 보낸다.
// 음식 판정(패스 없이 3번)은 무료 체험이 남았으면 판매 여부와 관계없이 보이고 바로 쓴다.
// 먹고 싶은 음식으로 만들기는 늘 보이고, 패스·체험이 없으면 누를 때 "패스 기능이에요" 창으로 묻는다 (useRecipeByNameEntry)
export function RecipeToolCards() {
  const { status } = usePass();
  const billingAvailable = useBillingAvailable();
  const gate = usePremiumGate();
  const startDate = useUserStore((state) => state.start_date);

  const premiumEntry = shouldShowPremiumEntry(status, billingAvailable);
  const foodCheck = foodCheckEntryState(status, billingAvailable);
  const byName = useRecipeByNameEntry();
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

  if (cards.length === 0 && !byName.visible) return null;

  return (
    <View className="gap-3">
      {byName.visible && (
        <RecipeByNameCard
          entry={byName.entry}
          locked={byName.locked}
          onPress={() => byName.press()}
        />
      )}
      {cards.map((card) => (
        <ToolCard key={card.title} {...card} />
      ))}
      <RecipeByNameSheet request={byName.sheetRequest} trialRemaining={byName.trialRemaining} />
      <PassOnlyModal {...byName.passModalProps} />
    </View>
  );
}
