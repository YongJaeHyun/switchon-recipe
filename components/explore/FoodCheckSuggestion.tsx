import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PassBadge } from 'components/common/PassBadge';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { TrialBadge } from 'components/common/TrialBadge';
import { router } from 'expo-router';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { usePremiumGate } from 'hooks/usePremiumGate';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import { foodCheckEntryState } from 'utils/foodCheckTrial';

// 탐색 검색 결과가 없을 때: 찾던 게 편의점 음식이면 편의점 판정으로 보낸다.
// 패스 사용자·무료 체험이 남은 사용자는 바로 들어가고(체험이면 "무료 N번"), 체험을 다 썼으면 패스 잠금 배지 +
// usePremiumGate(결제 화면), 판매 중이 아니고 체험도 없으면 숨긴다 (레시피 탭 도구 카드와 같은 규칙)
export function FoodCheckSuggestion() {
  const { status } = usePass();
  const billingAvailable = useBillingAvailable();
  const gate = usePremiumGate();
  const entry = foodCheckEntryState(status, billingAvailable);

  if (entry.kind === 'hidden') return null;

  const open = () => router.push('/foodCheck');

  return (
    <View className="items-center gap-3">
      <Text className="text-sm text-neutral-600">편의점 음식이라면 판정으로 확인해 보세요</Text>
      <RippleButton
        outerClassName="border border-green-600 bg-white"
        className="flex-row gap-2 px-4 py-2.5"
        rounded="full"
        rippleColor={colors.green[100]}
        accessibilityRole="button"
        accessibilityLabel={
          entry.kind === 'trial'
            ? `편의점 판정, 무료 ${entry.remaining}번 남음`
            : entry.kind === 'locked'
              ? '편의점 판정, 패스 전용'
              : '편의점 판정'
        }
        onPress={entry.kind === 'trial' ? open : gate(open)}>
        <MaterialIcons name="storefront" size={20} color={colors.green[600]} />
        <Text className="font-bold text-green-700">편의점 판정</Text>
        {entry.kind === 'trial' && <TrialBadge remaining={entry.remaining} />}
        {entry.kind === 'locked' && <PassBadge locked />}
      </RippleButton>
    </View>
  );
}
