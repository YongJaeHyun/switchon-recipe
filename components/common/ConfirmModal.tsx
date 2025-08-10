// components/ConfirmModal.tsx
import { Text } from 'components/common/Text';
import { Modal, TouchableOpacity, View } from 'react-native';

type ConfirmModalProps = {
  type: 'create' | 'delete';
  iconElement: React.ReactNode;
  visible: boolean;
  title: string;
  message: string;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  type,
  iconElement: Icon,
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  disabled,
}: ConfirmModalProps) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/40">
        <View className="w-2/3 justify-between rounded-2xl bg-white p-6">
          <View>
            <View style={{ alignItems: 'center', marginBottom: 4 }}>{Icon}</View>
            <Text className="mb-2 text-center text-xl font-bold">{title}</Text>
          </View>
          <Text className="mb-8 text-center text-gray-600">{message}</Text>

          <View className="flex-row justify-between gap-4">
            <TouchableOpacity
              className="flex-1 rounded-xl bg-gray-200 py-3"
              onPress={onCancel}
              disabled={disabled}>
              <Text className="text-center font-medium text-gray-700">아니오</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className={`flex-1 rounded-xl py-3 ${type === 'create' ? 'bg-green-600' : 'bg-red-600'}`}
              onPress={onConfirm}
              disabled={disabled}>
              <Text className="text-center font-medium text-white">네</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
