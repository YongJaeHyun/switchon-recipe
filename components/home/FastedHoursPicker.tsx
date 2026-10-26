import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { TimeWheel } from 'components/common/TimeWheel';
import { useState } from 'react';
import { View } from 'react-native';
import {
  canSaveFastedMinutes,
  EARLY_END_WHEEL,
  formatFastedHours,
  minutesForWheel,
} from 'utils/fastingEarlyEnd';

// "일찍 끝냈어요"를 고른 뒤 몇 시간 몇 분 단식했는지 고르는 줄 (시 0~23 × 분 10분 단위). 저장하면 분으로 넘긴다
export function FastedHoursPicker({
  initialMinutes = null,
  disabled,
  onSave,
}: {
  initialMinutes?: number | null;
  disabled?: boolean;
  onSave: (fastedMinutes: number) => void;
}) {
  const [minutes, setMinutes] = useState(() => minutesForWheel(initialMinutes));
  const canSave = canSaveFastedMinutes(minutes);
  const isDisabled = disabled || !canSave;

  return (
    <View className="gap-1 rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-3">
      <Text className="text-sm font-bold text-neutral-800">
        몇 시간 단식했나요? <Text className="text-green-700">{formatFastedHours(minutes)}</Text>
      </Text>
      <TimeWheel
        value={minutes}
        minHour={0}
        maxHour={EARLY_END_WHEEL.maxHour}
        minuteStep={EARLY_END_WHEEL.minuteStep}
        hourUnit="시간"
        minuteUnit="분"
        onChange={setMinutes}
        accessibilityLabel="단식한 시간"
      />
      <RippleButton
        disabled={isDisabled}
        rounded="full"
        outerClassName={`self-end bg-green-600 ${isDisabled ? 'opacity-50' : ''}`}
        className="px-4 py-1.5"
        onPress={() => onSave(minutes)}>
        <Text className="text-sm font-bold text-white">저장</Text>
      </RippleButton>
    </View>
  );
}
