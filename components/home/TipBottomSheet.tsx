import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useTipSheetStore } from 'stores/tipSheetStore';
import { CustomBottomSheet } from '../common/CustomBottomSheet';

// 식단 가이드 할 일의 "팁". 단식 요일 설정 시트와 같은 스타일
export const TipBottomSheet = () => {
  const { tip, openedAt } = useTipSheetStore();
  const bottomSheetRef = useRef<BottomSheetMethods>(null);

  useEffect(() => {
    if (tip) bottomSheetRef.current?.expand();
  }, [tip, openedAt]);

  return (
    <CustomBottomSheet ref={bottomSheetRef}>
      <BottomSheetView className="px-5 pb-4">
        {tip && (
          <>
            <Text className="mb-2 text-2xl font-bold">{tip.title}</Text>
            <Text className="mb-6 text-neutral-500">{tip.description}</Text>

            <View className="mb-6 gap-3">
              {tip.points.map((point) => (
                <View
                  key={point.title}
                  className="flex-row items-start gap-3 rounded-xl bg-neutral-100 px-4 py-3">
                  <Text className="text-xl">{point.icon}</Text>
                  <View className="flex-1 gap-0.5">
                    <Text className="font-bold text-green-600">{point.title}</Text>
                    <Text className="text-neutral-700">{point.text}</Text>
                  </View>
                </View>
              ))}
            </View>

            <RippleButton
              onPress={() => bottomSheetRef.current?.close()}
              outerClassName="w-full"
              className="w-full rounded-xl bg-green-600 py-3">
              <Text className="font-bold text-white">확인</Text>
            </RippleButton>
          </>
        )}
      </BottomSheetView>
    </CustomBottomSheet>
  );
};
