import { MaterialIcons } from '@expo/vector-icons';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
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
          tabBarIcon: ({ color }) => (
            <View className="relative">
              <MaterialIcons name="explore" size={28} color={color} />
              <View className="absolute -right-8 top-0 h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1">
                <Text className="text-center text-[10px] font-bold text-white">NEW</Text>
              </View>
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

export default TabLayout;
