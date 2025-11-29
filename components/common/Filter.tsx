import { View } from 'react-native';
import RippleButton from './RippleButton';
import { Text } from './Text';

interface FilterProps<FilterOption> {
  currentOption: FilterOption;
  onOptionPress: (option: FilterOption) => void;
  options: readonly FilterOption[];
}

export function Filter<FilterOption extends string>({
  currentOption,
  options,
  onOptionPress,
}: FilterProps<FilterOption>) {
  return (
    <View className="flex-row items-center gap-3">
      {options.map((filterOption) => {
        const isActive = currentOption === filterOption;
        return (
          <RippleButton
            key={filterOption}
            onPress={() => onOptionPress(filterOption)}
            className={`px-3 py-2 ${isActive ? 'bg-green-600' : 'bg-neutral-200'}`}>
            <Text className={isActive ? 'text-white' : 'text-neutral-500'}>{filterOption}</Text>
          </RippleButton>
        );
      })}
    </View>
  );
}
