import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { type ComponentProps, type ReactNode } from 'react';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import type { WeeklyStats } from 'types/report';
import { formatItemRate, formatWeightDiff } from 'utils/reportDisplay';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

const StatRow = ({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: ReactNode;
}) => (
  <View className="flex-row gap-3">
    <MaterialIcons name={icon} size={20} color={colors.green[600]} />
    <View className="flex-1 gap-1">
      <Text className="text-sm text-neutral-500">{label}</Text>
      {children}
    </View>
  </View>
);

const Value = ({ children }: { children: ReactNode }) => (
  <Text className="text-base font-bold text-neutral-800">{children}</Text>
);

const Sub = ({ children }: { children: ReactNode }) => (
  <Text className="text-sm text-neutral-600">{children}</Text>
);

// "숫자로 본 이번 주": 서버가 계산한 stats를 그대로 보여준다 (앱에서 다시 계산하지 않는다)
export function ReportStats({ stats }: { stats: WeeklyStats }) {
  const { weight, todo, fasting, recipes, foodChecks } = stats;

  return (
    <View className="gap-4">
      <StatRow icon="monitor-weight" label="체중">
        {weight.diff !== null && weight.start !== null && weight.end !== null ? (
          <>
            <Value>
              {weight.start.toFixed(1)}kg → {weight.end.toFixed(1)}kg (
              {formatWeightDiff(weight.diff)})
            </Value>
            <Sub>7일 중 {weight.daysLogged}일 기록</Sub>
          </>
        ) : (
          <Value>
            {weight.daysLogged > 0 ? `7일 중 ${weight.daysLogged}일 기록` : '기록 없음'}
          </Value>
        )}
        {weight.totalDiff !== null && <Sub>시작일부터 {formatWeightDiff(weight.totalDiff)}</Sub>}
      </StatRow>

      <StatRow icon="check-circle-outline" label="할 일 완료율">
        <Value>{todo.avgRate !== null ? `평균 ${todo.avgRate}%` : '기록 없음'}</Value>
        {todo.best && (
          <Sub>
            가장 잘한 날 {todo.best.weekday} {todo.best.rate}%
          </Sub>
        )}
        {todo.worst && (
          <Sub>
            가장 낮은 날 {todo.worst.weekday} {todo.worst.rate}%
          </Sub>
        )}
        {todo.items.length > 0 && (
          <View className="mt-1 flex-row flex-wrap gap-2">
            {todo.items.map((item) => (
              <View key={item.name} className="rounded-lg bg-neutral-100 px-2 py-1">
                <Text className="text-xs text-neutral-700">{formatItemRate(item)}</Text>
              </View>
            ))}
          </View>
        )}
      </StatRow>

      {fasting.planned > 0 && (
        <StatRow icon="timer" label="단식">
          <Value>
            {fasting.planned}번 중 {fasting.success}번 성공
          </Value>
          {fasting.successWeekdays.length > 0 && (
            <Sub>성공한 날 {fasting.successWeekdays.join(', ')}</Sub>
          )}
        </StatRow>
      )}

      <StatRow icon="restaurant-menu" label="만든 레시피">
        <Value>{recipes.total}개</Value>
        {recipes.total > 0 && (
          <Sub>
            저탄수 {recipes.low}개 · 무탄수 {recipes.zero}개
          </Sub>
        )}
      </StatRow>

      <StatRow icon="storefront" label="편의점 판정">
        <Value>{foodChecks.total}번</Value>
        {foodChecks.total > 0 && <Sub>피하라고 한 제품 {foodChecks.avoid}개</Sub>}
      </StatRow>
    </View>
  );
}
