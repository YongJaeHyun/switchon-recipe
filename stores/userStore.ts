import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserDB } from 'types/database';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  user: null | UserDB;
  setUser: (user: UserDB) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
    }),
    {
      name: 'authStore',
      storage: {
        getItem: async (name: string) => {
          const value = await AsyncStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: async (name: string, value: any) => {
          await AsyncStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: async (name: string) => {
          await AsyncStorage.removeItem(name);
        },
      },
    }
  )
);
