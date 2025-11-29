import { SafeAreaView } from 'react-native-safe-area-context';

interface SafeAreaViewWithNavProps {
  children?: React.ReactNode;
  className?: string;
}

export function SafeAreaViewWithNav({ children, className }: SafeAreaViewWithNavProps) {
  return (
    <SafeAreaView edges={['right', 'left', 'top']} className={className}>
      {children}
    </SafeAreaView>
  );
}
