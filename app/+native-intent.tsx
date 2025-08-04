import { checkIsLoggedIn } from 'api/supabaseAPI';

export async function redirectSystemPath({ path, initial }) {
  try {
    if (initial) {
      const url = new URL(path, 'switchon-recipe://');
      const recipe = url.searchParams.get('recipe');

      if (url.hostname === 'kakaolink') {
        const isLoggedIn = await checkIsLoggedIn();
        return isLoggedIn ? `/(tabs)/home/recipeDetail?recipe=${recipe}` : '/(auth)';
      }

      return path;
    }
  } catch {
    return '/(auth)';
  }
}
