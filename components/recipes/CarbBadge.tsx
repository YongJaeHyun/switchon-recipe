import { Text } from 'components/common/Text';
import { View } from 'react-native';
import { carbTypeStyle } from 'utils/carbType';

interface CarbBadgeProps {
  isZeroCarb: boolean | null | undefined;
  // 상세 화면 제목 위에서는 "저탄수식"처럼 끼니 이름으로 조금 크게 보여 준다
  // compact: 좁은 레시피 카드(192dp)에서 주차 배지와 한 줄에 들어가도록 작게
  variant?: 'card' | 'title' | 'compact';
}

// 저탄수(앰버)·무탄수(초록) 배지. 연한 바탕 + 진한 글자 + 앞에 작은 점
export function CarbBadge({ isZeroCarb, variant = 'card' }: CarbBadgeProps) {
  const style = carbTypeStyle(isZeroCarb);
  const isTitle = variant === 'title';
  const isCompact = variant === 'compact';

  return (
    <View
      className={`flex-row items-center rounded-full ${style.badgeBg} ${
        // 카드: 점이 왼쪽 여백 안쪽에 오도록 왼쪽만 조금 줄인다
        // 제목: 제목 상자 테두리 위에 걸쳐 놓이므로 같은 진한 색 테두리로 이어 보이게 한다
        isTitle
          ? `border-2 ${style.border} gap-1.5 px-3 py-1`
          : isCompact
            ? 'gap-1 py-0.5 pl-1 pr-1.5'
            : 'gap-1 py-1 pl-1.5 pr-2'
      }`}>
      <View className={`rounded-full ${style.dot} ${isTitle ? 'h-2 w-2' : 'h-1.5 w-1.5'}`} />
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={isCompact ? 1.2 : undefined}
        className={`${
          isTitle
            ? 'text-sm font-semibold'
            : isCompact
              ? 'text-xs font-medium'
              : 'text-sm font-medium'
        } ${style.badgeText}`}>
        {isTitle ? style.mealLabel : style.label}
      </Text>
    </View>
  );
}
