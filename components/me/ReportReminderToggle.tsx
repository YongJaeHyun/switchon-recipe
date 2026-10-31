import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { CHANNELS } from 'const/channels';
import { useUserSetting } from 'hooks/useWeights';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { requireOnline } from 'utils/network';
import { enablePushForChannel, showNotificationPermissionAlert } from 'utils/notifications';
import { reportReminderOnFrom } from 'utils/reportReminder';

// 리포트 알림 켜기/끄기 (기본 켜짐). 끄면 서버가 주간 리포트 도착 푸시와 전날 저녁 기록 알림을 보내지 않는다
// (리포트는 그대로 만든다). 저장 실패 시 API가 토스트를 띄우고 스위치를 되돌린다
export function ReportReminderToggle() {
  const { setting, updateSetting } = useUserSetting();
  const saved = reportReminderOnFrom(setting);

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
      if (on && (await enablePushForChannel(CHANNELS.REPORT)) === 'denied') {
        setValue(false);
        showNotificationPermissionAlert();
        return;
      }
      const result = await updateSetting({ report_reminder: on });
      if (!result) setValue(!on);
    } catch {
      setValue(!on);
    } finally {
      setIsSaving(false);
    }
  });

  return (
    <View className="w-full flex-row items-center justify-between gap-3 rounded-xl border border-neutral-300 bg-neutral-50 px-5 py-3">
      <View className="flex-1 flex-row items-center gap-5">
        <MaterialIcons name="summarize" size={24} color={colors.neutral[600]} />
        <View className="flex-1">
          <Text className="text-lg text-neutral-600">리포트 알림</Text>
          <Text className="text-sm text-neutral-500">
            주간 리포트가 나오면, 그리고 나오기 전날 저녁에 알려드려요
          </Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={handleChange}
        disabled={isSaving}
        accessibilityLabel="리포트 알림"
        trackColor={{ false: colors.neutral[300], true: colors.green[600] }}
        thumbColor="white"
      />
    </View>
  );
}
