import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { ProgressRing } from 'components/report/ProgressRing';
import { type ComponentProps, type ReactNode } from 'react';
import { View } from 'react-native';
import type { WeeklyStats } from 'types/report';
import { getWeekColorHex, getWeekOnColorHex } from 'utils/getWeekColor';
import { reportMiniStats } from 'utils/reportVisual';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

const RING = 56;
const STROKE = 6;
// 주차 색 위 흐린 흰색 (트랙·보조 글자)
const FAINT = 'rgba(255,255,255,0.3)';
const SOFT = 'rgba(255,255,255,0.85)';

// 할 일 평균 완료율 고리 (숫자는 아래 칸). 기록이 없으면 빈 고리
const Ring = ({ percent, color }: { percent: number | null; color: string }) => (
  <ProgressRing percent={percent} size={RING} stroke={STROKE} color={color} track={FAINT}>
    <MaterialIcons name="check" size={22} color={color} />
  </ProgressRing>
);

const IconBadge = ({ icon, color }: { icon: IconName; color: string }) => (
  <View
    style={{ width: RING, height: RING, borderColor: FAINT, borderWidth: STROKE }}
    className="items-center justify-center rounded-full">
    <MaterialIcons name={icon} size={22} color={color} />
  </View>
);

const Stat = ({
  visual,
  value,
  label,
  color,
  accessibilityLabel,
}: {
  visual: ReactNode;
  value?: string;
  label: string;
  color: string;
  accessibilityLabel: string;
}) => (
  <View className="flex-1 items-center gap-1.5" accessible accessibilityLabel={accessibilityLabel}>
    {visual}
    {!!value && (
      <Text className="text-lg font-bold" style={{ color }} maxFontSizeMultiplier={1.3}>
        {value}
      </Text>
    )}
    <Text className="text-xs font-semibold" style={{ color: SOFT }} maxFontSizeMultiplier={1.3}>
      {label}
    </Text>
  </View>
);

// 리포트 맨 위: 주차 색 카드에 기간, 큰 숫자 셋(할 일 완료·단식 성공·체중 변화), 한 줄 요약.
// 주차 색 위 글자는 늘 흰색 (getWeekOnColorHex, 밝은 주차 색 대비 때문에 굵게)
export function ReportHero({
  week,
  rangeLabel,
  stats,
  weight,
  summary,
}: {
  week: number;
  rangeLabel: string | null;
  stats: WeeklyStats | null;
  weight: WeeklyStats['weight'] | null; // 지금 기록으로 다시 계산한 값 (못 받으면 리포트 값)
  summary: string;
}) {
  const bg = getWeekColorHex(week) || getWeekColorHex(1);
  const on = getWeekOnColorHex(week);
  const mini = stats ? reportMiniStats(stats, weight) : null;

  return (
    <View className="gap-4 rounded-2xl px-5 pb-5 pt-4" style={{ backgroundColor: bg }}>
      <Text className="text-sm font-bold" style={{ color: SOFT }}>
        {week}주차 리포트{rangeLabel ? ` · ${rangeLabel}` : ''}
      </Text>

      {stats && mini && (
        <View className="flex-row">
          <Stat
            color={on}
            visual={<Ring percent={stats.todo.avgRate} color={on} />}
            value={mini.todo}
            label="할 일 완료"
            accessibilityLabel={
              stats.todo.avgRate !== null
                ? `할 일 평균 ${stats.todo.avgRate}% 완료`
                : '할 일 기록 없음'
            }
          />
          <Stat
            color={on}
            visual={<IconBadge icon="timer" color={on} />}
            value={mini.fasting}
            label="단식 성공"
            accessibilityLabel={
              stats.fasting.planned > 0
                ? `단식 ${stats.fasting.planned}번 중 ${stats.fasting.success}번 성공`
                : '이번 주 단식 없음'
            }
          />
          <Stat
            color={on}
            visual={<IconBadge icon="monitor-weight" color={on} />}
            value={mini.weight}
            label="체중 변화"
            accessibilityLabel={
              mini.weight !== '-' ? `체중 변화 ${mini.weight}` : '체중 변화 기록 부족'
            }
          />
        </View>
      )}

      {!!summary && (
        <Text className="text-lg font-bold leading-7" style={{ color: on }}>
          {summary}
        </Text>
      )}
    </View>
  );
}
