import { Text } from 'components/common/Text';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import colors from 'tailwindcss/colors';
import { pointerWeight } from 'utils/weight';

export interface WeightChartPoint {
  value: number;
  label: string;
  dataPointColor: string;
}

interface WeightChartProps {
  points: WeightChartPoint[];
  height?: number;
  // 홈 카드용 작은 그래프: 축 글자·터치 표시 없이 폭에 맞춘다
  compact?: boolean;
}

const SECTIONS = 4;
const Y_LABEL_WIDTH = 32;
const SPACING = 44;
const INITIAL_SPACING = 16;

// y축 범위: 최저·최고에서 1kg씩 여유를 두고, 눈금이 정수가 되도록 4칸으로 맞춘다
const yRange = (values: number[]) => {
  const min = Math.floor(Math.min(...values)) - 1;
  const max = Math.ceil(Math.max(...values)) + 1;
  const step = Math.max(1, Math.ceil((max - min) / SECTIONS));
  return { offset: min, maxValue: step * SECTIONS, step };
};

// 체중 꺾은선 그래프 (곡선, 점은 주차 색). 점이 하나뿐이면 점 하나와 안내를 보여준다
export function WeightChart({ points, height = 180, compact = false }: WeightChartProps) {
  const [width, setWidth] = useState(0);
  const range = useMemo(() => yRange(points.map((p) => p.value)), [points]);

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
          data={points}
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
