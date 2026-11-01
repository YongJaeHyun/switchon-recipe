import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { FeedbackAPI } from 'api/FeedbackAPI';
import { Text } from 'components/common/Text';
import { APP_VERSION } from 'const/const';
import { QueryKey } from 'const/queryKey';
import { queryClient } from 'lib/queryClient';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { openStoreReview } from 'services/reviewPrompt';
import { useReviewPromptStore } from 'stores/reviewPromptStore';
import { useUserStore } from 'stores/userStore';
import { useWeekCompletePopupStore } from 'stores/weekCompletePopupStore';
import colors from 'tailwindcss/colors';
import type { PassStatus } from 'types/pass';
import type { ReviewTrigger } from 'utils/reviewPrompt';
import { showSuccessToast } from 'utils/showToast';

const MAX_LENGTH = 500;

// 앱 리뷰 묻기 (utils/reviewPrompt가 언제 물을지 정한다). 패스 기능 창(PassOnlyModal)과 같은 모양.
// 좋아요 → Play 인앱 리뷰 / 아쉬워요 → 같은 창에서 짧은 의견 받기 (send-feedback → 운영자 Slack)
// 닫기(✕·뒤로)도 물은 것으로 센다 (창을 띄울 때 이미 기록함)
export function ReviewPromptModal() {
  const trigger = useReviewPromptStore((state) => state.trigger);
  const close = useReviewPromptStore((state) => state.close);

  // 닫히는 페이드 동안 내용이 먼저 바뀌지 않도록 마지막 계기를 유지한다
  const lastTrigger = useRef<ReviewTrigger | null>(trigger);
  if (trigger) lastTrigger.current = trigger;

  const [step, setStep] = useState<'ask' | 'feedback'>('ask');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 새로 열릴 때마다 처음 단계부터
  useEffect(() => {
    if (!trigger) return;
    setStep('ask');
    setMessage('');
    setError(null);
  }, [trigger]);

  const handleClose = () => {
    if (sending) return;
    close();
  };

  const handleLike = () => {
    close();
    void openStoreReview();
  };

  const handleSend = async () => {
    const text = message.trim();
    const sentTrigger = lastTrigger.current;
    if (!text || sending || !sentTrigger) return;
    setSending(true);
    setError(null);
    const uid = useUserStore.getState().id;
    const pass = queryClient.getQueryData<PassStatus>([QueryKey.pass, uid]);
    const outcome = await FeedbackAPI.send({
      message: text,
      trigger: sentTrigger,
      app_version: APP_VERSION,
      week: useWeekCompletePopupStore.getState().week,
      has_pass: pass ? pass.hasAccess : null,
    });
    setSending(false);
    if (outcome.status === 'ok') {
      close();
      showSuccessToast({ textType: 'CUSTOM', title: '의견을 보냈어요. 고맙습니다' });
      return;
    }
    setError(
      outcome.status === 'rate_limited'
        ? outcome.message
        : outcome.status === 'network'
          ? '인터넷 연결을 확인하고 다시 보내 주세요'
          : '보내지 못했어요. 잠시 뒤 다시 보내 주세요'
    );
  };

  const canSend = message.trim().length > 0 && !sending;

  return (
    <Modal animationType="fade" transparent visible={!!trigger} onRequestClose={handleClose}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full max-w-sm overflow-hidden rounded-3xl bg-white">
            {step === 'ask' ? (
              <View className="px-6 pb-6 pt-7">
                <Text className="text-center text-xl font-bold leading-7 text-neutral-900">
                  스위치온 레시피가{'\n'}도움이 되고 있나요?
                </Text>

                <View className="mt-6 flex-row gap-3">
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="좋아요"
                    className="flex-1 items-center gap-1.5 rounded-2xl border border-green-200 bg-green-50 py-5"
                    onPress={handleLike}>
                    <Text className="text-4xl">😊</Text>
                    <Text className="text-base font-bold text-green-800">좋아요</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="아쉬워요"
                    className="flex-1 items-center gap-1.5 rounded-2xl border border-neutral-200 bg-neutral-50 py-5"
                    onPress={() => setStep('feedback')}>
                    <Text className="text-4xl">😕</Text>
                    <Text className="text-base font-bold text-neutral-700">아쉬워요</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View className="px-6 pb-6 pt-7">
                <Text className="text-center text-xl font-bold text-neutral-900">
                  어떤 점이 아쉬웠나요?
                </Text>
                <Text className="mt-1.5 text-center text-sm leading-5 text-neutral-500">
                  남겨 주신 의견은 앱을 고치는 데 써요
                </Text>

                <TextInput
                  className="mt-5 h-32 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-base text-neutral-900"
                  value={message}
                  onChangeText={(text) => {
                    setMessage(text);
                    if (error) setError(null);
                  }}
                  placeholder="예) 원하는 재료로 레시피가 잘 안 나와요"
                  placeholderTextColor={colors.neutral[400]}
                  multiline
                  textAlignVertical="top"
                  maxLength={MAX_LENGTH}
                  editable={!sending}
                  autoFocus
                />
                <View className="mt-1.5 flex-row items-start justify-between gap-3">
                  <Text className="flex-1 text-sm text-red-600">{error ?? ''}</Text>
                  <Text className="text-xs text-neutral-400">
                    {message.length}/{MAX_LENGTH}
                  </Text>
                </View>

                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canSend, busy: sending }}
                  disabled={!canSend}
                  className={`mt-4 flex-row items-center justify-center gap-2 rounded-2xl py-4 ${
                    canSend || sending ? 'bg-green-600' : 'bg-neutral-200'
                  }`}
                  onPress={() => void handleSend()}>
                  {sending ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <MaterialIcons
                      name="send"
                      size={18}
                      color={canSend ? 'white' : colors.neutral[400]}
                    />
                  )}
                  <Text
                    className={`text-base font-bold ${canSend || sending ? 'text-white' : 'text-neutral-400'}`}>
                    {sending ? '보내는 중' : '보내기'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              className="border-t border-neutral-100 py-4"
              onPress={handleClose}
              disabled={sending}
              hitSlop={4}>
              <Text className="text-center text-base text-neutral-500">닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
