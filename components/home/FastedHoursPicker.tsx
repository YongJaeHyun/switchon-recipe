import RippleButton from 'components/common/RippleButton';
import { StepSlider } from 'components/common/StepSlider';
import { Text } from 'components/common/Text';
import { useState } from 'react';
import { View } from 'react-native';
import { EARLY_END_SLIDER, hoursForSlider } from 'utils/fastingEarlyEnd';

const formatHours = (hours: number) => `${hours}시간`;

// "일찍 끝냈어요"를 고른 뒤 몇 시간 단식했는지 고르는 줄 (1~23시간, 1시간 단위). 저장하면 분으로 넘긴다
export function FastedHoursPicker({
  initialMinutes = null,
  disabled,
  onSave,
}: {
  initialMinutes?: number | null;
  disabled?: boolean;
  onSave: (fastedMinutes: number) => void;
}) {
  const [hours, setHours] = useState(() => hoursForSlider(initialMinutes));

  return (
    <View className="gap-1 rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-3">
      <Text className="text-sm font-bold text-neutral-800">
        몇 시간 단식했나요? <Text className="text-green-700">{formatHours(hours)}</Text>
      </Text>
      <StepSlider
        value={hours}
        min={EARLY_END_SLIDER.min}
        max={EARLY_END_SLIDER.max}
        step={EARLY_END_SLIDER.step}
        onChange={setHours}
        accessibilityLabel="단식한 시간"
        formatValue={formatHours}
      />
      <RippleButton
        disabled={disabled}
        rounded="full"
        outerClassName={`self-end bg-green-600 ${disabled ? 'opacity-50' : ''}`}
        className="px-4 py-1.5"
        onPress={() => onSave(hours * 60)}>
        <Text className="text-sm font-bold text-white">저장</Text>
      </RippleButton>
    </View>
  );
}
