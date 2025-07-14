import { StatusBar } from 'expo-status-bar';
import { ScreenContent } from '../../components/ScreenContent';

export default function Home() {
  return (
    <>
      <ScreenContent title="Home" path="App.tsx"></ScreenContent>
      <StatusBar style="auto" />
    </>
  );
}
