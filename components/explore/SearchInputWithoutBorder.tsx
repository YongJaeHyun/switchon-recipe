import { Ionicons } from '@expo/vector-icons';
import { ComponentPropsWithoutRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';

interface SearchInputWithoutBorderProps extends ComponentPropsWithoutRef<typeof TextInput> {
  keyword: string;
}

export const SearchInputWithoutBorder = ({
  keyword,
  onChangeText,
  onSubmitEditing,
  className,
  ...props
}: SearchInputWithoutBorderProps) => {
  const resetKeyword = () => {
    if (onChangeText) onChangeText('');
  };
  return (
    <View className="relative flex-1">
      <TextInput
        value={keyword}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        className="my-4 w-full px-3 py-2.5 pr-10 text-lg"
        placeholder="원하는 레시피를 찾아보세요!"
        returnKeyType="search"
        {...props}
      />

      {keyword.length > 0 && (
        <Pressable
          onPress={resetKeyword}
          className="absolute right-3 top-1/2 -translate-y-1/2"
          hitSlop={10}>
          <Ionicons name="close-circle" size={20} color="#888" />
        </Pressable>
      )}
    </View>
  );
};
