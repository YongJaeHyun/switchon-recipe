import BottomSheet from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { Portal } from '@gorhom/portal';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from 'tailwindcss/colors';

interface CustomBottomSheetProps {
  children: React.ReactNode;
}

export const CustomBottomSheet = forwardRef<BottomSheetMethods, CustomBottomSheetProps>(
  ({ children }, ref) => {
    const inset = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheet>(null);
    const [isOpen, setIsOpen] = useState(false);

    useImperativeHandle(ref, () => sheetRef.current as BottomSheetMethods);

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
          onChange={(index) => setIsOpen(index >= 0)}
          enablePanDownToClose>
          {children}
        </BottomSheet>
      </Portal>
    );
  }
);
