// 결제 화면 "패스로 쓸 수 있는 양" 안내 줄. 숫자는 서버(get-pass-status limits)가 준 값만 쓴다.
// 고른 상품에 따라 레시피 총량이 다르다: 5주 패스는 recipePerPass + 한 주 더 할 때마다 recipePerWeek,
// 1주 패스는 recipePerWeek이고 연장할 수 없다 (DB pass_recipe_period와 같은 규칙)
import type MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { PassLimits } from 'types/pass';
import type { PassOptionKind } from './passOptions';

export interface PassLimitRow {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  value: string;
  note: string | null;
}

export const PASS_LIMITS_RESET_NOTE = '하루 한도는 매일 자정(한국 시간)에 다시 채워져요';

// limits가 없으면(옛 서버·조회 실패) 빈 목록 → 화면은 안내를 숨긴다
export function getPassLimitRows(
  limits: PassLimits | undefined,
  kind: PassOptionKind
): PassLimitRow[] {
  if (!limits) return [];
  const fiveWeek = kind === 'fiveWeek';
  const recipeTotal = fiveWeek ? limits.recipePerPass : limits.recipePerWeek;
  return [
    {
      icon: 'menu-book',
      label: '레시피 만들기',
      value: `하루 ${limits.recipeDaily}개 · 이 패스로 ${recipeTotal}개까지`,
      note: fiveWeek ? `한 주 더 하면 +${limits.recipePerWeek}개` : null,
    },
    {
      icon: 'edit-note',
      label: '이름으로 만들기',
      value: `레시피 개수 안에서, 이름 확인 하루 ${limits.nameCheckDaily}번`,
      note: null,
    },
    {
      icon: 'fact-check',
      label: '음식 판정',
      value: `하루 ${limits.foodCheckDaily}번`,
      note: null,
    },
    {
      icon: 'photo-camera',
      label: '인바디 결과지',
      value: `하루 ${limits.inbodyDaily}번`,
      note: null,
    },
    {
      icon: 'insights',
      label: '주간 리포트',
      value: '1주차~유지기 1주차, 매주 자동으로 정리해 드려요',
      note: null,
    },
    {
      icon: 'event',
      label: '기간',
      value: `5주 패스 ${limits.fiveWeekDays}일 · 1주 패스 ${limits.weekPassDays}일, 마지막 날 밤 11시 59분까지`,
      note: null,
    },
  ];
}
