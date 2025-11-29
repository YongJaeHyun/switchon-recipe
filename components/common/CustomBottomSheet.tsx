import BottomSheet from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { Portal } from '@gorhom/portal';
import { forwardRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from 'tailwindcss/colors';

interface CustomBottomSheetProps {
  children: React.ReactNode;
}

export const CustomBottomSheet = forwardRef<BottomSheetMethods, CustomBottomSheetProps>(
  ({ children }, ref) => {
    const inset = useSafeAreaInsets();

    return (
      <Portal>
        <BottomSheet
          style={{ borderTopWidth: 2, borderColor: colors.neutral[100] }}
          handleIndicatorStyle={{ backgroundColor: colors.neutral[500] }}
          bottomInset={inset.bottom}
          ref={ref}
          index={-1}
          enablePanDownToClose>
          {children}
        </BottomSheet>
      </Portal>
    );
  }
);
