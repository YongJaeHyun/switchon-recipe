import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';

// 카톡으로 보내는 버튼. 카카오 노란색으로 "카톡이 열린다"를 알린다 (초대·자랑하기·판정 결과 알려주기)
export const KAKAO_YELLOW = '#FEE500';
const KAKAO_LABEL = '#191919';
const KAKAO_RIPPLE = '#E6CF00';

export function KakaoShareButton({
  label,
  onPress,
  className = '',
  compact = false,
  accessibilityLabel,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  className?: string;
  // 한 줄에 둘 놓을 때 (완주 축하 시트)
  compact?: boolean;
}) {
  return (
    <RippleButton
      onPress={onPress}
      rippleColor={KAKAO_RIPPLE}
      outerClassName={className}
      className={`w-full flex-row gap-1.5 ${compact ? 'py-2.5' : 'py-3'}`}
      style={{ backgroundColor: KAKAO_YELLOW }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint="카카오톡 공유 창이 열려요">
      <Text className="font-bold" style={{ color: KAKAO_LABEL }} numberOfLines={1}>
        {label}
      </Text>
    </RippleButton>
  );
}
