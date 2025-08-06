import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { InquiryAPI } from 'api/InquiryAPI';
import ListEmptyText from 'components/common/ListEmptyText';
import RippleButton from 'components/common/RippleButton';
import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InquiryDB } from 'types/database';
import { formatKoreanDate } from 'utils/date';

export default function InquiriesMainScreen() {
  const router = useRouter();
  const [inquiries, setInquiries] = useState<InquiryDB[]>([]);

  useEffect(() => {
    (async () => {
      const inquiries = await InquiryAPI.selectAll();
      setInquiries(inquiries);
    })();
  }, []);

  const renderItem = ({ item }: { item: InquiryDB }) => (
    <Pressable
      onPress={() => router.push(`/inquiry/${item.id}`)}
      style={{
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e5e5',
      }}>
      <Text style={{ fontSize: 16, fontWeight: '600' }}>{item.title}</Text>
      <Text style={{ color: '#888', marginTop: 4 }}>{formatKoreanDate(item.created_at)}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
      <View className="flex-row items-center justify-between p-4">
        <View className="flex-row items-center gap-4">
          <TouchableOpacity onPress={router.back}>
            <MaterialIcons name="arrow-back" size={28} color="black" />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: 'bold' }}>내 문의사항</Text>
        </View>
        <Link href={'/(inquiry)/new)'} asChild>
          <RippleButton className="!w-24 flex-row bg-green-600 py-2.5" rounded="full">
            <Ionicons name="add" size={18} color="white" />
            <Text className="ml-1 text-white">새 문의</Text>
          </RippleButton>
        </Link>
      </View>

      <FlatList
        data={inquiries}
        keyExtractor={(item) => item.id.toString()}
        ListEmptyComponent={<ListEmptyText emptyListName="inquiry" href={'/(inquiry)/new'} />}
        renderItem={renderItem}
        contentContainerClassName={`flex-grow pb-4 items-start ${inquiries.length === 0 ? 'justify-center mb-20' : 'justify-start'}`}
      />
    </SafeAreaView>
  );
}
