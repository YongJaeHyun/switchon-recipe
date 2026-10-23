import { Stack } from 'expo-router';

// 다른 탭에서 이 스택의 화면으로 바로 들어와도 아래에 레시피 탭 첫 화면이 깔리게 한다
export const unstable_settings = { initialRouteName: 'index' };

export default function RecipesLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="savedRecipes" options={{ title: '저장한 레시피' }} />
    </Stack>
  );
}
