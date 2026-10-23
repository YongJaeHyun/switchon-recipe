import { Stack } from 'expo-router';

export const unstable_settings = { initialRouteName: 'index' };

export default function ExploreLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="search" />
      <Stack.Screen name="searchResult" />
    </Stack>
  );
}
