import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useRef } from 'react';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import { CustomBottomSheet } from './CustomBottomSheet';
import RippleButton from './RippleButton';
import { Text } from './Text';

interface DropdownProps<SortOption> {
  currentOption: SortOption;
  onOptionPress: (option: SortOption) => void;
  options: readonly SortOption[];
}

export function Sort<SortOption extends string>({
  currentOption,
  options,
  onOptionPress,
}: DropdownProps<SortOption>) {
  const bottomSheetRef = useRef<BottomSheet>(null);

  const open = () => bottomSheetRef.current?.expand();
  const close = () => bottomSheetRef.current?.close();

  const handleOption = (option: SortOption) => {
    onOptionPress(option);
    close();
  };

  return (
    <View className="relative">
      <RippleButton
        onPress={open}
        outerClassName="border border-neutral-400 rounded-full"
        className="flex-row items-center justify-center gap-1 px-3 py-1.5">
        <MaterialIcons name="swap-vert" size={20} color={colors.neutral[600]} />
        <Text className="text-neutral-600">{currentOption}</Text>
      </RippleButton>

      <CustomBottomSheet ref={bottomSheetRef}>
        <BottomSheetView>
          <View className="px-5">
            <Text className="text-center">정렬</Text>
            {options.map((option) => {
              const isActive = option === currentOption;
              return (
                <RippleButton
                  key={option}
                  onPress={() => handleOption(option)}
                  rippleColor="transparent"
                  className="w-full flex-row items-center justify-between py-6">
                  <Text className={`text-medium ${isActive ? 'font-bold' : 'font-normal'}`}>
                    {option}
                  </Text>
                  {isActive && <MaterialIcons name="check" size={24} />}
                </RippleButton>
              );
            })}
          </View>
          <RippleButton
            onPress={close}
            outerClassName="border-t w-full border-neutral-200"
            className="w-full py-5">
            <Text className="text-medium font-bold">닫기</Text>
          </RippleButton>
        </BottomSheetView>
      </CustomBottomSheet>
    </View>
  );
}
