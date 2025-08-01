import { Href, Link } from 'expo-router';
import { Text, View } from 'react-native';
import colors from 'tailwindcss/colors';
import RippleButton from './RippleButton';

interface ListEmptyTextProps {
  emptyListName: EmptyListName;
  href: Href;
}

type EmptyListName = 'savedRecipes' | 'recentRecipes';

export default function ListEmptyText({ emptyListName, href }: ListEmptyTextProps) {
  const getListEmptyText = (emptyListName: EmptyListName) => {
    switch (emptyListName) {
      case 'recentRecipes':
        return '아직 만든 레시피가 없어요...';
      case 'savedRecipes':
        return '아직 저장한 레시피가 없어요...';
    }
  };
  return (
    <View className="min-w-full items-center justify-center gap-6">
      <Text className="text-neutral-500">{getListEmptyText(emptyListName)}</Text>
      <Link href={href} className="" asChild>
        <RippleButton
          className="bg-green-600 px-5 py-3"
          rounded="full"
          rippleColor={colors.green[700]}>
          <Text className="text-white">레시피 만들러 가기</Text>
        </RippleButton>
      </Link>
    </View>
  );
}
