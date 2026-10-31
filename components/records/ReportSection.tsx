import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PassBadge } from 'components/common/PassBadge';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { FourWeekReport } from 'components/records/FourWeekReport';
import { ReportPreviewCard } from 'components/report/ReportPreviewCard';
import { CHANNELS } from 'const/channels';
import { router } from 'expo-router';
import { useBillingAvailable } from 'hooks/useBillingAvailable';
import { usePass } from 'hooks/usePass';
import { useWeeklyReports } from 'hooks/useWeeklyReports';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import type { WeeklyReport } from 'types/report';
import { getWeekColorHex } from 'utils/getWeekColor';
import { registerChannelIfPermitted } from 'utils/notifications';
import { shouldShowPremiumEntry } from 'utils/passScreen';
import { programStartOf } from 'utils/programStart';
import {
  formatProgramStart,
  formatReportRange,
  groupReportsByProgram,
  isEmptyReport,
} from 'utils/reportDisplay';

const ReportRow = ({ report, muted }: { report: WeeklyReport; muted?: boolean }) => {
  const empty = isEmptyReport(report);
  const preview = empty ? '이번 주는 기록이 없어요' : report.content?.summary;

  return (
    <RippleButton
      outerClassName="border border-neutral-200 bg-white"
      className="w-full flex-row !justify-between gap-3 px-4 py-3"
      rippleColor={colors.neutral[300]}
      onPress={() => router.push(`/report/${report.start_date}/${report.week_index}`)}>
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text
            className="font-bold"
            style={{ color: muted ? colors.neutral[500] : getWeekColorHex(report.week_index) }}>
            {report.week_index}주차
          </Text>
          {report.stats && (
            <Text className="text-xs text-neutral-400">
              {formatReportRange(report.stats.range)}
            </Text>
          )}
        </View>
        {!!preview && (
          <Text
            className={`text-sm ${empty ? 'text-neutral-400' : 'text-neutral-700'}`}
            numberOfLines={2}>
            {preview}
          </Text>
        )}
      </View>
      <MaterialIcons name="navigate-next" size={24} color={colors.neutral[400]} />
    </RippleButton>
  );
};

// 기록 탭 > 리포트 칸: 나의 4주 리포트 + 주간 리포트 목록(무료 유저는 미리보기 카드)
export function ReportSection() {
  const startDate = useUserStore((state) => state.start_date) || null;
  const programStart = useUserStore((state) => state.program_start);
  const { status } = usePass();
  const { reports, isLoading, isError, refetch } = useWeeklyReports({ refetchOnMount: 'always' });
  // 회차 시작일(program_start, 없으면 시작일) 이후 리포트가 이번 회차. 한 주 더 하기·주차 맞추기로
  // 시작일이 바뀌어도 이어지고, 다시 시작하면 예전 리포트는 지우지 않고 "이전 회차"로 내려간다
  const { current, previous } = useMemo(
    () => groupReportsByProgram(reports, programStartOf(programStart, startDate)),
    [reports, programStart, startDate]
  );

  // 시작일을 아직 모르면(사용자 정보 불러오는 중) 이번/이전을 나누지 않고 시작일만 보여준다
  const programKnown = !!startDate;

  // 패스 유저가 목록을 열면 리포트 알림 채널을 등록한다. 권한이 이미 있을 때만 (요청 창을 띄우지 않는다)
  const hasAccess = status?.hasAccess === true;
  // 패스 전용 표시: 패스를 팔거나 이미 쓰고 있을 때만 (판매 전엔 레시피 탭 도구 카드처럼 숨김)
  const billingAvailable = useBillingAvailable();
  const showPassBadge = shouldShowPremiumEntry(status, billingAvailable);
  useEffect(() => {
    if (hasAccess) registerChannelIfPermitted(CHANNELS.REPORT);
  }, [hasAccess]);

  return (
    <ScrollView
      contentContainerClassName="gap-6 px-5 pb-10 pt-2"
      showsVerticalScrollIndicator={false}>
      <FourWeekReport />

      <View className="flex-row items-center gap-2">
        <Text className="text-lg font-bold">주간 리포트</Text>
        {showPassBadge && <PassBadge locked={!hasAccess} label="패스 전용" />}
      </View>
      <ReportPreviewCard />

      {isLoading ? (
        <ActivityIndicator className="py-10" color={colors.green[600]} />
      ) : isError && reports.length === 0 ? (
        <View className="items-center gap-3 py-10">
          <Text className="text-neutral-500">리포트를 불러오지 못했어요</Text>
          <TouchableOpacity
            className="rounded-lg border border-neutral-300 px-3 py-2"
            onPress={refetch}>
            <Text className="text-sm text-neutral-600">다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : reports.length === 0 ? (
        <View className="items-center gap-1 py-10">
          <Text className="text-neutral-500">아직 받은 리포트가 없어요</Text>
          {hasAccess && (
            <Text className="text-center text-sm text-neutral-400">
              한 주가 끝나면 그 주 기록을 정리해 보내드려요
            </Text>
          )}
        </View>
      ) : (
        <>
          {current.length > 0 && (
            <View className="gap-3">
              <Text className="text-lg font-bold text-neutral-800">이번 회차</Text>
              {current.map((report) => (
                <ReportRow key={`${report.start_date}-${report.week_index}`} report={report} />
              ))}
            </View>
          )}
          {previous.map((group) => (
            <View key={group.startDate} className="gap-3">
              {programKnown ? (
                <View className="gap-0.5">
                  <Text className="text-lg font-bold text-neutral-800">이전 회차</Text>
                  <Text className="text-sm text-neutral-500">
                    {formatProgramStart(group.startDate)}
                  </Text>
                </View>
              ) : (
                <Text className="text-lg font-bold text-neutral-800">
                  {formatProgramStart(group.startDate)}
                </Text>
              )}
              {group.reports.map((report) => (
                <ReportRow
                  key={`${report.start_date}-${report.week_index}`}
                  report={report}
                  muted={programKnown}
                />
              ))}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}
