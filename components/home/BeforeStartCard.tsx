import Ionicons from '@expo/vector-icons/Ionicons';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { KakaoShareButton } from 'components/share/KakaoShareButton';
import { FIRST_DAYS_RULES_TIP, PREP_ITEMS } from 'const/week1Guide';
import { Checkbox } from 'expo-checkbox';
import { router } from 'expo-router';
import { TouchableWithoutFeedback, View } from 'react-native';
import { turnOnMealAlarm, useMealAlarmSync } from 'hooks/useMealAlarmSync';
import { useFirstWeekStore, type PrepItemId } from 'stores/firstWeekStore';
import { useMealAlarmStore } from 'stores/mealAlarmStore';
import { useTipSheetStore } from 'stores/tipSheetStore';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { getWeekColorHex } from 'utils/getWeekColor';
import { showNotificationPermissionAlert } from 'utils/notifications';
import { prepChecksFor } from 'utils/prepChecks';
import { startCountdownLabel } from 'utils/programStart';
import { shareInvite } from 'utils/shareKakao';

const WEEK1_COLOR = getWeekColorHex(1);

// 준비 항목마다 바로 할 수 있는 행동 (없으면 체크만)
const ACTIONS: Partial<Record<PrepItemId, { label: string; run: () => void }>> = {
  rules: {
    label: '읽기',
    run: () => {
      useTipSheetStore.getState().open(FIRST_DAYS_RULES_TIP);
      useFirstWeekStore.getState().checkPrep(useUserStore.getState().start_date, 'rules');
    },
  },
  // 저탄수식 만들기 화면이 1주차 재료부터 보여준다
  groceries: { label: '재료 보기', run: () => router.push('/recipeCreation/low') },
  // 끼니 알림은 아래 MEAL_ALARM_ACTIONS (켜져 있는지에 따라)
};

// 끼니 알림 켜기: 꺼져 있으면 바로 켠다(권한 요청), 켜져 있으면 내 정보에서 시각을 바꾼다
const turnOnFromPrep = async () => {
  if (!(await turnOnMealAlarm())) showNotificationPermissionAlert('1주차 끼니 시간 알림');
};
const MEAL_ALARM_ACTIONS = {
  off: { label: '켜기', run: () => void turnOnFromPrep() },
  on: { label: '시각 바꾸기', run: () => router.navigate('/(tabs)/me') },
};

// 시작일이 미래일 때 오늘 탭에서 할 일 대신 보여주는 카드: D-n + 준비 체크리스트(로컬 저장)
export function BeforeStartCard({ daysUntil }: { daysUntil: number }) {
  const startDate = useUserStore((state) => state.start_date);
  const prep = useFirstWeekStore((state) => state.prep);
  const togglePrep = useFirstWeekStore((state) => state.togglePrep);
  const mealAlarmOn = useMealAlarmStore((state) => state.on);
  // 시작 전에도 1주차 끼니 알림을 미리 건다 (오늘 체크 없음)
  useMealAlarmSync([]);
  // 시작일에 묶인 체크만 (시작일을 바꾸면 처음부터). 끼니 알림은 켜져 있는지로 체크한다
  const prepChecks = { ...prepChecksFor(prep, startDate), mealAlarm: mealAlarmOn };
  const doneCount = PREP_ITEMS.filter((item) => prepChecks[item.id]).length;

  return (
    <View className="rounded-xl border border-neutral-200 bg-white px-4 pb-2 pt-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-bold text-neutral-800">{startCountdownLabel(daysUntil)}</Text>
        <Text className="text-sm font-bold text-week-1">
          {doneCount}/{PREP_ITEMS.length}
        </Text>
      </View>
      <Text className="mb-2 mt-1 text-sm text-neutral-500">
        하루 준비하고 시작한 분들이 더 오래 이어가요. 시작 전에 하나씩 챙겨 보세요.
      </Text>

      {PREP_ITEMS.map((item) => {
        const checked = !!prepChecks[item.id];
        const isMealAlarm = item.id === 'mealAlarm';
        const mealAction = MEAL_ALARM_ACTIONS[mealAlarmOn ? 'on' : 'off'];
        const action = isMealAlarm ? mealAction : ACTIONS[item.id];
        // 끼니 알림 칸은 체크로 켜고 끄지 않고 알림을 켠다(켜져 있으면 시각 설정)
        const onPress = isMealAlarm ? mealAction.run : () => togglePrep(startDate, item.id);
        return (
          <TouchableWithoutFeedback key={item.id} onPress={onPress}>
            <View className="flex-row items-center gap-4 py-2">
              <Checkbox color={WEEK1_COLOR} value={checked} onValueChange={onPress} />
              <View className="flex-1">
                <Text className={checked ? 'text-neutral-400 line-through' : 'text-neutral-800'}>
                  {item.label}
                </Text>
                {item.hint && <Text className="text-xs text-neutral-500">{item.hint}</Text>}
              </View>
              {action && (
                <RippleButton
                  onPress={action.run}
                  rounded="full"
                  rippleColor={colors.neutral[300]}
                  outerClassName="bg-neutral-100"
                  className="flex-row items-center gap-1 px-3 py-1.5">
                  <Text className="text-sm text-neutral-600">{action.label}</Text>
                  <Ionicons name="chevron-forward" size={13} color={colors.neutral[500]} />
                </RippleButton>
              )}
            </View>
          </TouchableWithoutFeedback>
        );
      })}

      {/* 같은 날 시작할 친구 부르기 (카톡 초대, 친구는 온보딩에서 이 날짜를 고른다) */}
      <View className="mb-2 mt-2 border-t border-neutral-100 pt-3">
        <KakaoShareButton label="👥 같이 할 사람 초대하기" onPress={shareInvite} />
      </View>
    </View>
  );
}
