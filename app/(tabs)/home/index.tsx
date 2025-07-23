import Feather from '@expo/vector-icons/Feather';
import { logout } from 'api/supabaseAPI';
import RecentRecipes from 'components/home/RecentRecipes';
import RecipeCreation from 'components/home/RecipeCreation';
import SavedRecipes from 'components/home/SavedRecipes';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Button, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { useRecipeStore } from '../../../stores/recipeStore';

export default function HomeScreen() {
  const userInfo = useUserStore((state) => state.user);

  const [refreshing, setRefreshing] = useState(false);
  const fetchRecentRecipes = useRecipeStore((state) => state.fetchRecentRecipes);
  const fetchSavedRecipes = useRecipeStore((state) => state.fetchSavedRecipes);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRecentRecipes();
    await fetchSavedRecipes();
    setRefreshing(false);
  }, [fetchRecentRecipes, fetchSavedRecipes]);

  const logoutAndRedirect = async () => {
    await logout();
    router.replace('/(auth)');
  };

  if (!userInfo) logoutAndRedirect();
  return (
    <SafeAreaView className="flex-1 bg-neutral-100 px-5">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
        <View className="flex-row items-center justify-between pt-4">
          <Text className="text-neutral-600">오늘도 화이팅!</Text>
          <View className="flex-row items-center gap-5">
            <Feather name="settings" size={24} />
            <Pressable className="h-10 w-10 overflow-hidden rounded-full">
              <Image style={{ width: '100%', height: '100%' }} source={userInfo?.avatar_url} />
            </Pressable>
          </View>
        </View>
        <Text style={{ fontFamily: 'roboto' }} className="text-4xl font-bold">
          1일차
        </Text>

        <View
          className="my-6"
          style={{ borderBottomWidth: 2, borderBottomColor: colors.neutral[400] }}
        />

        <View className="gap-12">
          <RecipeCreation />
          <SavedRecipes refreshing={refreshing} />
          <RecentRecipes refreshing={refreshing} />
          <Button title="로그아웃" onPress={logoutAndRedirect} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
