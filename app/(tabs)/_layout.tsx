import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import colors from 'tailwindcss/colors';

function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        animation: 'fade',
        tabBarActiveTintColor: colors.green[600],
        headerShown: false,
      }}>
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="home"
        options={{
          title: '홈',
          tabBarIcon: ({ color }) => <MaterialIcons name="home" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: '탐색',
          tabBarIcon: ({ color }) => <MaterialIcons name="explore" size={28} color={color} />,
        }}
      />
    </Tabs>
  );
}

export default TabLayout;
