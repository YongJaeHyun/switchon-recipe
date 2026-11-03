import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { VersionAPI } from 'api/VersionAPI';
import { Text } from 'components/common/Text';
import { STORE_URL } from 'const/const';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Modal, TouchableOpacity, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { hasLatestNativeBuild } from 'utils/nativeBuild';
import { type StoreUpdatePrompt, storeUpdatePrompt } from 'utils/storeUpdate';

// 이번 실행에서 안내(suggest)를 닫았는지 (앱을 새로 켜면 다시 안내)
let suggestDismissedThisRun = false;

// 스토어 업데이트 안내 (서버 version.store_update_mode 스위치). 옛 스토어 빌드에서만 뜬다.
// 안내: [업데이트하기] / [나중에]. 필수: 닫을 수 없고 [업데이트하기]만 (뒤로 가기도 막는다)
export function StoreUpdateModal() {
  const [prompt, setPrompt] = useState<StoreUpdatePrompt>('none');

  const check = useCallback(async () => {
    if (__DEV__) return;
    const mode = await VersionAPI.selectStoreUpdateMode();
    setPrompt(
      storeUpdatePrompt({
        mode,
        hasLatestNative: hasLatestNativeBuild(),
        suggestDismissed: suggestDismissedThisRun,
      })
    );
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => sub.remove();
  }, [check]);

  const openStore = () => void Linking.openURL(STORE_URL);
  const later = () => {
    suggestDismissedThisRun = true;
    setPrompt('none');
  };
  const force = prompt === 'force';

  return (
    <Modal
      animationType="fade"
      transparent
      visible={prompt !== 'none'}
      onRequestClose={force ? () => {} : later}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <View className="w-full max-w-sm overflow-hidden rounded-3xl bg-white">
          <View className="items-center px-6 pb-6 pt-7">
            <View className="mb-3 h-12 w-12 items-center justify-center rounded-full bg-green-50">
              <MaterialIcons name="system-update" size={24} color={colors.green[700]} />
            </View>
            <Text className="text-center text-xl font-bold text-neutral-900">
              {force ? '업데이트가 필요해요' : '새 버전이 나왔어요'}
            </Text>
            <Text className="mt-2 text-center text-sm leading-5 text-neutral-500">
              {force
                ? '계속 쓰려면 스토어에서 새 버전으로 업데이트해 주세요.'
                : '요리 모드처럼 새 기능을 제대로 쓰려면 스토어에서 업데이트해 주세요.'}
            </Text>
            <TouchableOpacity
              className="mt-6 w-full rounded-2xl bg-green-600 py-4"
              onPress={openStore}
              accessibilityRole="button">
              <Text className="text-center text-base font-bold text-white">업데이트하기</Text>
            </TouchableOpacity>
          </View>
          {!force && (
            <TouchableOpacity
              className="border-t border-neutral-100 py-4"
              onPress={later}
              accessibilityRole="button">
              <Text className="text-center text-base text-neutral-500">나중에</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}
