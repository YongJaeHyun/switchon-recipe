import { UserDB } from 'types/database';
import { create } from 'zustand';

interface UserState extends UserDB {
  setUser: (user: UserDB) => Promise<void>;
  resetUser: () => Promise<void>;
}

export const useUserStore = create<UserState>()((set) => ({
  id: '',
  email: '',
  name: '',
  provider: '',
  created_at: '',
  start_date: '',
  avatar_url: null,
  is_onboarded: false,
  setUser: (user) =>
    new Promise((resolve) => {
      set({ ...user });
      resolve();
    }),
  resetUser: () =>
    new Promise<void>((resolve) => {
      set({
        id: '',
        email: '',
        name: '',
        provider: '',
        created_at: '',
        start_date: '',
        avatar_url: null,
        is_onboarded: false,
      });
      resolve();
    }),
}));
