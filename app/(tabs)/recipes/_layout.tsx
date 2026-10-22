import { Stack } from 'expo-router';

export default function RecipesLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
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
      <Stack.Screen name="explore" options={{ title: '다른 사람들의 레시피' }} />
      <Stack.Screen name="search" options={{ headerShown: false }} />
      <Stack.Screen name="searchResult" options={{ headerShown: false }} />
    </Stack>
  );
}
