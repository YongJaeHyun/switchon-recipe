import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { StatisticsAPI } from 'api/StatisticsAPI';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { KakaoShareButton } from 'components/share/KakaoShareButton';
import { WeightLossCheckbox } from 'components/share/WeightLossCheckbox';
import { weekCompleteLottie } from 'const/assets';
import { QueryKey } from 'const/queryKey';
import { useQueryWith402Retry } from 'hooks/useCustomQuery';
import { useProgramWeightLoss } from 'hooks/useWeights';
import LottieView from 'lottie-react-native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import { dayFullCount } from 'utils/kakaoShare';
import { shareCompletion, shareInvite } from 'utils/shareKakao';
import { week1GuideFor } from 'utils/week1Guide';
import { CustomBottomSheet } from '../common/CustomBottomSheet';

// 1주차 그날 할 일을 100% 끝냈을 때 한 번: "N일차 완주!" + 내일 달라지는 점 (const/week1Guide).
// 주차 진입 팝업의 lottie를 쓴다. day가 null이면 닫혀 있다
export function DayCompleteSheet({ day, onClose }: { day: number | null; onClose: () => void }) {
  const sheetRef = useRef<BottomSheetMethods>(null);
  // 닫히는 동안에도 내용이 남아 있게 마지막 일차를 둔다
  const [shownDay, setShownDay] = useState(day);
  if (day !== null && day !== shownDay) setShownDay(day);

  useEffect(() => {
    if (day !== null) sheetRef.current?.expand();
  }, [day]);

  const guide = shownDay === null ? null : week1GuideFor(1, shownDay);

  // 자랑하기: 이번 주 완주한 날 (완주 달력과 같은 통계) + 켠 경우만 감량 체중
  const uid = useUserStore((state) => state.id);
  const { data: rates } = useQueryWith402Retry({
    queryKey: [QueryKey.todoRateStatistics, uid],
    queryFn: StatisticsAPI.getTodoRatesByWeeks,
    enabled: shownDay !== null,
  });
  const weightLossKg = useProgramWeightLoss();
  const [withWeight, setWithWeight] = useState(false);
  const brag = () => {
    if (shownDay === null) return;
    const fullDays = dayFullCount(rates?.weeks[0]?.todoRatesByWeek, shownDay);
    shareCompletion(
      { kind: 'day', week: 1, day: shownDay, fullDays },
      withWeight ? weightLossKg : null
    );
  };

  return (
    <CustomBottomSheet ref={sheetRef} onClose={onClose}>
      <BottomSheetView className="items-center px-5 pb-4">
        {shownDay !== null && (
          <>
            {/* 축하는 하루 한 번이라 일차가 바뀔 때만 다시 그린다 */}
            <LottieView
              key={shownDay}
              source={weekCompleteLottie}
              style={{ width: '100%', height: 160 }}
              loop={false}
              autoPlay
            />
            <Text className="mb-1 text-2xl font-bold">
              <Text className="text-green-600">{shownDay}일차</Text> 완주!
            </Text>
            <Text className="mb-5 text-neutral-500">오늘 할 일을 모두 끝냈어요</Text>

            {guide && (
              <View className="mb-6 w-full gap-1 rounded-xl bg-neutral-100 px-4 py-3">
                <Text className="text-sm font-bold text-green-600">내일은</Text>
                <Text className="text-neutral-700">{guide.tomorrow}</Text>
              </View>
            )}

            {/* 카톡으로: 자랑하기(완주 인증) · 초대하기(같이 하자) */}
            <View className="w-full flex-row gap-2">
              <KakaoShareButton label="🔥 자랑하기" onPress={brag} className="flex-1" compact />
              <KakaoShareButton
                label="👥 초대하기"
                accessibilityLabel="같이 할 사람 초대하기"
                onPress={shareInvite}
                className="flex-1"
                compact
              />
            </View>
            <View className="mb-4 mt-1 w-full">
              {weightLossKg !== null && (
                <WeightLossCheckbox
                  lossKg={weightLossKg}
                  value={withWeight}
                  onChange={setWithWeight}
                />
              )}
            </View>

            <RippleButton
              onPress={() => sheetRef.current?.close()}
              rippleColor={colors.green[700]}
              outerClassName="w-full"
              className="w-full rounded-xl bg-green-600 py-3">
              <Text className="font-bold text-white">확인</Text>
            </RippleButton>
          </>
        )}
      </BottomSheetView>
    </CustomBottomSheet>
  );
}
