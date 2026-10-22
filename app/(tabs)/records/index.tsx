import { SafeAreaViewWithNav } from 'components/common/SafeAreaViewWithNav';
import { Text } from 'components/common/Text';

// 임시 자리: 기록 탭 내용은 다음 작업에서 채운다
export default function RecordsScreen() {
  return (
    <SafeAreaViewWithNav className="flex-1 bg-neutral-50 px-5 pt-5">
      <Text className="text-center text-lg font-bold">기록</Text>
      <Text className="mt-4 text-center text-neutral-500">곧 이곳에서 볼 수 있어요.</Text>
    </SafeAreaViewWithNav>
  );
}
