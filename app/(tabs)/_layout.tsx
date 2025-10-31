import { MaterialIcons } from '@expo/vector-icons';
import RippleButton from 'components/common/RippleButton';
import { Tabs } from 'expo-router';
import colors from 'tailwindcss/colors';

function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        animation: 'none',
        tabBarActiveTintColor: colors.green[600],
        headerShown: false,
        tabBarButton: (props) => {
          const { children, onPress } = props;
          return (
            <RippleButton
              className="h-full w-full"
              rippleColor={colors.neutral[300]}
              onPress={onPress}>
              {children}
            </RippleButton>
          );
        },
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
