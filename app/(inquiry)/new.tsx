import { MaterialIcons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { InquiryAPI } from 'api/InquiryAPI';
import ConfirmModal from 'components/common/ConfirmModal';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import CategoryButton from 'components/inquiry/CategoryButton';
import { CHANNELS } from 'const/channels';
import { QueryKey } from 'const/queryKey';
import { router } from 'expo-router';
import { queryClient } from 'lib/queryClient';
import { useState } from 'react';
import { FlatList, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import colors from 'tailwindcss/colors';
import { InquiryCategory, InquiryDB } from 'types/database';
import { registerForPushNotificationsAsync } from 'utils/notifications';

type InquiryError = Pick<InquiryDB, 'title' | 'message'>;

const categories: InquiryCategory[] = ['일반 문의', '버그 신고', '기능 요청'];

export default function NewInquiryScreen() {
  const [isModalVisible, setModalVisible] = useState(false);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<InquiryCategory>('일반 문의');
  const [errors, setErrors] = useState<Partial<InquiryError>>({});

  const { mutate: insertInquiry, isPending } = useMutation({
    mutationFn: InquiryAPI.insert,
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
    setErrors({ title: '', message: '' });
  };

  const validateAndShowModal = () => {
    if (!validate()) return;
    setModalVisible(true);
  };

  const handleConfirm = async () => {
    insertInquiry({ title, message, category });

    router.back();

    resetInquiry();
    setModalVisible(false);

    await registerForPushNotificationsAsync(CHANNELS.INQUIRY);
  };

  return (
    <SafeAreaView className="flex-1 justify-between bg-white p-4">
      <ScrollView contentContainerClassName="gap-6">
        <View className="flex-row items-center gap-4">
          <TouchableOpacity onPress={router.back}>
            <MaterialIcons name="arrow-back" size={28} color="black" />
          </TouchableOpacity>
          <Text className="text-xl font-bold">새 문의사항</Text>
        </View>

        <View className="gap-10">
          <View>
            <Text className="mb-2 text-lg font-semibold">카테고리</Text>
            <FlatList
              data={categories}
              contentContainerClassName="gap-4"
              renderItem={({ item }) => (
                <CategoryButton
                  category={item}
                  currentCategory={category}
                  onPress={() => setCategory(item)}
                />
              )}
              horizontal
            />
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
        </View>
      </ScrollView>

      <RippleButton
        className="w-full bg-green-600 py-5"
        onPress={validateAndShowModal}
        rounded="xl">
        <Text className="text-lg font-medium text-white">제출하기</Text>
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
        disabled={isPending}
      />
    </SafeAreaView>
  );
}
