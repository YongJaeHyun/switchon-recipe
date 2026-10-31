import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { useRef } from 'react';
import { Modal, TouchableOpacity, View } from 'react-native';
import colors from 'tailwindcss/colors';
import type { QuotaModalView } from 'utils/recipeQuota';

type QuotaExceededModalProps = {
  // null이면 닫힌 상태
  view: QuotaModalView | null;
  onWatchAd: () => void;
  onPass: () => void;
  onClose: () => void;
};

// 기능 이름 안에서는 줄이 바뀌지 않도록 이름 속 공백을 줄바꿈 없는 공백으로 바꾼다
const passSummary = ({ lead, features }: NonNullable<QuotaModalView['pass']>) =>
  `${lead} + ${features.map((f) => f.replace(/ /g, '\u00A0')).join(', ')}`;

export default function QuotaExceededModal({
  view,
  onWatchAd,
  onPass,
  onClose,
}: QuotaExceededModalProps) {
  // 닫히는 페이드 동안 내용이 먼저 사라지지 않도록 마지막 내용을 유지한다
  const lastView = useRef(view);
  if (view) lastView.current = view;
  const shown = view ?? lastView.current;

  return (
    <Modal animationType="fade" transparent visible={!!view} onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        {shown && (
          <View className="w-full max-w-sm overflow-hidden rounded-3xl bg-white">
            <View className="px-6 pb-5 pt-7">
              <Text className="text-center text-xl font-bold text-neutral-900">
                {shown.headline}
              </Text>
              {shown.note && (
                <Text className="mt-1.5 text-center text-base text-neutral-500">{shown.note}</Text>
              )}

              {shown.ad && (
                <View className="mt-6">
                  <TouchableOpacity
                    className="flex-row items-center justify-center gap-2 rounded-2xl bg-green-600 py-4"
                    onPress={onWatchAd}>
                    <MaterialIcons name="play-circle-filled" size={22} color="white" />
                    <Text className="text-base font-bold text-white">광고 보고 1개 더 만들기</Text>
                  </TouchableOpacity>
                  {shown.ad.hint && (
                    <Text className="mt-2 text-center text-sm text-neutral-500">
                      {shown.ad.hint}
                    </Text>
                  )}
                </View>
              )}
            </View>

            {shown.pass && (
              <View className="border-t border-neutral-100 bg-green-50/60 px-6 pb-5 pt-5">
                <View className="flex-row items-center gap-1.5">
                  <MaterialIcons name="diamond" size={18} color={colors.green[700]} />
                  <Text className="text-base font-bold text-green-800">스위치온 패스</Text>
                </View>
                <Text className="mt-1.5 text-sm leading-5 text-neutral-600">
                  {passSummary(shown.pass)}
                </Text>
                <TouchableOpacity
                  className="mt-4 rounded-2xl border border-green-600 bg-white py-3"
                  onPress={onPass}>
                  <Text className="text-center text-base font-bold text-green-700">패스 보기</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              className="border-t border-neutral-100 py-4"
              onPress={onClose}
              hitSlop={4}>
              <Text className="text-center text-base text-neutral-500">닫기</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}
