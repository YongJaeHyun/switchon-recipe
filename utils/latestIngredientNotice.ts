import { IngredientRecord } from 'types/recipe';
import { convertToKoreanDate } from './date';

const getMonthWeek = (createdAt: string) => {
  const date = convertToKoreanDate(createdAt);
  return { month: date.getMonth() + 1, week: Math.ceil(date.getDate() / 7) };
};

// 가장 최근에 추가된 재료가 속한 "N월 N째 주"와 그 주에 추가된 재료 (이름 목록과 자세한 정보)
export const getLatestIngredientNotice = (list: IngredientRecord[]) => {
  const added = list
    .filter((i) => i.source !== 'seed')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const latest = added.at(-1);
  if (!latest) return null;

  const { month, week } = getMonthWeek(latest.createdAt);
  const latestYear = convertToKoreanDate(latest.createdAt).getFullYear();
  const sameWeek = added.filter((i) => {
    const date = getMonthWeek(i.createdAt);
    const year = convertToKoreanDate(i.createdAt).getFullYear();
    return year === latestYear && date.month === month && date.week === week;
  });

  return {
    month,
    week,
    names: sameWeek.map((i) => i.name),
    // 공지를 누르면 보여 주는 재료 창용: 몇 주차부터 쓰는지, 탄수화물인지
    items: sameWeek.map((i) => ({
      name: i.name,
      week: i.week,
      isCarbohydrate: i.isCarbohydrate === true,
    })),
  };
};
