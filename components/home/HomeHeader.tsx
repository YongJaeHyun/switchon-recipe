import Feather from '@expo/vector-icons/Feather';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useUserStore } from 'stores/userStore';

interface HomeHeaderProps {
  bottomSheetRef: React.RefObject<BottomSheetMethods>;
}

export default function HomeHeader({ bottomSheetRef }: HomeHeaderProps) {
  const userInfo = useUserStore((state) => state.user);

  return (
    <View>
      <View className="mb-1 mt-4 flex-row items-center justify-between">
        <Text className="text-neutral-600">오늘도 화이팅!</Text>
        <View className="h-10 w-10 overflow-hidden rounded-full">
          <Link href={'/(tabs)/home/profile'}>
            <Image style={{ width: '100%', height: '100%' }} source={userInfo?.avatar_url} />
          </Link>
        </View>
      </View>
      <View className="flex-row items-end gap-3">
        <Text style={{ fontFamily: 'roboto' }} className="text-4xl font-bold">
          1주차
        </Text>
        <Pressable onPress={() => bottomSheetRef.current?.expand()}>
          <Feather name="settings" size={18} />
        </Pressable>
      </View>

      <View className="mt-6 flex-row gap-5">
        <View className="items-center gap-2">
          <Text className="">1일</Text>
          <View className="h-8 w-8 items-center justify-center rounded-full bg-neutral-300">
            <MaterialIcons name="check" size={20} />
          </View>
        </View>
        <View className="items-center gap-2">
          <Text className="">1일</Text>
          <View className="h-8 w-8 items-center justify-center rounded-full bg-neutral-300">
            <MaterialIcons name="check" size={20} />
          </View>
        </View>
        <View className="items-center gap-2">
          <Text className="">1일</Text>
          <View className="h-8 w-8 items-center justify-center rounded-full bg-neutral-300">
            <MaterialIcons name="check" size={20} />
          </View>
        </View>
        <View className="items-center gap-2">
          <Text className="">1일</Text>
          <View className="h-8 w-8 items-center justify-center rounded-full bg-neutral-300">
            <MaterialIcons name="check" size={20} />
          </View>
        </View>
      </View>
    </View>
  );
}
