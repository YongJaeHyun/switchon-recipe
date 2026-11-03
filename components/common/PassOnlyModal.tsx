import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { PASS_FEATURE_IMAGES } from 'const/passFeatureImages';
import type { PassFeatureId } from 'const/passFeatures';
import { router } from 'expo-router';
import { useRef } from 'react';
import { Image, Modal, TouchableOpacity, View } from 'react-native';
import colors from 'tailwindcss/colors';

export interface PassOnlyModalView {
  // 이 기능의 실제 화면을 위에 보여 주고, [패스 보기]는 패스 화면 갤러리를 이 기능부터 연다
  featureId: PassFeatureId;
  // 기능 이름과 한 줄 설명
  feature: string;
  description: string;
  // 무료 체험을 다 썼으면 그 안내 (예: "무료 체험 2번을 모두 썼어요")
  trialNote?: string;
  // 지금 이 기기에서 패스를 살 수 있는지 (아니면 [패스 보기] 대신 안내만)
  canBuy: boolean;
}

interface PassOnlyModalProps {
  // null이면 닫힌 상태
  view: PassOnlyModalView | null;
  onClose: () => void;
  // [패스 보기]로 결제 화면에 가기 전에 (예: 바텀시트 안에서 열었으면 시트를 닫는다)
  onBeforeOpenPass?: () => void;
}

// 패스 전용 기능을 패스 없이 눌렀을 때: 바로 결제 화면으로 보내지 않고 먼저 묻는다.
// 레시피 한도 초과 창(QuotaExceededModal)과 같은 모양
export function PassOnlyModal({ view, onClose, onBeforeOpenPass }: PassOnlyModalProps) {
  // 닫히는 페이드 동안 내용이 먼저 사라지지 않도록 마지막 내용을 유지한다
  const lastView = useRef(view);
  if (view) lastView.current = view;
  const shown = view ?? lastView.current;

  const openPass = () => {
    onClose();
    onBeforeOpenPass?.();
    router.push({ pathname: '/pass', params: { feature: shown?.featureId } });
  };

  return (
    <Modal animationType="fade" transparent visible={!!view} onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        {shown && (
          <View className="w-full max-w-sm overflow-hidden rounded-3xl bg-white">
            {/* 실제 화면의 윗부분 (제목이 보이게 위에서부터 자른다) */}
            <View className="bg-green-50 px-6 pt-5">
              <View className="h-52 overflow-hidden rounded-t-2xl border border-b-0 border-neutral-200 bg-white">
                <Image
                  source={PASS_FEATURE_IMAGES[shown.featureId]}
                  style={{ width: '100%', aspectRatio: 606 / 1000 }}
                  accessibilityLabel={`${shown.feature} 화면`}
                />
              </View>
            </View>
            <View className="items-center px-6 pb-6 pt-5">
              <View className="mb-2 flex-row items-center gap-1 rounded-full bg-green-50 px-2.5 py-1">
                <MaterialIcons name="diamond" size={14} color={colors.green[700]} />
                <Text className="text-xs font-bold text-green-700">패스</Text>
              </View>
              <Text className="text-center text-xl font-bold text-neutral-900">
                스위치온 패스 기능이에요
              </Text>
              <Text className="mt-2 text-center text-base font-semibold text-green-800">
                {shown.feature}
              </Text>
              <Text className="mt-1 text-center text-sm leading-5 text-neutral-500">
                {shown.description}
              </Text>
              {shown.trialNote && (
                <Text className="mt-3 text-center text-sm text-neutral-400">{shown.trialNote}</Text>
              )}

              {shown.canBuy ? (
                <TouchableOpacity
                  className="mt-6 w-full rounded-2xl bg-green-600 py-4"
                  onPress={openPass}>
                  <Text className="text-center text-base font-bold text-white">패스 보기</Text>
                </TouchableOpacity>
              ) : (
                <Text className="mt-5 text-center text-sm text-neutral-500">
                  지금은 이 기기에서 패스를 살 수 없어요
                </Text>
              )}
            </View>

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
