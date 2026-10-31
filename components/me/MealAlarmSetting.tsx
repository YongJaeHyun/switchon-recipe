import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { TimeWheel } from 'components/common/TimeWheel';
import { syncMealAlarmsSoon, turnOnMealAlarm } from 'hooks/useMealAlarmSync';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { useMealAlarmStore } from 'stores/mealAlarmStore';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { getKoreanDateString } from 'utils/date';
import { formatMinutes } from 'utils/fastingSchedule';
import { mealAlarmNote } from 'utils/mealAlarms';
import {
  MEAL_HOUR_RANGES,
  MEAL_KEYS,
  MEAL_LABELS,
  MEAL_MINUTE_STEP,
  type MealKey,
} from 'utils/mealTimes';
import { showNotificationPermissionAlert, syncMealAlarms } from 'utils/notifications';

// 내 정보 → 끼니 알림: 켜기/끄기(체중 기록 알림 줄과 같은 모양) + 끼니 시각 4개(누르면 시·분 휠, 30분 단위).
// 끼니 시각은 단식 '식후' 시각으로도 쓰여 알림을 꺼도 바꿀 수 있다. 예약은 오늘 탭(useMealAlarmSync)이 맞추고,
// 여기서 바꾸면 잠깐 뒤 바로도 맞춘다 (syncMealAlarmsSoon)
export function MealAlarmSetting() {
  const on = useMealAlarmStore((state) => state.on);
  const times = useMealAlarmStore((state) => state.times);
  const setOn = useMealAlarmStore((state) => state.setOn);
  const setTime = useMealAlarmStore((state) => state.setTime);
  const startDate = useUserStore((state) => state.start_date);
  const note = mealAlarmNote(startDate, getKoreanDateString({ formatType: 'date' }));
  const [editing, setEditing] = useState<MealKey | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = async (next: boolean) => {
    if (isSaving) return;
    if (!next) {
      setOn(false);
      // 오늘 탭이 아직 안 떠 있어도 바로 지운다 (끼니 알림만)
      void syncMealAlarms({
        on: false,
        times,
        startDate: useUserStore.getState().start_date,
        checkedToday: [],
      });
      return;
    }
    setIsSaving(true);
    try {
      // 켤 때 알림 권한을 받는다. 거부하면 켜지 않고 설정에서 허용하도록 안내한다
      if (await turnOnMealAlarm()) syncMealAlarmsSoon();
      else showNotificationPermissionAlert('1주차 끼니 시간 알림');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View className="w-full rounded-xl border border-neutral-300 bg-neutral-50 px-5 py-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-5">
          <MaterialIcons name="restaurant" size={24} color={colors.neutral[600]} />
          <Text className="text-lg text-neutral-600">끼니 알림</Text>
        </View>
        <Switch
          value={on}
          onValueChange={handleChange}
          disabled={isSaving}
          trackColor={{ false: colors.neutral[300], true: colors.green[600] }}
          thumbColor="white"
        />
      </View>
      <Text className="mt-1 text-sm text-neutral-500">
        {note} 끼니 30분 뒤는 단식 ‘식후’ 시각이 돼요.
      </Text>

      <View className="mt-3 flex-row gap-2">
        {MEAL_KEYS.map((meal) => {
          const selected = editing === meal;
          return (
            <RippleButton
              key={`meal-time-${meal}`}
              rippleColor={colors.neutral[300]}
              onPress={() => setEditing(selected ? null : meal)}
              outerClassName="flex-1"
              className={`w-full gap-0.5 rounded-xl py-2 ${selected ? 'bg-green-600' : 'bg-white'}`}
              accessibilityLabel={`${MEAL_LABELS[meal]} ${formatMinutes(times[meal])} 바꾸기`}>
              <Text className={`text-xs ${selected ? 'text-white' : 'text-neutral-500'}`}>
                {MEAL_LABELS[meal]}
              </Text>
              <Text
                className={`text-base font-bold ${selected ? 'text-white' : 'text-neutral-800'}`}>
                {formatMinutes(times[meal])}
              </Text>
            </RippleButton>
          );
        })}
      </View>

      {editing && (
        <View className="mt-3 rounded-xl bg-white py-2">
          <TimeWheel
            key={editing}
            value={times[editing]}
            minHour={MEAL_HOUR_RANGES[editing].minHour}
            maxHour={MEAL_HOUR_RANGES[editing].maxHour}
            minuteStep={MEAL_MINUTE_STEP}
            onChange={(minutes) => {
              setTime(editing, minutes);
              // 오늘 탭이 안 떠 있어도 바뀐 시각으로 다시 건다 (꺼져 있으면 끼니 알림만 지운다)
              syncMealAlarmsSoon();
            }}
            accessibilityLabel={`${MEAL_LABELS[editing]} 시각`}
          />
        </View>
      )}
    </View>
  );
}
