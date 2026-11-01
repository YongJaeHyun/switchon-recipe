import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { router } from 'expo-router';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { TouchableOpacity, View } from 'react-native';
import colors from 'tailwindcss/colors';
import {
  passGiftBannerText,
  passLockedBannerText,
  passTrialBannerText,
} from 'utils/passFeatureLabel';
import { isPassOnSale } from 'utils/passScreen';

type PassTrialBannerProps = {
  className?: string;
  // [패스 보기]로 넘어가기 직전 (시트를 먼저 닫는 등)
  onBeforeOpenPass?: () => void;
} & (
  | { variant: 'trial'; remaining: number }
  // 한 번 받은 무료 1주차 리포트
  | { variant: 'gift' }
  // 패스가 있어야 쓰는 기능 (무료 체험 없음)
  | { variant: 'locked'; detail: string }
);

// 패스 기능 화면 맨 위: 패스 없이 무료로 쓰고 있다는 안내, 또는 패스가 있어야 쓴다는 안내(locked). 패스 사용자·상태를 모르면 보이지 않는다.
// [패스 보기]는 이 기기에서 패스를 살 수 있을 때만
export function PassTrialBanner(props: PassTrialBannerProps) {
  const { status } = usePass();
  const billingAvailable = useBillingAvailable();
  if (!status || status.hasAccess) return null;
  if (props.variant === 'trial' && props.remaining <= 0) return null;

  const text =
    props.variant === 'trial'
      ? passTrialBannerText(props.remaining)
      : props.variant === 'locked'
        ? passLockedBannerText(props.detail)
        : passGiftBannerText();
  const canBuy = isPassOnSale(status.sales, billingAvailable);

  const openPass = () => {
    props.onBeforeOpenPass?.();
    router.push('/pass');
  };

  return (
    <View
      className={`flex-row items-center gap-3 rounded-xl border border-green-200 bg-green-50 py-3 pl-3 pr-2 ${
        props.className ?? ''
      }`}>
      <View className="h-8 w-8 items-center justify-center rounded-full bg-white">
        <MaterialIcons
          name={props.variant === 'locked' ? 'lock' : 'diamond'}
          size={18}
          color={colors.green[700]}
        />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-bold text-green-800">{text.title}</Text>
        <Text className="text-xs text-green-700">{text.detail}</Text>
      </View>
      {canBuy && (
        <TouchableOpacity
          onPress={openPass}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel="패스 보기"
          className="flex-row items-center py-1 pl-1">
          <Text className="text-sm font-bold text-green-700">패스 보기</Text>
          <MaterialIcons name="navigate-next" size={18} color={colors.green[700]} />
        </TouchableOpacity>
      )}
    </View>
  );
}
