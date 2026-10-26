import { Text } from 'components/common/Text';
import { WheelPicker } from 'components/common/WheelPicker';
import { useMemo } from 'react';
import { View } from 'react-native';
import { joinTime, rangeItems, splitTime } from 'utils/wheelPicker';

const pad2 = (value: number) => String(value).padStart(2, '0');

interface TimeWheelProps {
  // 분 (시 * 60 + 분)
  value: number;
  onChange: (minutes: number) => void;
  minHour: number;
  maxHour: number;
  minuteStep: number;
  // 있으면 "16 시간 30 분"처럼 단위를, 없으면 "19 : 00"처럼 쌍점을 둔다
  hourUnit?: string;
  minuteUnit?: string;
  accessibilityLabel: string;
}

// 시 휠 + 분 휠. 한쪽이 바뀌면 다른 쪽은 지금 값 그대로 합친다
export function TimeWheel({
  value,
  onChange,
  minHour,
  maxHour,
  minuteStep,
  hourUnit,
  minuteUnit,
  accessibilityLabel,
}: TimeWheelProps) {
  const hours = useMemo(() => rangeItems(minHour, maxHour, 1, pad2), [minHour, maxHour]);
  const minutes = useMemo(() => rangeItems(0, 60 - minuteStep, minuteStep, pad2), [minuteStep]);
  const { hour, minute } = splitTime(value, minuteStep);
  const unitClass = 'text-base font-bold text-neutral-500';

  return (
    <View className="flex-row items-center justify-center gap-2">
      <WheelPicker
        items={hours}
        value={hour}
        onChange={(nextHour) => onChange(joinTime(nextHour, minute))}
        accessibilityLabel={`${accessibilityLabel} 시`}
      />
      {hourUnit ? (
        <Text className={unitClass}>{hourUnit}</Text>
      ) : (
        <Text className="text-2xl font-bold text-neutral-900">:</Text>
      )}
      <WheelPicker
        items={minutes}
        value={minute}
        onChange={(nextMinute) => onChange(joinTime(hour, nextMinute))}
        accessibilityLabel={`${accessibilityLabel} 분`}
      />
      {minuteUnit ? <Text className={unitClass}>{minuteUnit}</Text> : null}
    </View>
  );
}
