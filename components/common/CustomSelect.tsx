import { MaterialIcons } from '@expo/vector-icons';
import RippleButton from 'components/common/RippleButton';
import { useState } from 'react';
import { FlatList, Modal, TouchableWithoutFeedback, View } from 'react-native';
import colors from 'tailwindcss/colors';
import { RecipeOption } from 'types/recipe';
import { Nullable } from '../../types/common';
import { Text } from './Text';

interface CustomSelectProps<Option> {
  title: string;
  options: Option[];
  itemBgColor?: string;
  itemTextColor?: string;
  borderColor?: string;
  bgColor?: string;
  rippleColor?: string;
  selectedValue: Nullable<Option>;
  onSelect?: (option: Option) => void;
}

export function CustomSelect<Option extends RecipeOption>({
  title,
  options,
  selectedValue,
  onSelect,
  itemBgColor = 'bg-green-50',
  itemTextColor = 'text-green-600',
  borderColor = 'border-green-600',
  bgColor = 'bg-green-600',
  rippleColor = 'bg-green-700',
}: CustomSelectProps<Option>) {
  const [visible, setVisible] = useState(false);

  const handleOpen = () => setVisible(true);
  const handleClose = () => setVisible(false);

  const handleSelect = (option: Option) => {
    onSelect?.(option);
    setVisible(false);
  };

  return (
    <>
      <RippleButton
        outerClassName={`border px-3 py-2 ${selectedValue ? borderColor : 'border-neutral-400'}`}
        className="flex-row"
        onPress={handleOpen}>
        <Text className="text-neutral-600">{selectedValue || title}</Text>
        <MaterialIcons name="keyboard-arrow-down" size={16} color={colors.neutral[600]} />
      </RippleButton>

      <Modal transparent visible={visible} animationType="fade" onRequestClose={handleClose}>
        <TouchableWithoutFeedback onPress={() => setVisible(false)}>
          <View className="flex-1 items-center justify-center bg-black/40">
            <View className="max-h-[70%] w-5/6 rounded-2xl bg-white p-5">
              <Text className="mb-4 text-center text-lg font-semibold">{title} 선택</Text>
              <FlatList
                data={options}
                keyExtractor={(item, idx) => `${item}-${idx}`}
                renderItem={({ item }) => (
                  <RippleButton
                    className={`w-full flex-row items-center gap-2 border-b border-gray-100 px-2 py-3 ${
                      selectedValue === item ? itemBgColor : ''
                    }`}
                    rippleColor={colors.neutral[200]}
                    onPress={() => handleSelect(item)}>
                    <Text
                      className={
                        selectedValue === item ? `font-semibold ${itemTextColor}` : 'text-gray-800'
                      }>
                      {item}
                    </Text>
                  </RippleButton>
                )}
              />
              <RippleButton
                className={`mt-4 w-full rounded-lg py-3 ${bgColor}`}
                rippleColor={rippleColor}
                onPress={() => setVisible(false)}>
                <Text className="text-center text-base font-semibold text-white">닫기</Text>
              </RippleButton>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}
