import { MaterialIcons } from '@expo/vector-icons';
import { Text } from 'components/common/Text';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { TouchableOpacity, View } from 'react-native';
import colors from 'tailwindcss/colors';
import {
  INQUIRY_IMAGE_MAX_COUNT,
  type InquiryImageMimeType,
  isInquiryImageTooLarge,
  randomImageId,
  remainingInquiryImageSlots,
  resolveInquiryImageMimeType,
} from 'utils/inquiryImages';
import { showErrorToast, showInfoToast } from 'utils/showToast';

export interface PickedInquiryImage {
  // 같은 사진을 두 번 골라도 따로 뺄 수 있게 고를 때마다 새 id
  id: string;
  uri: string;
  base64: string;
  mimeType: InquiryImageMimeType;
}

const THUMB_SIZE = 72;

// 크기 줄이기는 네이티브 모듈(image-manipulator)이 필요해 OTA로 넣을 수 없다. 음식 판정처럼 품질만 낮춘다
const pickerOptions = (limit: number): ImagePicker.ImagePickerOptions => ({
  mediaTypes: ['images'],
  quality: 0.6,
  base64: true,
  allowsEditing: false,
  allowsMultipleSelection: true,
  selectionLimit: limit,
  exif: false,
});

interface InquiryImagePickerProps {
  images: PickedInquiryImage[];
  onChange: (images: PickedInquiryImage[]) => void;
  disabled?: boolean;
}

export default function InquiryImagePicker({
  images,
  onChange,
  disabled,
}: InquiryImagePickerProps) {
  const remaining = remainingInquiryImageSlots(images.length);

  const pick = async () => {
    if (remaining === 0) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showInfoToast({
        textType: 'CUSTOM',
        title: '사진 접근 권한이 필요해요',
        subtitle: '설정에서 권한을 허용해 주세요',
      });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync(pickerOptions(remaining));
    if (result.canceled) return;

    const picked: PickedInquiryImage[] = [];
    let skipped: string | null = null;
    for (const asset of result.assets.slice(0, remaining)) {
      const mimeType = resolveInquiryImageMimeType(asset.mimeType);
      if (!asset.base64) skipped = '사진을 읽지 못했어요';
      else if (!mimeType) skipped = 'JPEG, PNG, WebP 사진만 올릴 수 있어요';
      else if (isInquiryImageTooLarge(asset.base64)) skipped = '5MB가 넘는 사진은 뺐어요';
      else picked.push({ id: randomImageId(), uri: asset.uri, base64: asset.base64, mimeType });
    }

    if (skipped) showErrorToast({ textType: 'CUSTOM', title: skipped });
    if (picked.length > 0) onChange([...images, ...picked]);
  };

  const remove = (id: string) => onChange(images.filter((image) => image.id !== id));

  return (
    <View>
      <View className="mb-2 flex-row items-baseline justify-between">
        <Text className="text-lg font-semibold">
          사진 추가 <Text className="text-base font-normal text-gray-500">(선택)</Text>
        </Text>
        <Text className="text-sm text-gray-500">
          {images.length}/{INQUIRY_IMAGE_MAX_COUNT}
        </Text>
      </View>

      <View className="flex-row gap-3 pr-2 pt-2">
        {images.map((image, index) => (
          <View key={image.id} style={{ width: THUMB_SIZE, height: THUMB_SIZE }}>
            {/* 흰 바탕 사진도 칸이 보이게 얇은 테두리 */}
            <Image
              source={{ uri: image.uri }}
              style={{
                width: THUMB_SIZE,
                height: THUMB_SIZE,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.gray[200],
              }}
              contentFit="cover"
              accessibilityLabel={`첨부한 사진 ${index + 1}`}
            />
            <TouchableOpacity
              onPress={() => remove(image.id)}
              disabled={disabled}
              hitSlop={8}
              accessibilityLabel={`사진 ${index + 1} 빼기`}
              className="absolute -right-2 -top-2 h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-neutral-700">
              <MaterialIcons name="close" size={14} color="white" />
            </TouchableOpacity>
          </View>
        ))}

        {remaining > 0 && (
          <TouchableOpacity
            onPress={pick}
            disabled={disabled}
            accessibilityLabel="사진 고르기"
            style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
            className="items-center justify-center rounded-lg border border-dashed border-gray-300">
            <MaterialIcons name="add-photo-alternate" size={26} color={colors.gray[400]} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
