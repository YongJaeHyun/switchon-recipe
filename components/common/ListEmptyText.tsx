import { Href, Link } from 'expo-router';
import { Text, View } from 'react-native';
import colors from 'tailwindcss/colors';
import RippleButton from './RippleButton';

interface ListEmptyTextProps {
  emptyListName: EmptyListName;
  href: Href;
}

type EmptyListName = 'savedRecipes' | 'recentRecipes' | 'inquiry';

export default function ListEmptyText({ emptyListName, href }: ListEmptyTextProps) {
  const getListEmptyText = () => {
    switch (emptyListName) {
      case 'recentRecipes':
        return '아직 만든 레시피가 없어요...';
      case 'savedRecipes':
        return '아직 저장한 레시피가 없어요...';
      case 'inquiry':
        return '내 문의사항이 없어요...';
    }
  };

  const getButtonText = () => {
    switch (emptyListName) {
      case 'recentRecipes':
      case 'savedRecipes':
        return '레시피 만들러 가기';
      case 'inquiry':
        return '지금 문의하기';
    }
  };
  return (
    <View className="min-w-full items-center justify-center gap-6">
      <Text className="text-neutral-500">{getListEmptyText()}</Text>
      <Link href={href} className="" asChild>
        <RippleButton
          className="bg-green-600 px-5 py-3"
          rounded="full"
          rippleColor={colors.green[700]}>
          <Text className="text-white">{getButtonText()}</Text>
        </RippleButton>
      </Link>
    </View>
  );
}
