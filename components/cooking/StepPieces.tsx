import { Text } from 'components/common/Text';
import { Text as RNText } from 'react-native';
import type { Piece } from 'utils/cookingSteps';

type Tone = 'light' | 'dark' | 'tip';

// 양은 초록, 불 세기·시간은 주황으로 강조한 한 문장 (utils/cookingSteps의 highlight 결과)
const MARK_CLASS: Record<Tone, Record<'amount' | 'heat', string>> = {
  light: {
    amount: 'font-bold text-green-700 bg-green-50',
    heat: 'font-bold text-amber-700 bg-amber-50',
  },
  dark: { amount: 'text-green-300', heat: 'text-amber-300' },
  // 팁 상자 안은 색 없이 굵게만
  tip: { amount: 'font-bold', heat: 'font-bold' },
};

export function StepPieces({
  pieces,
  tone = 'light',
  className = '',
}: {
  pieces: Piece[];
  tone?: Tone;
  className?: string;
}) {
  return (
    <Text className={className}>
      {pieces.map((piece, i) =>
        piece.mark ? (
          <RNText key={i} className={MARK_CLASS[tone][piece.mark]}>
            {piece.text}
          </RNText>
        ) : (
          piece.text
        )
      )}
    </Text>
  );
}
