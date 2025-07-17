import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeLayout() {
  return (
    <SafeAreaView className="flex-1 px-5">
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="recipeDetail" options={{ headerShown: false }} />
        <Stack.Screen name="recipeCreation" options={{ headerShown: false }} />
        <Stack.Screen name="setting" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaView>
  );
}
