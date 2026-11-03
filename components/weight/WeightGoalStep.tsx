import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { BODY_COMP_RANGE, type BodyCompKind } from 'utils/bodyComp';
import { MAX_WEIGHT_KG, MIN_WEIGHT_KG } from 'utils/weight';
import { type GoalInputTexts, parseGoalInputs, type WeightGoal } from 'utils/weightGoal';

// ask: 첫 체중을 저장한 직후 (건너뛸 수 있음), set: 기록 탭 [정하기], edit: "목표까지" 카드를 눌러 바꾸기,
// next: 목표에 닿은 뒤 다음 목표
export type WeightGoalMode = 'ask' | 'set' | 'edit' | 'next';

const TITLES: Record<WeightGoalMode, { title: string; subtitle: string }> = {
  ask: {
    title: '목표 체중을 정해 볼까요?',
    subtitle: '목표까지 얼마나 남았는지 기록 탭에서 보여 드려요',
  },
  set: {
    title: '목표 체중을 정해 볼까요?',
    subtitle: '목표까지 얼마나 남았는지 기록 탭에서 보여 드려요',
  },
  edit: { title: '목표 바꾸기', subtitle: '바꾼 목표로 남은 kg과 진행률을 다시 보여 드려요' },
  next: {
    title: '다음 목표를 정해 볼까요?',
    subtitle: '지난 목표에 닿은 체중부터 다시 세어 드려요',
  },
};

const BODY_GOAL_FIELDS: { kind: BodyCompKind; label: string; placeholder: string }[] = [
  { kind: 'muscle', label: '골격근량', placeholder: '예: 27.0' },
  { kind: 'fat', label: '체지방량', placeholder: '예: 17.0' },
];

const NO_ERRORS = { weight: false, muscle: false, fat: false };

interface WeightGoalStepProps {
  mode: WeightGoalMode;
  // ask일 때 방금 기록한 체중
  recordedKg?: number | null;
  initialTexts: GoalInputTexts;
  // 지금(가장 최근) 체중. 목표는 이보다 낮아야 한다 (모르면 범위만 본다)
  currentKg: number | null;
  saving: boolean;
  onSave(goal: WeightGoal): void;
  onSkip(): void;
}

// 체중 기록 창 안의 목표 입력 단계 (새 시트를 만들지 않고 같은 창에서 바뀐다).
// 목표 체중은 필수, 인바디 목표는 선택. 입력 규칙은 체중·인바디 칸과 같다
export function WeightGoalStep({
  mode,
  recordedKg,
  initialTexts,
  currentKg,
  saving,
  onSave,
  onSkip,
}: WeightGoalStepProps) {
  const [texts, setTexts] = useState(initialTexts);
  // 범위 안내는 저장을 눌렀거나 칸을 벗어났을 때만 (체중 칸과 같다)
  const [errors, setErrors] = useState(NO_ERRORS);
  const [notLower, setNotLower] = useState(false);
  const { title, subtitle } = TITLES[mode];

  const change = (kind: keyof GoalInputTexts, value: string) => {
    setTexts((prev) => ({ ...prev, [kind]: value }));
    setErrors((prev) => ({ ...prev, [kind]: false }));
    if (kind === 'weight') setNotLower(false);
  };

  const blur = (kind: keyof GoalInputTexts) => {
    if (texts[kind].trim() === '') return;
    const parsed = parseGoalInputs(texts, currentKg);
    if (parsed.errors[kind]) setErrors((prev) => ({ ...prev, [kind]: true }));
    if (kind === 'weight') setNotLower(parsed.notLower);
  };

  const save = () => {
    if (saving) return;
    const parsed = parseGoalInputs(texts, currentKg);
    if (!parsed.goal) {
      setErrors(parsed.errors);
      setNotLower(parsed.notLower);
      return;
    }
    onSave(parsed.goal);
  };

  const canSave = !saving && texts.weight.trim() !== '';

  return (
    <View>
      {mode === 'ask' && recordedKg != null && (
        <View className="mb-4 flex-row items-center gap-2 rounded-xl bg-green-50 px-3 py-2.5">
          <MaterialIcons name="check-circle" size={18} color={colors.green[600]} />
          <Text className="font-semibold text-green-800">{`${recordedKg.toFixed(1)}kg 기록했어요`}</Text>
        </View>
      )}
      <Text className="mb-1 text-2xl font-bold">{title}</Text>
      <Text className="mb-4 text-neutral-500">{subtitle}</Text>

      <View
        className="mb-2 flex-row items-center rounded-xl border px-4"
        style={{ borderColor: errors.weight ? colors.red[400] : colors.neutral[300] }}>
        <BottomSheetTextInput
          style={{ flex: 1, fontSize: 28, fontWeight: '700', paddingVertical: 12 }}
          value={texts.weight}
          onChangeText={(value) => change('weight', value)}
          onBlur={() => blur('weight')}
          keyboardType="decimal-pad"
          placeholder="예: 72.0"
          placeholderTextColor={colors.neutral[300]}
          maxLength={6}
          returnKeyType="done"
          onSubmitEditing={save}
          accessibilityLabel="목표 체중"
        />
        <Text className="text-xl font-bold text-neutral-500">kg</Text>
      </View>
      <Text className={`mb-6 text-sm ${errors.weight ? 'text-red-500' : 'text-neutral-400'}`}>
        {notLower
          ? '지금 체중보다 낮게 정해 주세요'
          : errors.weight
            ? `${MIN_WEIGHT_KG}~${MAX_WEIGHT_KG}kg 사이로 입력해 주세요`
            : '소수점 한 자리까지 정할 수 있어요'}
      </Text>

      <View className="mb-3 flex-row items-center gap-2">
        <Text className="font-bold text-neutral-700">인바디 목표</Text>
        <Text className="text-sm text-neutral-400">(선택)</Text>
        <View className="h-px flex-1 bg-neutral-200" />
      </View>
      <View className="mb-2 flex-row gap-3">
        {BODY_GOAL_FIELDS.map(({ kind, label, placeholder }) => {
          const { min, max } = BODY_COMP_RANGE[kind];
          return (
            <View key={kind} className="flex-1">
              <Text className="mb-1 text-sm text-neutral-500">{label}</Text>
              <View
                className="flex-row items-center rounded-xl border px-3"
                style={{ borderColor: errors[kind] ? colors.red[400] : colors.neutral[300] }}>
                <BottomSheetTextInput
                  style={{ flex: 1, fontSize: 20, fontWeight: '700', paddingVertical: 10 }}
                  value={texts[kind]}
                  onChangeText={(value) => change(kind, value)}
                  onBlur={() => blur(kind)}
                  keyboardType="decimal-pad"
                  placeholder={placeholder}
                  placeholderTextColor={colors.neutral[300]}
                  maxLength={5}
                  returnKeyType="done"
                  onSubmitEditing={save}
                  accessibilityLabel={`${label} 목표`}
                />
                <Text className="font-bold text-neutral-500">kg</Text>
              </View>
              {errors[kind] && (
                <Text className="mt-1 text-sm text-red-500">{`${min}~${max}kg 사이로`}</Text>
              )}
            </View>
          );
        })}
      </View>
      <Text className="mb-6 text-sm text-green-700">
        골격근량을 비워 두면 &quot;시작할 때보다 줄지 않기&quot;가 목표예요
      </Text>

      <RippleButton
        outerClassName={`${mode === 'ask' ? 'mb-2' : 'mb-10'} ${canSave ? '' : 'opacity-50'}`}
        className="w-full bg-green-600 py-4"
        disabled={!canSave}
        onPress={save}>
        <Text className="text-lg font-semibold text-white">
          {saving ? '저장하는 중...' : '목표 저장'}
        </Text>
      </RippleButton>
      {mode === 'ask' && (
        <TouchableOpacity className="mb-8 items-center py-3" disabled={saving} onPress={onSkip}>
          <Text className="text-neutral-500">나중에 정할게요</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
