import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import colors from 'tailwindcss/colors';
import { InquiryCategory } from 'types/database';

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

  const getCategoryBorderColor = () => {
    if (category === '일반 문의') return 'border-green-600';
    if (category === '버그 신고') return 'border-red-500';
    if (category === '기능 요청') return 'border-yellow-500';
    return '';
  };

  const getCategoryTextColor = () => {
    if (category === '일반 문의') return 'text-green-600';
    if (category === '버그 신고') return 'text-red-500';
    if (category === '기능 요청') return 'text-yellow-500';
    return '';
  };

  return (
    <RippleButton
      outerClassName={`border ${isSelected ? getCategoryBorderColor() : 'border-neutral-400'}`}
      onPress={onPress}
      className="flex-row px-3 py-2">
      {category === '일반 문의' && (
        <FontAwesome5
          name="question-circle"
          size={16}
          color={isSelected ? colors.green[600] : colors.neutral[400]}
        />
      )}
      {category === '버그 신고' && (
        <MaterialIcons
          name="bug-report"
          size={16}
          color={isSelected ? colors.red[500] : colors.neutral[400]}
        />
      )}
      {category === '기능 요청' && (
        <MaterialIcons
          name="lightbulb"
          size={16}
          color={isSelected ? colors.yellow[500] : colors.neutral[400]}
        />
      )}

      <Text className={`ml-1 ${isSelected ? getCategoryTextColor() : 'text-neutral-400'}`}>
        {category}
      </Text>
    </RippleButton>
  );
}
