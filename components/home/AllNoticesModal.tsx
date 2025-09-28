// components/ConfirmModal.tsx
import { Text } from 'components/common/Text';
import { allNotices } from 'const/notices';
import { FlatList, Modal, Pressable, View } from 'react-native';
import NoticeToggle from './NoticeToggle';

type ConfirmModalProps = {
  visible: boolean;
  onClose: () => void;
};

export default function AllNoticesModal({ visible, onClose }: ConfirmModalProps) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40">
        <View className="max-h-[80%] w-4/5 rounded-2xl bg-white p-6">
          <Text className="mb-4 text-xl font-bold">업데이트 내역</Text>

          <FlatList
            contentContainerClassName="gap-3"
            data={allNotices}
            renderItem={({ item: { version, changes, updatedAt }, index }) => (
              <NoticeToggle
                version={version}
                changes={changes}
                updatedAt={updatedAt}
                defaultOpen={index === 0}
              />
            )}
          />

          <Pressable className="mt-4 rounded-xl bg-green-600 p-3" onPress={onClose}>
            <Text className="text-center font-semibold text-white">닫기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
