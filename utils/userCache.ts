import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserDB } from 'types/database';

const USER_CACHE_KEY = 'cached_user';

// 오프라인으로 앱을 켤 때 쓰는 마지막 유저 정보
export const saveCachedUser = async (user: UserDB) => {
  await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(user)).catch(() => {});
};

export const loadCachedUser = async (): Promise<UserDB | null> => {
  try {
    const value = await AsyncStorage.getItem(USER_CACHE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

export const clearCachedUser = async () => {
  await AsyncStorage.removeItem(USER_CACHE_KEY).catch(() => {});
};
