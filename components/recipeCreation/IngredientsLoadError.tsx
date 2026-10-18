import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { View } from 'react-native';

interface IngredientsLoadErrorProps {
  onRetry: () => void;
}

export function IngredientsLoadError({ onRetry }: IngredientsLoadErrorProps) {
  return (
    <View className="flex-1 items-center justify-center gap-4">
      <Text className="text-neutral-600">재료를 불러오지 못했어요.</Text>
      <RippleButton
        outerClassName="border border-neutral-500"
        className="px-4 py-3"
        onPress={onRetry}>
        <Text className="text-neutral-600">다시 시도</Text>
      </RippleButton>
    </View>
  );
}
