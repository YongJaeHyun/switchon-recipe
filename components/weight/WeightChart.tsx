import { Text } from 'components/common/Text';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import colors from 'tailwindcss/colors';
import { pointerWeight, round1 } from 'utils/weight';

export interface WeightChartPoint {
  value: number;
  label: string;
  dataPointColor: string;
  // 이 날 닿은 목표 표시 ("✓ 72kg 달성")
  mark?: string;
}

interface WeightChartProps {
  points: WeightChartPoint[];
  height?: number;
  // 홈 카드용 작은 그래프: 축 글자·터치 표시 없이 폭에 맞춘다
  compact?: boolean;
  // 지금 목표 (kg). 있으면 점선과 "목표 72" 라벨
  goalKg?: number | null;
}

const SECTIONS = 4;
const Y_LABEL_WIDTH = 32;
const SPACING = 44;
// 첫 날짜 글자("10/7")가 왼쪽에서 잘리지 않게 넉넉히 (16이면 "0/7"처럼 앞 글자가 잘렸다)
const INITIAL_SPACING = 24;

// y축 범위: 최저·최고에서 1kg씩 여유를 두고, 눈금이 정수가 되도록 4칸으로 맞춘다
const yRange = (values: number[]) => {
  const min = Math.floor(Math.min(...values)) - 1;
  const max = Math.ceil(Math.max(...values)) + 1;
  const step = Math.max(1, Math.ceil((max - min) / SECTIONS));
  return { offset: min, maxValue: step * SECTIONS, step };
};

const MARK_WIDTH = 76;

// 체중 꺾은선 그래프 (곡선, 점은 주차 색). 점이 하나뿐이면 점 하나와 안내를 보여준다.
// 목표가 있으면 목표 점선(축 범위에 목표를 넣는다), 달성한 날 점에는 작은 "✓ 달성" 표시
export function WeightChart({
  points,
  height = 180,
  compact = false,
  goalKg = null,
}: WeightChartProps) {
  const [width, setWidth] = useState(0);
  const range = useMemo(
    () => yRange([...points.map((p) => p.value), ...(goalKg != null ? [goalKg] : [])]),
    [points, goalKg]
  );
  const data = useMemo(
    () =>
      points.map(({ mark, ...point }) =>
        mark
          ? {
              ...point,
              dataPointLabelShiftX: -MARK_WIDTH / 2 + 15,
              dataPointLabelShiftY: -32,
              dataPointLabelComponent: () => (
                <View style={{ width: MARK_WIDTH }} className="items-center">
                  <Text className="rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {mark}
                  </Text>
                </View>
              ),
            }
          : point
      ),
    [points]
  );

  if (points.length === 0) return null;

  const single = points.length === 1;
  const chartWidth = Math.max(0, width - (compact ? 0 : Y_LABEL_WIDTH) - 8);
  const spacing = compact
    ? Math.max(8, (chartWidth - INITIAL_SPACING * 2) / Math.max(1, points.length - 1))
    : SPACING;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <LineChart
          // 데이터가 바뀌면 스크롤 위치·포인터를 새로 잡는다
          key={`${points.length}-${points[0].label}-${points[points.length - 1].label}`}
          data={data}
          curved
          height={height}
          width={chartWidth}
          spacing={single ? chartWidth / 2 : spacing}
          initialSpacing={single ? chartWidth / 2 : INITIAL_SPACING}
          endSpacing={INITIAL_SPACING}
          thickness={2.5}
          color={colors.neutral[300]}
          dataPointsRadius={compact ? 3.5 : 5}
          yAxisOffset={range.offset}
          maxValue={range.maxValue}
          stepValue={range.step}
          noOfSections={SECTIONS}
          formatYLabel={(label) => String(Math.round(Number(label)))}
          yAxisLabelWidth={compact ? 0 : Y_LABEL_WIDTH}
          hideYAxisText={compact}
          yAxisTextStyle={{ color: colors.neutral[400], fontSize: 11 }}
          xAxisLabelTextStyle={{ color: colors.neutral[400], fontSize: 10, width: 36 }}
          xAxisLabelTexts={compact ? points.map(() => '') : undefined}
          yAxisColor="transparent"
          xAxisColor={colors.neutral[200]}
          rulesColor={colors.neutral[100]}
          rulesType="solid"
          showReferenceLine1={goalKg != null}
          referenceLine1Position={goalKg ?? 0}
          referenceLine1Config={{
            color: colors.green[600],
            type: 'dashed',
            thickness: 1.5,
            dashWidth: 5,
            dashGap: 4,
            labelText: goalKg != null ? `목표 ${round1(goalKg)}` : '',
            labelTextStyle: {
              color: colors.green[700],
              fontSize: 10,
              fontWeight: '700',
              top: -14,
              left: 4,
            },
          }}
          hideRules={compact}
          disableScroll={compact}
          scrollToEnd={!compact}
          pointerConfig={
            compact
              ? undefined
              : {
                  pointerStripColor: colors.neutral[300],
                  pointerStripWidth: 1,
                  pointerColor: colors.green[600],
                  radius: 6,
                  pointerLabelWidth: 72,
                  pointerLabelHeight: 40,
                  shiftPointerLabelX: -30,
                  shiftPointerLabelY: -8,
                  autoAdjustPointerLabelPosition: true,
                  activatePointersOnLongPress: false,
                  // gifted-charts는 yAxisOffset만큼 뺀 항목을 넘기고 셋째 인자로 포인터 index를 준다.
                  // 넘겨받은 값에 offset을 더하지 않고 index로 원래 점을 찾는다
                  pointerLabelComponent: (
                    items: { value: number; label?: string }[],
                    _secondary: unknown,
                    index: number
                  ) => {
                    const weight = pointerWeight(points, index) ?? items[0].value + range.offset;
                    const label = points[index]?.label ?? items[0].label;
                    return (
                      <View className="items-center rounded-lg bg-neutral-800 px-2 py-1">
                        <Text className="text-xs font-bold text-white">{weight.toFixed(1)}kg</Text>
                        {label ? (
                          <Text className="text-[10px] text-neutral-300">{label}</Text>
                        ) : null}
                      </View>
                    );
                  },
                }
          }
        />
      )}
      {single && (
        <Text className="mt-2 text-center text-sm text-neutral-400">
          기록이 2개 이상이면 그래프가 그려져요
        </Text>
      )}
    </View>
  );
}
