import Feather from '@expo/vector-icons/Feather';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { Text } from 'components/common/Text';
import { baseProfile } from 'const/assets';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import useKoreanToday from 'hooks/useKoreanToday';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { getWeekAndDay } from 'utils/date';
import { getWeekColor } from 'utils/getWeekColor';

interface HomeHeaderProps {
  bottomSheetRef: React.RefObject<BottomSheetMethods>;
}

export default function HomeHeader({ bottomSheetRef }: HomeHeaderProps) {
  const { start_date, avatar_url } = useUserStore((state) => state);
  const today = useKoreanToday();

  const { week, day } = getWeekAndDay(start_date ?? today);
  return (
    <View>
      <View className="mb-1 mt-4 flex-row items-center justify-between">
        <Text className="text-neutral-600">오늘도 파이팅!</Text>
        <View className="h-11 w-11 overflow-hidden rounded-full border-2 border-neutral-300">
          <Link href={'/profile'}>
            <Image style={{ width: '100%', height: '100%' }} source={avatar_url ?? baseProfile} />
          </Link>
        </View>
      </View>
      <View className="flex-row items-end gap-3">
        <Text className={`text-4xl font-bold ${getWeekColor(week)}`}>
          {week}주차 {week >= 5 && '(유지기)'}
        </Text>
        <Pressable onPress={() => bottomSheetRef.current?.expand()}>
          <Feather name="settings" size={18} />
        </Pressable>
      </View>

      <View className="mt-6 flex-row gap-5 px-2">
        {Array(8)
          .fill(null)
          .map((_, i) =>
            i === 7 ? (
              <View key={`${week + 1}주차`} className="ml-2 items-center gap-1.5">
                <Text className={`font-bold ${getWeekColor(week + 1)}`}>{week + 1}주차</Text>
                <View className="h-8 w-8 items-center justify-center rounded-full bg-neutral-300">
                  <MaterialIcons name="arrow-forward" size={20} />
                </View>
              </View>
            ) : (
              <View key={`${week}주차 ${i + 1}일`} className="items-center gap-1.5">
                <Text className="text-lg">{i + 1}일</Text>
                <View className="h-8 w-8 items-center justify-center rounded-full bg-neutral-300">
                  {i + 1 <= day && <MaterialIcons name="check" size={20} />}
                </View>
              </View>
            )
          )}
      </View>
    </View>
  );
}
