import { MaterialIcons } from '@expo/vector-icons';
import RippleButton from 'components/common/RippleButton';
import { CHANNELS } from 'const/channels';
import { Tabs } from 'expo-router';
import { useDailyReminderSync } from 'hooks/useDailyReminderSync';
import { useEffect } from 'react';
import { useNotificationGateStore } from 'stores/notificationGateStore';
import colors from 'tailwindcss/colors';
import { registerChannelIfPermitted } from 'utils/notifications';

function TabLayout() {
  // 다음 날 아침 리마인드 (그날 앱을 안 연 사람에게만)
  useDailyReminderSync();

  // 눌러 연 알림의 이동은 탭 화면이 뜬 뒤에 한다 (hooks/useNotificationObserver). 로그아웃으로 나가면 탭 밖
  useEffect(() => {
    const { setPhase } = useNotificationGateStore.getState();
    setPhase('tabs');
    return () => setPhase('outside');
  }, []);

  // 리포트 알림 채널: 안드로이드는 채널이 없으면 푸시가 버려진다. 무료 1주차 리포트·구매 후 알림도 받도록
  // 권한이 이미 있는 사용자는 앱을 열 때 한 번 만든다 (권한 요청은 하지 않는다)
  useEffect(() => {
    registerChannelIfPermitted(CHANNELS.REPORT);
  }, []);

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
