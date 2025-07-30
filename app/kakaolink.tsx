import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

export default function KakaolinkRedirect() {
  const { recipe } = useLocalSearchParams();

  useEffect(() => {
    if (recipe) {
      router.replace(`/(tabs)/home/recipeDetail?recipe=${recipe}`);
    } else {
      router.back();
    }
  }, [recipe]);

  return null;
}
