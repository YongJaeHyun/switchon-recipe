import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from 'components/common/Text';
import { router } from 'expo-router';
import { Linking, Modal, Pressable, TouchableOpacity, View } from 'react-native';
import colors from 'tailwindcss/colors';

// Play 스토어 결제 기록 (구매 후 48시간 안에는 사용자가 여기서 직접 환불을 요청할 수 있다)
const PLAY_ORDER_HISTORY_URL = 'https://play.google.com/store/account/orderhistory';

interface RefundGuideModalProps {
  visible: boolean;
  onClose: () => void;
}

// 내 정보 탭 > 환불 안내. 결제는 Google Play가 처리해서 앱 안에서는 환불하지 않는다.
// 정책(운영자 2026-11-03): 48시간 안은 Play에서 직접, 그 뒤는 결제 오류·중복 결제 등 문제가 있을 때만.
// 환불되면 서버(sync-voided-purchases)가 그 구매로 받은 패스 기간을 회수한다
export function RefundGuideModal({ visible, onClose }: RefundGuideModalProps) {
  const openInquiry = () => {
    onClose();
    router.push({ pathname: '/(inquiry)/new', params: { category: '환불 문의' } });
  };

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-6">
        <Pressable className="absolute inset-0" onPress={onClose} accessible={false} />
        <View className="w-full max-w-sm overflow-hidden rounded-3xl bg-white">
          <View className="gap-4 px-6 pb-6 pt-6">
            <Text className="text-xl font-bold text-neutral-900">패스 환불 안내</Text>

            <View className="gap-1">
              <Text className="text-base font-bold text-neutral-800">구매 후 48시간 안</Text>
              <Text className="text-sm leading-5 text-neutral-600">
                Play 스토어에서 바로 환불을 요청할 수 있어요.{'\n'}Play 스토어 → 프로필 → 결제 및
                정기 결제 → 예산 및 기록
              </Text>
              <TouchableOpacity
                onPress={() => void Linking.openURL(PLAY_ORDER_HISTORY_URL)}
                hitSlop={6}
                accessibilityRole="link"
                className="mt-1 flex-row items-center gap-1 self-start">
                <Text className="text-sm font-bold text-green-700">Play 스토어 결제 기록 열기</Text>
                <MaterialIcons name="open-in-new" size={14} color={colors.green[700]} />
              </TouchableOpacity>
            </View>

            <View className="gap-1">
              <Text className="text-base font-bold text-neutral-800">48시간이 지났다면</Text>
              <Text className="text-sm leading-5 text-neutral-600">
                단순 변심으로는 환불되지 않아요. 결제 오류나 중복 결제처럼 문제가 있었다면 환불
                문의로 남겨 주세요. 확인해서 처리해 드려요.
              </Text>
            </View>

            <Text className="text-xs leading-4 text-neutral-400">
              환불되면 그 구매로 받은 패스 기간은 사라져요.
            </Text>

            <TouchableOpacity className="rounded-2xl bg-green-600 py-4" onPress={openInquiry}>
              <Text className="text-center text-base font-bold text-white">환불 문의 남기기</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity className="border-t border-neutral-100 py-4" onPress={onClose}>
            <Text className="text-center text-base text-neutral-500">닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
