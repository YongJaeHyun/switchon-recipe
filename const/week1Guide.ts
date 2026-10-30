import type { PrepItemId } from 'stores/firstWeekStore';
import type { Tip } from 'utils/dietGuide';

// 1주차 안내 문구는 이 파일 한 곳에 모은다 (운영자 검토 대상). 해요체, 의학적 단정 금지.

// 1~3일차 규칙 (시작 전 준비 "1~3일차 규칙 읽기"). 근거: const/baseTodos.ts 1·2단계,
// utils/dietGuide.ts SHAKE_TIP, supabase/functions/_shared/weeklyReport.ts WEEK_BODY_CONTEXT[1]
export const FIRST_DAYS_RULES_TIP: Tip = {
  title: '1~3일차 규칙',
  description: '첫 3일은 네 끼 모두 프로틴 쉐이크로 바꿔요. 4일차부터 점심 한 끼는 저탄수식이에요.',
  points: [
    {
      icon: '🥤',
      title: '하루 네 번 쉐이크',
      text: '아침, 점심, 오후간식, 저녁에 마셔요. 1회 당류 5g 이하 제품을 골라요.',
    },
    {
      icon: '🥛',
      title: '물이나 무가당 음료에',
      text: '물, 무가당 두유, 아몬드 우유에 타서 드세요.',
    },
    {
      icon: '💪',
      title: '네 번 꼭 챙기기',
      text: '첫 주에는 근육도 함께 빠질 수 있어요. 쉐이크를 거르지 말고 단백질을 챙겨주세요.',
    },
  ],
};

// 시작 전 준비 체크리스트 (오늘 탭 '시작 전' 카드)
export const PREP_ITEMS: { id: PrepItemId; label: string; hint?: string }[] = [
  { id: 'shake', label: '프로틴 쉐이크 준비하기', hint: '1~3일차는 네 끼 모두 쉐이크예요' },
  { id: 'rules', label: '1~3일차 규칙 읽기' },
  { id: 'groceries', label: '4일차부터 먹을 저탄수식 재료 장보기' },
  { id: 'mealAlarm', label: '끼니 알림 켜기' },
];
