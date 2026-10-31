import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import { type PassBadgeState, passBadgeA11yLabel, passBadgeLabel } from 'utils/passFeatureLabel';

const STYLE = {
  // 패스를 쓰고 있다: 연한 초록
  pass: {
    box: 'border border-green-50 bg-green-50',
    text: 'text-green-700',
    icon: 'diamond',
    color: colors.green[700],
  },
  // 무료 체험 중: 흰 바탕 초록 테두리
  trial: {
    box: 'border border-green-600 bg-white',
    text: 'text-green-700',
    icon: 'diamond',
    color: colors.green[700],
  },
  // 패스가 필요하다: 진한 초록 채움
  locked: {
    box: 'border border-green-600 bg-green-600',
    text: 'text-white',
    icon: 'lock',
    color: colors.white,
  },
} as const;

// 모든 패스 기능 입구에 붙는 배지 (패스 사용 중 / 무료 체험 N번 남음 / 잠김). 문구는 utils/passFeatureLabel
export function PassBadge({ state }: { state: PassBadgeState }) {
  const style = STYLE[state.kind];
  return (
    <View
      accessible
      accessibilityLabel={passBadgeA11yLabel(state)}
      className={`flex-row items-center gap-0.5 rounded-full px-2 py-0.5 ${style.box}`}>
      <MaterialIcons name={style.icon} size={12} color={style.color} />
      <Text className={`text-xs font-bold ${style.text}`}>{passBadgeLabel(state)}</Text>
    </View>
  );
}
