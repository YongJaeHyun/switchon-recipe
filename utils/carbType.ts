import colors from 'tailwindcss/colors';

// 저탄수·무탄수 색. 레시피 만들기 화면(low.tsx 앰버, zero.tsx 초록)과 같은 색을 카드 배지와 상세 제목에 쓴다.
// is_zero_carb가 비어 있으면(null) 지금까지 카드가 보여 주던 대로 저탄수로 본다.
// 클래스 이름은 tailwind가 이 파일을 읽어 만들 수 있게 통째로 적는다 (tailwind.config.js content)
export interface CarbTypeStyle {
  label: '저탄수' | '무탄수';
  // 상세 화면 제목 위 라벨
  mealLabel: '저탄수식' | '무탄수식';
  badgeBg: string;
  badgeText: string;
  dot: string;
  border: string;
  // 그림자 색 (iOS shadowColor, Android 9+ elevation 색)
  hex: string;
}

const LOW: CarbTypeStyle = {
  label: '저탄수',
  mealLabel: '저탄수식',
  badgeBg: 'bg-amber-50',
  badgeText: 'text-amber-700',
  dot: 'bg-amber-500',
  border: 'border-amber-500',
  hex: colors.amber[500],
};

const ZERO: CarbTypeStyle = {
  label: '무탄수',
  mealLabel: '무탄수식',
  badgeBg: 'bg-green-50',
  badgeText: 'text-green-700',
  dot: 'bg-green-600',
  border: 'border-green-600',
  hex: colors.green[600],
};

export function carbTypeStyle(isZeroCarb: boolean | null | undefined): CarbTypeStyle {
  return isZeroCarb ? ZERO : LOW;
}
