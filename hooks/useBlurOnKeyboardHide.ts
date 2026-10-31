import { useEffect } from 'react';
import { Keyboard, TextInput } from 'react-native';

// 바텀시트 입력칸: 뒤로 가기 등으로 키보드만 닫히면 입력칸이 포커스를 잃지 않아 시트가 올라간 채 남는다.
// 키보드가 닫히면 포커스를 풀어, 시트(keyboardBlurBehavior: 'restore')가 원래 높이로 내려오게 한다
// enabled: 앱에 늘 붙어 있는 시트는 열려 있을 때만 듣는다
export const useBlurOnKeyboardHide = (enabled = true) => {
  useEffect(() => {
    if (!enabled) return;
    const subscription = Keyboard.addListener('keyboardDidHide', () => {
      TextInput.State.currentlyFocusedInput()?.blur();
    });
    return () => subscription.remove();
  }, [enabled]);
};
