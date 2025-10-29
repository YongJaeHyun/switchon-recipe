import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';

interface CategoryTabProps {
  name: string;
  isActive: boolean;
  activeColor: string;
  onPress: () => void;
}

export function CategoryTab({ name, isActive, activeColor, onPress }: CategoryTabProps) {
  return (
    <RippleButton
      onPress={onPress}
      rippleColor={activeColor}
      outerClassName={`border border-neutral-300 self-start ${isActive ? activeColor : 'bg-neutral-200'}`}
      className="px-3 py-1.5"
      rounded="full">
      <Text className={`text-medium ${isActive ? 'text-white' : 'text-neutral-500'}`}>{name}</Text>
    </RippleButton>
  );
}
