import BottomSheet from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { Portal } from '@gorhom/portal';
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
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
    const sheetRef = useRef<BottomSheet>(null);
    // PortalHost는 key 없이 순서대로 그려서, 다른 시트가 붙거나 떨어지면 내용이 다른 시트 자리로 옮겨 붙는다.
    // 시트마다 고정 key를 줘서 자기 자리를 지키게 한다
    const key = useId();

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

    return (
      <Portal>
        <SheetInPortal key={key} sheetRef={sheetRef} onClose={onClose}>
          {children}
        </SheetInPortal>
      </Portal>
    );
  }
);

// 열림 상태와 뒤로 가기 처리는 Portal 안에서 시트와 함께 산다.
// 시트가 Portal 안에서 다시 만들어지면 닫힌 채(index -1) onChange 없이 시작하는데, 열림 상태를 바깥에 두면
// "열림"으로 남아 뒤로 가기를 계속 삼켰다 (다시 시작 뒤 패스 화면에서 뒤로 가기가 안 되던 문제)
const SheetInPortal = ({
  sheetRef,
  onClose,
  children,
}: {
  sheetRef: React.RefObject<BottomSheet | null>;
  onClose?: () => void;
  children: React.ReactNode;
}) => {
  const inset = useSafeAreaInsets();
  const [isOpen, setIsOpen] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 시트가 열려 있으면 뒤로 가기로 화면 대신 시트만 닫음
  useEffect(() => {
    if (!isOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      sheetRef.current?.close();
      return true;
    });
    return () => subscription.remove();
  }, [isOpen, sheetRef]);

  // 열린 채로 떼어지면(다시 붙기 포함) 닫힌 것으로 본다
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  useEffect(
    () => () => {
      if (isOpenRef.current) onCloseRef.current?.();
    },
    []
  );

  return (
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
  );
};
