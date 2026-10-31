import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { WeightChart } from 'components/weight/WeightChart';
import { type ComponentProps, type ReactNode } from 'react';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import type { WeeklyStats } from 'types/report';
import { getWeekColorHex } from 'utils/getWeekColor';
import { formatFastingStat, formatWeightDiff } from 'utils/reportDisplay';
import {
  type FastingDot,
  type FastingDotKind,
  itemProgress,
  type TodoBar,
} from 'utils/reportVisual';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

const GREEN = colors.green[600];
const BAR_HEIGHT = 72;

const Part = ({ title, children }: { title: string; children: ReactNode }) => (
  <View className="gap-3">
    <Text className="text-sm font-bold text-neutral-800">{title}</Text>
    {children}
  </View>
);

const Sub = ({ children }: { children: ReactNode }) => (
  <Text className="text-sm text-neutral-600">{children}</Text>
);

// 요일별 할 일 완료: 7개 막대, 가장 잘한 날만 진한 초록 + %
const DailyBars = ({ bars }: { bars: TodoBar[] }) => (
  <View className="flex-row items-end justify-between gap-1.5">
    {bars.map((bar) => (
      <View
        key={bar.day}
        className="flex-1 items-center gap-1"
        accessible
        accessibilityLabel={`${bar.weekday}요일 ${bar.rate !== null ? `${bar.rate}%` : '기록 없음'}`}>
        <Text
          className={`text-[11px] font-bold ${bar.isBest ? 'text-green-700' : 'text-transparent'}`}
          maxFontSizeMultiplier={1.2}>
          {bar.rate ?? 0}%
        </Text>
        <View
          className="w-full justify-end overflow-hidden rounded-md bg-neutral-100"
          style={{ height: BAR_HEIGHT }}>
          {bar.rate !== null && (
            <View
              className={`w-full rounded-md ${bar.isBest ? 'bg-green-600' : 'bg-green-200'}`}
              style={{ height: Math.max(3, bar.height * BAR_HEIGHT) }}
            />
          )}
        </View>
        <Text
          className={`text-xs ${bar.isBest ? 'font-bold text-green-700' : 'text-neutral-500'}`}
          maxFontSizeMultiplier={1.2}>
          {bar.weekday}
        </Text>
      </View>
    ))}
  </View>
);

// 항목별 완료 막대 + 완료/등장
const ItemBars = ({ items }: { items: WeeklyStats['todo']['items'] }) => (
  <View className="gap-2.5">
    {itemProgress(items).map((item) => (
      <View
        key={item.name}
        className="gap-1"
        accessible
        accessibilityLabel={`${item.name} ${item.appeared}번 중 ${item.done}번 완료`}>
        <View className="flex-row items-baseline justify-between gap-2">
          <Text className="flex-1 text-sm text-neutral-700" numberOfLines={1}>
            {item.name}
          </Text>
          <Text className="text-xs text-neutral-500">
            {item.done}/{item.appeared}
          </Text>
        </View>
        <View className="h-2 overflow-hidden rounded-full bg-neutral-100">
          <View
            className={`h-full rounded-full ${item.ratio >= 1 ? 'bg-green-600' : 'bg-green-400'}`}
            style={{ width: `${item.percent}%` }}
          />
        </View>
      </View>
    ))}
  </View>
);

const DOT: Record<FastingDotKind, { icon: IconName; bg: string; fg: string; label: string }> = {
  success: { icon: 'check', bg: colors.green[600], fg: colors.white, label: '성공' },
  early: { icon: 'close', bg: colors.amber[500], fg: colors.white, label: '일찍 끝냄' },
  missed: { icon: 'remove', bg: colors.neutral[200], fg: colors.neutral[500], label: '결과 없음' },
  pending: { icon: 'more-horiz', bg: colors.white, fg: colors.neutral[400], label: '응답 대기' },
};

const FastingDots = ({ dots }: { dots: FastingDot[] }) => (
  <View className="gap-2">
    <View className="flex-row flex-wrap gap-3">
      {dots.map((dot) => {
        const style = DOT[dot.kind];
        return (
          <View
            key={dot.day}
            className="items-center gap-1"
            accessible
            accessibilityLabel={`${dot.weekday}요일 단식 ${style.label}`}>
            <View
              className="h-8 w-8 items-center justify-center rounded-full"
              style={{
                backgroundColor: style.bg,
                borderWidth: dot.kind === 'pending' ? 1.5 : 0,
                borderColor: colors.neutral[300],
                borderStyle: 'dashed',
              }}>
              <MaterialIcons name={style.icon} size={18} color={style.fg} />
            </View>
            <Text className="text-xs text-neutral-500">{dot.weekday}</Text>
          </View>
        );
      })}
    </View>
    {/* 이 주에 나온 점 종류만 풀이 */}
    <Text className="text-xs text-neutral-500">
      {(Object.keys(DOT) as FastingDotKind[])
        .filter((kind) => dots.some((dot) => dot.kind === kind))
        .map((kind) => `${DOT_MARK[kind]} ${DOT[kind].label}`)
        .join('   ')}
    </Text>
  </View>
);

const DOT_MARK: Record<FastingDotKind, string> = {
  success: '✓',
  early: '✕',
  missed: '–',
  pending: '…',
};

const Chip = ({ icon, children }: { icon: IconName; children: ReactNode }) => (
  <View className="flex-row items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5">
    <MaterialIcons name={icon} size={14} color={colors.neutral[500]} />
    <Text className="text-xs text-neutral-700">{children}</Text>
  </View>
);

// "숫자로 본 이번 주": 요일별 막대·체중 흐름(그 주 기록이 있을 때만)과 리포트 숫자.
// weight는 지금 기록으로 다시 계산한 값(못 받으면 리포트 값). bars·weightPoints·fastingDots는 앱에서 받은 기록
export function ReportStats({
  stats,
  weight,
  week,
  bars,
  weightPoints,
  fastingDots,
  weightExtra,
}: {
  stats: WeeklyStats;
  weight: WeeklyStats['weight'];
  week: number;
  bars: TodoBar[] | null;
  weightPoints: { value: number; label: string }[];
  fastingDots: FastingDot[];
  weightExtra?: ReactNode; // 체중 빠진 날 안내 카드
}) {
  const { todo, fasting, recipes, foodChecks } = stats;
  const pointColor = getWeekColorHex(week) || GREEN;

  return (
    <View className="gap-6">
      <Part title="요일별 할 일 완료">
        {bars && <DailyBars bars={bars} />}
        <View className="gap-0.5">
          <Sub>{todo.avgRate !== null ? `평균 ${todo.avgRate}%` : '할 일 기록이 없어요'}</Sub>
          {!bars && todo.best && (
            <Sub>
              가장 잘한 날 {todo.best.weekday} {todo.best.rate}%
            </Sub>
          )}
          {todo.worst && (
            <Sub>
              가장 낮은 날 {todo.worst.weekday} {todo.worst.rate}%
            </Sub>
          )}
        </View>
      </Part>

      <Part title="체중 흐름">
        {weightPoints.length >= 2 && (
          <WeightChart
            points={weightPoints.map((p) => ({ ...p, dataPointColor: pointColor }))}
            height={140}
          />
        )}
        {weight.diff !== null && weight.start !== null && weight.end !== null ? (
          <View className="gap-0.5">
            <Text className="text-base font-bold text-neutral-800">
              {weight.start.toFixed(1)}kg → {weight.end.toFixed(1)}kg (
              {formatWeightDiff(weight.diff)})
            </Text>
            <Sub>7일 중 {weight.daysLogged}일 기록</Sub>
          </View>
        ) : (
          <Sub>{weight.daysLogged > 0 ? `7일 중 ${weight.daysLogged}일 기록` : '기록 없음'}</Sub>
        )}
        {weight.totalDiff !== null && <Sub>시작일부터 {formatWeightDiff(weight.totalDiff)}</Sub>}
        {weightExtra}
      </Part>

      {todo.items.length > 0 && (
        <Part title="항목별로 보면">
          <ItemBars items={todo.items} />
        </Part>
      )}

      {fasting.planned > 0 && (
        <Part title={`단식 ${formatFastingStat(fasting).value}`}>
          {fastingDots.length > 0 && <FastingDots dots={fastingDots} />}
          <View className="gap-0.5">
            {formatFastingStat(fasting).details.map((line) => (
              <Sub key={line}>{line}</Sub>
            ))}
          </View>
        </Part>
      )}

      <View className="flex-row flex-wrap gap-2">
        <Chip icon="restaurant-menu">
          레시피 {recipes.total}개
          {recipes.total > 0 ? ` (저탄수 ${recipes.low} · 무탄수 ${recipes.zero})` : ''}
        </Chip>
        <Chip icon="fact-check">
          음식 판정 {foodChecks.total}번
          {foodChecks.total > 0 ? ` (피할 음식 ${foodChecks.avoid})` : ''}
        </Chip>
      </View>
    </View>
  );
}
