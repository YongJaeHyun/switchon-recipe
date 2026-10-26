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
        // 폭 768dp 이상(태블릿·폴드)에서 라이브러리 기본값이 'beside-icon'으로 바뀌는데,
        // 아래 커스텀 버튼은 그 가로 배치 스타일을 받지 않아 글자가 밀리고 잘림 → 항상 아이콘 아래로 고정
        tabBarLabelPosition: 'below-icon',
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
          title: '오늘',
          tabBarIcon: ({ color }) => <MaterialIcons name="today" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: '레시피',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="restaurant-menu" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: '탐색',
          tabBarIcon: ({ color }) => <MaterialIcons name="explore" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="records/index"
        options={{
          title: '기록',
          tabBarIcon: ({ color }) => <MaterialIcons name="insights" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="me/index"
        options={{
          title: '내 정보',
          tabBarIcon: ({ color }) => <MaterialIcons name="person" size={28} color={color} />,
        }}
      />
    </Tabs>
  );
}

export default TabLayout;
