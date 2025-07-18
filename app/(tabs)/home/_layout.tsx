import { Stack } from 'expo-router';

export default function HomeLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="recipeDetail" options={{ headerShown: false }} />
      <Stack.Screen
        name="recipeCreation"
        options={{
          title: '레시피 제작',
          headerTitleStyle: { fontFamily: 'pretendard', fontSize: 20 },
        }}
      />
      <Stack.Screen name="setting" options={{ headerShown: false }} />
    </Stack>
  );
}
