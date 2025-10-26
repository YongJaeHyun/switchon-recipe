import { Ionicons } from '@expo/vector-icons';
import { ComponentPropsWithoutRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';

interface SearchInputProps extends ComponentPropsWithoutRef<typeof TextInput> {
  keyword: string;
}

export function SearchInput({ keyword, onChangeText, className, ...props }: SearchInputProps) {
  const resetKeyword = () => {
    if (onChangeText) onChangeText('');
  };

  return (
    <View className="relative">
      <TextInput
        className={`w-full rounded-lg border border-neutral-400 px-3 py-2.5 pr-10 ${className}`}
        value={keyword}
        onChangeText={onChangeText}
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
}
