import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { InquiryAPI } from 'api/InquiryAPI';
import ListEmptyText from 'components/common/ListEmptyText';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import InquiryItem from 'components/inquiry/InquiryItem';
import { QueryKey } from 'const/queryKey';
import { Link, useRouter } from 'expo-router';
import { useQueryWith402Retry } from 'hooks/useCustomQuery';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import colors from 'tailwindcss/colors';

export default function InquiriesMainScreen() {
  const router = useRouter();

  const [refreshing, setRefreshing] = useState(false);
  const {
    data: inquiries = [],
    refetch,
    isLoading,
  } = useQueryWith402Retry({
    queryKey: [QueryKey.inquiries],
    queryFn: InquiryAPI.selectAll,
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        refetch();
      }
    });

    return () => subscription.remove();
  }, [refetch]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center justify-between p-4">
        <View className="flex-row items-center gap-4">
          <TouchableOpacity onPress={router.back}>
            <MaterialIcons name="arrow-back" size={28} color="black" />
          </TouchableOpacity>
          <Text className="text-xl font-bold">내 문의사항</Text>
        </View>
        <Link href={'/(inquiry)/new'} asChild>
          <RippleButton className="flex-row bg-green-600 px-3 py-2.5" rounded="full">
            <Ionicons name="add" size={16} color="white" />
            <Text className="text-white">새 문의</Text>
          </RippleButton>
        </Link>
      </View>

      {isLoading ? (
        <View className="absolute inset-0 z-50 items-center justify-center">
          <ActivityIndicator size={56} color={colors.emerald[300]} />
        </View>
      ) : (
        <FlatList
          data={inquiries}
          keyExtractor={(item) => item.id.toString()}
          className="mt-2"
          contentContainerClassName={`flex-grow items-stretch gap-1 px-5 ${inquiries.length === 0 ? 'justify-center mb-20' : 'justify-start'}`}
          ListEmptyComponent={<ListEmptyText emptyListName="inquiry" href={'/(inquiry)/new'} />}
          renderItem={({ item }) => <InquiryItem inquiry={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </SafeAreaView>
  );
}
