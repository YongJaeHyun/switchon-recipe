import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PassBadge } from 'components/common/PassBadge';
import { Text } from 'components/common/Text';
import { router } from 'expo-router';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { useWeeklyReports } from 'hooks/useWeeklyReports';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import { useWeightPlateauStore } from 'stores/weightPlateauStore';
import colors from 'tailwindcss/colors';
import { programStartOf } from 'utils/programStart';
import { groupReportsByProgram } from 'utils/reportDisplay';
import { PLATEAU_TIP, plateauCta, plateauTitle, type WeightPlateau } from 'utils/weightPlateau';

// 기록 탭 > 체중 칸: 체중이 며칠째 그대로일 때 책 근거 한 줄 + "주간 리포트로 원인 보기".
// 패스 사용자는 지금 회차 최신 리포트(없으면 리포트 칸), 아니면 패스 화면(판매 중일 때만 버튼).
// X는 그날(KST)만 숨김. 보일지(정체·닫음)는 부모가 정한다
export function WeightPlateauCard({ plateau, today }: { plateau: WeightPlateau; today: string }) {
  const dismiss = useWeightPlateauStore((state) => state.dismiss);
  const startDate = useUserStore((state) => state.start_date) || null;
  const programStart = useUserStore((state) => state.program_start);
  const { status } = usePass();
  const billingAvailable = useBillingAvailable();
  const { reports } = useWeeklyReports();

  const latestReport = useMemo(
    () =>
      groupReportsByProgram(reports, programStartOf(programStart, startDate)).current[0] ?? null,
    [reports, programStart, startDate]
  );
  const cta = plateauCta(status, billingAvailable, latestReport);

  const openCta = () => {
    if (!cta) return;
    if (cta.kind === 'report') router.push(cta.href);
    else if (cta.kind === 'reports') router.setParams({ view: 'report' });
    else router.push('/pass');
  };

  return (
    <View className="gap-3 rounded-xl bg-green-50 py-3 pl-4 pr-2">
      <View className="flex-row items-start gap-2">
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-1.5">
            <MaterialIcons name="trending-flat" size={18} color={colors.green[700]} />
            <Text className="font-bold text-green-800">{plateauTitle(plateau.days)}</Text>
          </View>
          <Text className="text-sm leading-5 text-neutral-700">{PLATEAU_TIP}</Text>
        </View>
        <Pressable
          onPress={() => dismiss(today)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="오늘 안내 닫기"
          className="p-1">
          <Ionicons name="close" size={16} color={colors.neutral[400]} />
        </Pressable>
      </View>

      {cta && (
        <Pressable
          onPress={openCta}
          accessibilityRole="button"
          accessibilityLabel={
            cta.kind === 'pass' ? '주간 리포트로 원인 보기, 패스 전용' : '주간 리포트로 원인 보기'
          }
          className="mr-2 flex-row items-center justify-between rounded-lg border border-green-200 bg-white px-3 py-2.5 active:bg-green-100">
          <Text className="text-sm font-bold text-green-700">주간 리포트로 원인 보기</Text>
          <View className="flex-row items-center gap-1">
            {cta.kind === 'pass' && <PassBadge locked />}
            <MaterialIcons name="navigate-next" size={20} color={colors.green[600]} />
          </View>
        </Pressable>
      )}
    </View>
  );
}
