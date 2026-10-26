import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { CHANNELS } from 'const/channels';
import { useUserSetting } from 'hooks/useWeights';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { requireOnline } from 'utils/network';
import { enablePushForChannel, showNotificationPermissionAlert } from 'utils/notifications';

// 체중 기록 알림 켜기/끄기. 저장 실패 시 API가 토스트를 띄우고 스위치를 되돌린다
export function WeightReminderToggle() {
  const { setting, updateSetting } = useUserSetting();
  const saved = setting?.weight_reminder ?? false;

  const [value, setValue] = useState(saved);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setValue(saved);
  }, [saved]);

  const handleChange = requireOnline(async (on: boolean) => {
    if (isSaving) return;
    setValue(on);
    setIsSaving(true);
    try {
      // 켤 때 알림 권한을 받는다. 거부하면 켜지 않고 설정에서 허용하도록 안내한다
      // (켜진 것처럼 보이는데 알림이 오지 않는 일을 막는다)
      if (on && (await enablePushForChannel(CHANNELS.REPORT)) === 'denied') {
        setValue(false);
        showNotificationPermissionAlert();
        return;
      }
      const result = await updateSetting({ weight_reminder: on, weight_reminder_asked: true });
      if (!result) setValue(!on);
    } catch {
      setValue(!on);
    } finally {
      setIsSaving(false);
    }
  });

  return (
    <View className="w-full flex-row items-center justify-between rounded-xl border border-neutral-300 bg-neutral-50 px-5 py-3">
      <View className="flex-row items-center gap-5">
        <MaterialIcons name="monitor-weight" size={24} color={colors.neutral[600]} />
        <Text className="text-lg text-neutral-600">체중 기록 알림</Text>
      </View>
      <Switch
        value={value}
        onValueChange={handleChange}
        disabled={isSaving}
        trackColor={{ false: colors.neutral[300], true: colors.green[600] }}
        thumbColor="white"
      />
    </View>
  );
}
