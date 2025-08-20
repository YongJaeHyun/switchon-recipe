import { usePathname } from 'expo-router';

export const useLastPathname = () => {
  const pathname = usePathname();
  const lastPathnameIndex = pathname.lastIndexOf('/');
  const lastPathname = pathname.slice(lastPathnameIndex + 1);
  return lastPathname;
};
