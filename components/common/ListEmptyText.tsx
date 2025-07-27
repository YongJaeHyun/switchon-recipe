import { Pressable, Text, View } from 'react-native';

interface ListEmptyTextProps {
  emptyListName: EmptyListName;
}

type EmptyListName = 'savedRecipes' | 'recentRecipes';

export default function ListEmptyText({ emptyListName }: ListEmptyTextProps) {
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
      <Pressable className="rounded-full bg-green-600 px-5 py-3">
        <Text className="text-white">레시피 만들러 가기</Text>
      </Pressable>
    </View>
  );
}
