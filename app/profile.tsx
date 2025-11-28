import { FontAwesome5 } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { unlink } from '@react-native-kakao/user';
import { useQuery } from '@tanstack/react-query';
import { StatisticsAPI } from 'api/StatisticsAPI';
import ConfirmModal from 'components/common/ConfirmModal';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { baseProfile, googleIcon, kakaoIconSmall } from 'const/assets';
import { APP_VERSION, GOOGLE_WEB_CLIENT_ID } from 'const/const';
import { QueryKey } from 'const/queryKey';
import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { queryClient } from 'lib/queryClient';
import { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { Maybe } from 'types/common';
import { getWeekAndDay } from 'utils/date';
import { getWeekColor } from 'utils/getWeekColor';
import { UserAPI } from '../api/UserAPI';

interface MenuButtonProps {
  title: string;
  icon: ReactNode;
  onPress?: () => void;
}

interface WeekProps {
  week: number;
  average: number;
  todoRatesByWeek: Maybe<number>[];
}

interface DayProps {
  week: number;
  day: number;
  todoRate: Maybe<number>;
}

const MenuButton = ({ title, icon, onPress }: MenuButtonProps) => {
  return (
    <RippleButton
      onPress={onPress}
      rippleColor={colors.neutral[300]}
      className="w-full flex-row items-center !justify-between rounded-xl border border-neutral-300 bg-neutral-50 p-5">
      <View className="flex-row items-center gap-5">
        {icon}
        <Text className="text-lg text-neutral-600">{title}</Text>
      </View>
      <MaterialIcons name="navigate-next" size={24} color={colors.neutral[600]} />
    </RippleButton>
  );
};

const Week = ({ week, todoRatesByWeek, average }: WeekProps) => {
  return (
    <View className="mb-2 gap-2">
      <View className="flex-row items-center justify-between">
        <Text className={`text-lg font-bold ${getWeekColor(week)}`}>{week}주차</Text>
        {average > 0 && (
          <Text className="text-sm">
            평균 완료율: <Text className="font-bold">{average}%</Text>
          </Text>
        )}
      </View>
      <View className="mb-2 flex-row items-center justify-center gap-1">
        {todoRatesByWeek.map((todoRate, index) => {
          const day = index + 1;
          return <Day key={`statistics-day-${day}`} week={week} day={day} todoRate={todoRate} />;
        })}
      </View>
    </View>
  );
};

const Day = ({ week, day, todoRate }: DayProps) => {
  const start_date = useUserStore((state) => state.start_date);
  const MIN_BOOST = 5;
  const MAX_BAR_HEIGHT = 36;

  const { week: currentWeek, day: currentDay } = getWeekAndDay(start_date);

  const safeRate = typeof todoRate === 'number' ? todoRate + MIN_BOOST : 0;
  const barHeight = (safeRate / 100) * MAX_BAR_HEIGHT;

  const isToday = week === currentWeek && day === currentDay;
  return (
    <View className={`relative h-14 w-14 justify-end rounded-full ${isToday && 'bg-green-200/50'}`}>
      <Text className="absolute left-3 top-1 text-sm">{day}</Text>
      <View
        style={{ height: barHeight }}
        className="absolute bottom-1 right-3 flex-1 rounded-md border-r-8 border-green-500"
      />
    </View>
  );
};

export default function Profile() {
  const { avatar_url, email, provider, id } = useUserStore((state) => state);

  const [isModalVisible, setModalVisible] = useState(false);

  const { data: todoRateStatistics, isLoading } = useQuery({
    queryKey: [QueryKey.todoRateStatistics, id],
    queryFn: StatisticsAPI.getTodoRatesByWeeks,
  });

  const handleConfirm = async () => {
    await UserAPI.deleteOne();

    if (provider === 'google') await GoogleSignin.signOut();
    if (provider === 'kakao') await unlink();

    if (router.canDismiss()) router.dismissAll();
    router.replace('/(auth)');

    queryClient.clear();
  };

  useEffect(() => {
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  }, []);

  return (
    <ScrollView className="bg-white">
      <View className="relative mb-6 items-center justify-end gap-6 bg-green-50 pb-10 pt-24">
        <TouchableOpacity onPress={router.back} className="absolute left-6 top-16 z-10">
          <MaterialIcons name="arrow-back" size={32} color="black" />
        </TouchableOpacity>
        <View className="h-28 w-28 overflow-hidden rounded-full">
          <Image source={avatar_url ?? baseProfile} style={{ width: '100%', height: '100%' }} />
        </View>
        <View className="flex-row items-center gap-2">
          <View className="h-5 w-5">
            {provider === 'google' && (
              <Image source={googleIcon} style={{ width: '100%', height: '100%' }} />
            )}
            {provider === 'kakao' && (
              <Image source={kakaoIconSmall} style={{ width: '100%', height: '100%' }} />
            )}
          </View>
          <Text className="text-lg text-neutral-500">{email}</Text>
        </View>
      </View>

      <View className="mb-4 flex-1 px-5">
        <Text className="mb-6 text-lg font-bold">나의 4주 리포트</Text>
        {isLoading ? (
          <ActivityIndicator size={56} color={colors.emerald[300]} />
        ) : (
          todoRateStatistics?.weeks.map((statistic, index) => {
            const { average, todoRatesByWeek } = statistic;
            const week = index + 1;

            return (
              <Week
                key={`statistics-week-${week}`}
                week={week}
                average={average}
                todoRatesByWeek={todoRatesByWeek}
              />
            );
          })
        )}
      </View>

      <View className="mb-40 justify-between px-5">
        <Text className="mb-6 text-lg font-bold">메뉴</Text>
        <View className="gap-4">
          <Link href={'/(inquiry)'} asChild>
            <MenuButton
              title="문의사항"
              icon={<FontAwesome5 name="question-circle" size={24} color={colors.neutral[600]} />}
            />
          </Link>
          <MenuButton
            title="로그아웃"
            icon={<MaterialIcons name="power-settings-new" size={24} color={colors.neutral[600]} />}
            onPress={UserAPI.logout}
          />
        </View>
      </View>

      <View className="mb-20 w-full flex-row items-end justify-between px-5">
        <RippleButton
          outerClassName="border border-red-400"
          className="px-4 py-2"
          onPress={() => setModalVisible(true)}>
          <Text className="text-red-400">회원탈퇴</Text>
        </RippleButton>
        <View className="flex-row items-center gap-1">
          <MaterialIcons name="info-outline" size={16} color={colors.neutral[400]} />
          <Text className="text-neutral-400">
            버전 정보: <Text>{APP_VERSION}</Text>
          </Text>
        </View>
      </View>

      <ConfirmModal
        type="delete"
        iconElement={<MaterialIcons name="delete-forever" size={60} color={colors.red[600]} />}
        visible={isModalVisible}
        title="정말로 탈퇴하시겠어요?"
        message="탈퇴 시 모든 데이터가 삭제되며, 다시 복구할 수 없어요."
        onConfirm={handleConfirm}
        onCancel={() => setModalVisible(false)}
      />
    </ScrollView>
  );
}
