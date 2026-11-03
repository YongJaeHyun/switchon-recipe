import { Text } from 'components/common/Text';
import { allNotices } from 'const/notices';
import { FlatList, Modal, Pressable, TouchableOpacity, View } from 'react-native';
import NoticeToggle from './NoticeToggle';

type AllNoticesModalProps = {
  visible: boolean;
  onClose: () => void;
};

// 업데이트 내역: 최신 버전만 펼치고 지난 버전은 한 줄씩 (누르면 펼침)
export default function AllNoticesModal({ visible, onClose }: AllNoticesModalProps) {
  const currentYear = new Date().getFullYear();
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        {/* 바깥을 누르면 닫는다 (목록 스크롤과 겹치지 않게 카드 뒤에 깐다) */}
        <Pressable className="absolute inset-0" onPress={onClose} accessible={false} />
        <View className="max-h-[80%] w-full max-w-sm rounded-3xl bg-white pt-6">
          <Text className="mb-2 px-6 text-xl font-bold text-neutral-900">업데이트 내역</Text>

          <FlatList
            data={allNotices}
            keyExtractor={(item, index) => `${item.version}-${index}`}
            contentContainerClassName="px-6 pb-2"
            renderItem={({ item: { version, changes, updatedAt }, index }) => (
              <NoticeToggle
                version={version}
                changes={changes}
                updatedAt={updatedAt}
                currentYear={currentYear}
                latest={index === 0}
              />
            )}
          />

          <TouchableOpacity className="border-t border-neutral-100 py-4" onPress={onClose}>
            <Text className="text-center text-base text-neutral-500">닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
