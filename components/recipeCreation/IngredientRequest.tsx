import { FontAwesome6 } from '@expo/vector-icons';
import { sendSlackMessage } from 'api/slack';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import {
  firstWeekIngredients,
  secondWeekIngredients,
  thirdWeekIngredients,
} from 'const/ingredients';
import { useLastPathname } from 'hooks/useLastPathname';
import { useState } from 'react';
import { Modal, TextInput, TouchableWithoutFeedback, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { RecipeType } from 'types/database';
import { isCompletedHangul } from 'utils/hangul';
import { Nullable } from '../../types/common';

interface IngredientRequestError {
  name?: string;
}

export function IngredientRequest() {
  const type = useLastPathname() as RecipeType;

  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Nullable<IngredientRequestError>>(null);

  const allIngredientNames = [
    ...firstWeekIngredients,
    ...secondWeekIngredients,
    ...thirdWeekIngredients,
  ].map((ingredient) => ingredient.name);

  const open = () => setVisible(true);
  const close = () => {
    setVisible(false);
    reset();
  };

  const reset = () => {
    setName('');
    setErrors(null);
  };

  const validate = () => {
    const trimmedName = name.trim();
    const newErrors: IngredientRequestError = {};

    if (!trimmedName) newErrors.name = '재료명을 입력해주세요.';
    else if (!isCompletedHangul(trimmedName))
      newErrors.name = '재료명은 중간에 자음이나 모음이 단독으로 올 수 없어요.';
    else if (allIngredientNames.includes(trimmedName)) newErrors.name = '이미 존재하는 재료예요.';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const submitRequest = async () => {
    if (validate()) {
      const parsedIngredientName = encodeURIComponent(name);
      await sendSlackMessage(
        `🥗 재료 요청 도착!\n\n재료명: ${name}\n이미지:https://pixabay.com/ko/photos/search/${parsedIngredientName}/`
      );

      close();
      reset();
    }
  };

  return (
    <>
      <RippleButton
        outerClassName="w-11/12 max-w-96 border border-neutral-500 self-start mx-auto mb-4"
        className="w-full py-3"
        onPress={open}>
        <View className="flex-row items-center gap-3">
          <FontAwesome6 name="plus" size={16} color={colors.neutral[600]} />
          <Text className="text-neutral-600">찾으시는 재료가 없나요?</Text>
        </View>
      </RippleButton>

      <Modal animationType="fade" transparent visible={visible} onRequestClose={close}>
        <TouchableWithoutFeedback onPress={close}>
          <View className="flex-1 items-center justify-center bg-black/40">
            <View
              className="w-2/3 justify-between rounded-2xl bg-white p-6"
              onStartShouldSetResponder={() => true}>
              <Text className="mb-1 text-xl font-bold">재료 요청</Text>
              <Text className="mb-4 text-sm text-neutral-500">
                검토 후, 스위치온 다이어트에 적합한 재료라면 추가돼요.
              </Text>

              <View className="mb-4">
                <TextInput
                  className="rounded-xl border border-neutral-300 px-3"
                  placeholder="재료명을 입력해주세요 (최대 10글자)"
                  placeholderTextColor={colors.neutral[300]}
                  value={name}
                  maxLength={10}
                  onChangeText={setName}
                  multiline={false}
                  textAlignVertical="center"
                />
                {errors?.name && (
                  <Text className="ml-1 mt-1 text-sm text-red-500">{errors.name}</Text>
                )}
              </View>

              <Text className="mb-4 text-sm text-neutral-500">
                🕒 검토에는 최대 2일 정도 걸려요.
              </Text>
              <View className="flex-row gap-4">
                <RippleButton
                  onPress={close}
                  outerClassName="flex-1"
                  className="w-full bg-gray-200 px-4 py-3">
                  <Text className="text-gray-700">취소</Text>
                </RippleButton>
                <RippleButton
                  onPress={submitRequest}
                  outerClassName="flex-1"
                  className={`w-full px-4 py-3 ${type === 'zero' ? 'bg-green-600' : 'bg-amber-500'}`}>
                  <Text className="text-white">제출</Text>
                </RippleButton>
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}
