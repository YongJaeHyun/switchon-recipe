import RippleButton from 'components/common/RippleButton';
import { InquiryCategory } from 'types/database';
import { CategoryBadge } from './CategoryBadge';

interface CategoryButtonProps {
  category: InquiryCategory;
  currentCategory: InquiryCategory;
  onPress: () => void;
}

export default function CategoryButton({
  category,
  currentCategory,
  onPress,
}: CategoryButtonProps) {
  const isSelected = currentCategory === category;

  return (
    <RippleButton rippleColor="transparent" onPress={onPress}>
      <CategoryBadge category={category} active={isSelected} />
    </RippleButton>
  );
}
