import { MaterialIcons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { InquiryAPI } from 'api/InquiryAPI';
import ConfirmModal from 'components/common/ConfirmModal';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import CategoryButton from 'components/inquiry/CategoryButton';
import InquiryImagePicker, { type PickedInquiryImage } from 'components/inquiry/InquiryImagePicker';
import { CHANNELS } from 'const/channels';
import { QueryKey } from 'const/queryKey';
import { router, useLocalSearchParams } from 'expo-router';
import { queryClient } from 'lib/queryClient';
import { useRef, useState } from 'react';
import { ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import colors from 'tailwindcss/colors';
import { InquiryCategory, InquiryDB } from 'types/database';
import { registerForPushNotificationsAsync } from 'utils/notifications';
import { requireOnline } from 'utils/network';

type InquiryError = Pick<InquiryDB, 'title' | 'message'>;

const categories: InquiryCategory[] = ['일반 문의', '버그 신고', '기능 요청', '환불 문의'];

// 내 정보 > 패스 환불 안내에서 들어오면 환불 문의를 골라 둔다 (아는 주제만)
const toCategory = (value: string | string[] | undefined): InquiryCategory => {
  const raw = Array.isArray(value) ? value[0] : value;
  return categories.find((c) => c === raw) ?? '일반 문의';
};

export default function NewInquiryScreen() {
  const [isModalVisible, setModalVisible] = useState(false);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const { category: categoryParam } = useLocalSearchParams<{ category?: string }>();
  const [category, setCategory] = useState<InquiryCategory>(() => toCategory(categoryParam));
  const categoryScrollRef = useRef<ScrollView>(null);
  const scrolledToCategory = useRef(false);
  const [errors, setErrors] = useState<Partial<InquiryError>>({});
  const [images, setImages] = useState<PickedInquiryImage[]>([]);

  // 사진을 먼저 올리고, 다 올라가야 문의를 넣는다. 실패하면(안내는 API가 함) undefined
  const { mutateAsync: sendInquiry, isPending } = useMutation({
    mutationFn: async (input: Pick<InquiryDB, 'title' | 'message' | 'category'>) => {
      const paths = await InquiryAPI.uploadImages(
        images.map(({ base64, mimeType }) => ({ base64, mimeType }))
      );
      if (!paths) return undefined;
      // 사진이 없으면 열을 보내지 않는다 (DB에 열이 생기기 전에 앱이 나가도 문의는 들어간다)
      return InquiryAPI.insert(paths.length > 0 ? { ...input, image_paths: paths } : input);
    },
    onSuccess: (newData) => {
      if (newData) {
        queryClient.setQueryData<InquiryDB[]>([QueryKey.inquiries], (old = []) => [
          newData,
          ...old,
        ]);
      }
    },
    onError: () => {
      setModalVisible(false);
    },
  });

  const validate = () => {
    const newErrors: Partial<InquiryError> = {};
    if (title.trim() === '') newErrors.title = '제목을 입력해주세요.';
    if (message.trim() === '') newErrors.message = '내용을 입력해주세요.';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resetInquiry = () => {
    setTitle('');
    setMessage('');
    setCategory('버그 신고');
    setImages([]);
    setErrors({ title: '', message: '' });
  };

  const validateAndShowModal = () => {
    if (!validate()) return;
    setModalVisible(true);
  };

  const handleConfirm = async () => {
    const newData = await sendInquiry({ title, message, category });
    if (!newData) {
      setModalVisible(false);
      return;
    }

    router.back();

    resetInquiry();
    setModalVisible(false);

    await registerForPushNotificationsAsync(CHANNELS.INQUIRY);
  };

  return (
    <SafeAreaView className="flex-1 justify-between bg-white p-4">
      <ScrollView contentContainerClassName="gap-6 pb-6">
        <View className="flex-row items-center gap-4">
          <TouchableOpacity onPress={router.back}>
            <MaterialIcons name="arrow-back" size={28} color="black" />
          </TouchableOpacity>
          <Text className="text-xl font-bold">새 문의사항</Text>
        </View>

        <View className="gap-10">
          <View>
            <Text className="mb-2 text-lg font-semibold">카테고리</Text>
            {/* 가로로 넘겨 본다. 다른 화면에서 주제를 정해 들어오면(환불 문의) 그 칩이 보이게 넘겨 둔다 */}
            <ScrollView
              ref={categoryScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-4">
              {categories.map((item) => (
                <View
                  key={item}
                  onLayout={(event) => {
                    if (item !== category || scrolledToCategory.current) return;
                    scrolledToCategory.current = true;
                    const { x } = event.nativeEvent.layout;
                    if (x > 0) categoryScrollRef.current?.scrollTo({ x, animated: true });
                  }}>
                  <CategoryButton
                    category={item}
                    currentCategory={category}
                    onPress={() => setCategory(item)}
                  />
                </View>
              ))}
            </ScrollView>
          </View>

          <View>
            <Text className="mb-2 text-lg font-semibold">
              제목 <Text className="text-base text-red-500">*</Text>
            </Text>
            <TextInput
              className="mb-1 rounded border border-gray-300 p-2"
              value={title}
              onChangeText={setTitle}
              placeholder="제목을 입력하세요 (최대 30자)"
              maxLength={30}
            />
            {errors.title && <Text className="text-sm text-red-500">{errors.title}</Text>}
          </View>

          <View>
            <Text className="mb-2 text-lg font-semibold">
              내용 <Text className="text-base text-red-500">*</Text>
            </Text>
            <TextInput
              className="mb-1 h-72 rounded border border-gray-300 p-2"
              value={message}
              onChangeText={setMessage}
              placeholder="문의 내용을 입력하세요 (최대 5000자)"
              multiline
              textAlignVertical="top"
              maxLength={5000}
            />
            {errors.message && <Text className="text-sm text-red-500">{errors.message}</Text>}
          </View>

          <InquiryImagePicker images={images} onChange={setImages} disabled={isPending} />
        </View>
      </ScrollView>

      <RippleButton
        className="w-full bg-green-600 py-5"
        onPress={requireOnline(validateAndShowModal)}
        disabled={isPending}
        rounded="xl">
        <Text className="text-lg font-medium text-white">
          {isPending ? '보내는 중…' : '제출하기'}
        </Text>
      </RippleButton>

      <ConfirmModal
        type="create"
        iconElement={
          <MaterialIcons name="check-circle-outline" size={60} color={colors.green[600]} />
        }
        visible={isModalVisible}
        title="이대로 제출하시겠어요?"
        message="제출 후, 확인하기까지 최대 24시간이 소요될 수 있어요!"
        onConfirm={handleConfirm}
        onCancel={() => setModalVisible(false)}
        confirmLabel={isPending ? '보내는 중…' : '네'}
        disabled={isPending}
      />
    </SafeAreaView>
  );
}
