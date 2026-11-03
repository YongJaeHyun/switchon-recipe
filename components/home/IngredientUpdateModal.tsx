import { Text } from 'components/common/Text';
import { useRef } from 'react';
import { FlatList, Modal, Pressable, TouchableOpacity, View } from 'react-native';
import { seosusa } from 'es-hangul';
import type { getLatestIngredientNotice } from 'utils/latestIngredientNotice';

type IngredientNotice = NonNullable<ReturnType<typeof getLatestIngredientNotice>>;

interface IngredientUpdateModalProps {
  // null이면 닫힌 상태
  notice: IngredientNotice | null;
  onClose: () => void;
}

// 홈 공지 띠의 재료 줄을 누르면: 그 주에 새로 들어온 재료와 몇 주차부터 쓰는지. 업데이트 내역 창과 같은 모양
export default function IngredientUpdateModal({ notice, onClose }: IngredientUpdateModalProps) {
  // 닫히는 페이드 동안 내용이 먼저 사라지지 않게 마지막 내용을 둔다
  const last = useRef(notice);
  if (notice) last.current = notice;
  const shown = notice ?? last.current;

  return (
    <Modal animationType="fade" transparent visible={!!notice} onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <Pressable className="absolute inset-0" onPress={onClose} accessible={false} />
        {shown && (
          <View className="max-h-[80%] w-full max-w-sm rounded-3xl bg-white pt-6">
            <View className="gap-1 px-6 pb-2">
              <Text className="text-xl font-bold text-neutral-900">새로 들어온 재료</Text>
              <Text className="text-sm text-neutral-500">
                {shown.month}월 {seosusa(shown.week)}주에 {shown.items.length}가지가 추가됐어요
              </Text>
            </View>

            <FlatList
              data={shown.items}
              keyExtractor={(item) => item.name}
              contentContainerClassName="px-6 pb-2"
              renderItem={({ item, index }) => (
                <View
                  className={`flex-row items-center gap-2 py-3 ${
                    index > 0 ? 'border-t border-neutral-100' : ''
                  }`}>
                  <Text className="flex-1 text-base font-bold text-neutral-900">{item.name}</Text>
                  {item.isCarbohydrate && (
                    <View className="rounded-full bg-amber-50 px-2 py-0.5">
                      <Text className="text-xs font-bold text-amber-700">탄수화물</Text>
                    </View>
                  )}
                  <Text className="text-sm text-neutral-500">{item.week}주차부터</Text>
                </View>
              )}
            />

            <TouchableOpacity className="border-t border-neutral-100 py-4" onPress={onClose}>
              <Text className="text-center text-base text-neutral-500">닫기</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}
