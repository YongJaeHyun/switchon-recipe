import { Stack } from 'expo-router';

export default function HomeLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="recipeDetail" options={{ headerShown: false }} />
      <Stack.Screen name="savedRecipes" options={{ title: '저장한 레시피' }} />
      <Stack.Screen
        name="recipeCreation/zero"
        options={{
          title: '무탄수 레시피 제작',
          headerTitleStyle: { fontSize: 20 },
        }}
      />
      <Stack.Screen
        name="recipeCreation/low"
        options={{
          title: '저탄수 레시피 제작',
          headerTitleStyle: { fontSize: 20 },
        }}
      />
    </Stack>
  );
}
