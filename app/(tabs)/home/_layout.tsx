import { Stack } from 'expo-router';

export default function HomeLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="recipeDetail" options={{ headerShown: false }} />
      <Stack.Screen name="savedRecipes" options={{ title: '저장한 레시피' }} />
    </Stack>
  );
}
