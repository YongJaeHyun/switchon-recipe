import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { ReportPreviewCard } from 'components/report/ReportPreviewCard';
import { CHANNELS } from 'const/channels';
import { router } from 'expo-router';
import { usePass } from 'hooks/usePass';
import { useWeeklyReports } from 'hooks/useWeeklyReports';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import type { WeeklyReport } from 'types/report';
import { getWeekColorHex } from 'utils/getWeekColor';
import { registerChannelIfPermitted } from 'utils/notifications';
import {
  formatProgramStart,
  formatReportRange,
  groupReportsByProgram,
  isEmptyReport,
} from 'utils/reportDisplay';

const Header = () => (
  <View className="flex-row items-center gap-3 px-5 pb-2 pt-4">
    <TouchableOpacity onPress={router.back} hitSlop={10}>
      <MaterialIcons name="arrow-back" size={28} color="black" />
    </TouchableOpacity>
    <Text className="text-xl font-bold">주간 리포트</Text>
  </View>
);

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

export default function ReportListScreen() {
  const startDate = useUserStore((state) => state.start_date) || null;
  const { status } = usePass();
  const { reports, isLoading, isError, refetch } = useWeeklyReports({ refetchOnMount: 'always' });
  // 시작일을 바꾸면 예전 시작일의 리포트는 지우지 않고 "이전 프로그램"으로 내려간다
  const { current, previous } = useMemo(
    () => groupReportsByProgram(reports, startDate),
    [reports, startDate]
  );

  // 시작일을 아직 모르면(사용자 정보 불러오는 중) 이번/이전을 나누지 않고 시작일만 보여준다
  const programKnown = !!startDate;

  // 패스 유저가 목록을 열면 리포트 알림 채널을 등록한다. 권한이 이미 있을 때만 (요청 창을 띄우지 않는다)
  const hasAccess = status?.hasAccess === true;
  useEffect(() => {
    if (hasAccess) registerChannelIfPermitted(CHANNELS.REPORT);
  }, [hasAccess]);

  return (
    <SafeAreaView className="flex-1 bg-neutral-50">
      <Header />
      <ScrollView
        contentContainerClassName="gap-6 px-5 pb-10 pt-2"
        showsVerticalScrollIndicator={false}>
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
                <Text className="text-lg font-bold text-neutral-800">이번 프로그램</Text>
                {current.map((report) => (
                  <ReportRow key={report.week_index} report={report} />
                ))}
              </View>
            )}
            {previous.map((group) => (
              <View key={group.startDate} className="gap-3">
                {programKnown ? (
                  <View className="gap-0.5">
                    <Text className="text-lg font-bold text-neutral-800">이전 프로그램</Text>
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
                  <ReportRow key={report.week_index} report={report} muted={programKnown} />
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
