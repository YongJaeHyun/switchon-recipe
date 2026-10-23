import BottomSheet from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { Portal } from '@gorhom/portal';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from 'tailwindcss/colors';

interface CustomBottomSheetProps {
  children: React.ReactNode;
  // 열려 있다가 닫힐 때마다 (index -1). 작업 중 상태를 저장된 값으로 되돌리는 데 쓴다.
  // 열 때 되돌리면 여는 애니메이션이 끝난 뒤에 불려 지난 편집이 잠깐 보인다
  onClose?: () => void;
}

export const CustomBottomSheet = forwardRef<BottomSheetMethods, CustomBottomSheetProps>(
  ({ children, onClose }, ref) => {
    const inset = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheet>(null);
    const [isOpen, setIsOpen] = useState(false);

    // Portal 안의 시트는 이 컴포넌트보다 늦게 붙으므로, 호출 시점에 실제 시트로 넘겨준다
    useImperativeHandle(
      ref,
      () =>
        new Proxy({} as BottomSheetMethods, {
          get:
            (_, method) =>
            (...args: unknown[]) =>
              (sheetRef.current as unknown as Record<PropertyKey, (...a: unknown[]) => void>)?.[
                method
              ]?.(...args),
        }),
      []
    );

    // 시트가 열려 있으면 뒤로 가기로 화면 대신 시트만 닫음
    useEffect(() => {
      if (!isOpen) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        sheetRef.current?.close();
        return true;
      });
      return () => subscription.remove();
    }, [isOpen]);

    return (
      <Portal>
        <BottomSheet
          style={{ borderTopWidth: 2, borderColor: colors.neutral[100] }}
          handleIndicatorStyle={{ backgroundColor: colors.neutral[500] }}
          bottomInset={inset.bottom}
          ref={sheetRef}
          index={-1}
          onChange={(index) => {
            if (index === -1 && isOpen) onClose?.();
            setIsOpen(index >= 0);
          }}
          enablePanDownToClose>
          {children}
        </BottomSheet>
      </Portal>
    );
  }
);
