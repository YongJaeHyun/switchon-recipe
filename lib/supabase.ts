import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import { Database } from 'types/database.types';
import { fillEmptyErrorResponse } from 'utils/emptyErrorResponse';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  // 본문 없는 실패 응답(게이트웨이 5xx 등)에 상태 코드를 채워, 오류에 "HTTP 503"처럼 코드가 남게 한다
  global: {
    fetch: async (input, init) => fillEmptyErrorResponse(await fetch(input, init)),
  },
});
