import { Text } from 'components/common/Text';
import { Modal, TouchableOpacity, View } from 'react-native';
import type { QuotaModalAction } from 'utils/recipeQuota';

type QuotaExceededModalProps = {
  visible: boolean;
  actions: QuotaModalAction[];
  onWatchAd: () => void;
  onPass: () => void;
  onClose: () => void;
};

export default function QuotaExceededModal({
  visible,
  actions,
  onWatchAd,
  onPass,
  onClose,
}: QuotaExceededModalProps) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40">
        <View className="w-2/3 justify-between rounded-2xl bg-white p-6">
          <Text className="mb-2 text-center text-xl font-bold">오늘 레시피를 모두 만들었어요</Text>
          <Text className="mb-8 text-center text-gray-600">내일 다시 만들 수 있어요.</Text>

          <View className="gap-3">
            {actions.includes('watchAd') && (
              <TouchableOpacity className="rounded-xl bg-green-600 py-3" onPress={onWatchAd}>
                <Text className="text-center font-medium text-white">광고 보고 1개 더 만들기</Text>
              </TouchableOpacity>
            )}
            {actions.includes('pass') && (
              <TouchableOpacity
                className="rounded-xl border border-green-600 py-3"
                onPress={onPass}>
                <Text className="text-center font-medium text-green-600">패스 보기</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity className="rounded-xl bg-gray-200 py-3" onPress={onClose}>
              <Text className="text-center font-medium text-gray-700">닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
