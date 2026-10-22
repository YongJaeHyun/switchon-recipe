import { Redirect } from 'expo-router';

// 예전 프로필 경로(/profile)는 내 정보 탭으로
export default function Profile() {
  return <Redirect href="/(tabs)/me" />;
}
