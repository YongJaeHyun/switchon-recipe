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
import {
  cacheGeneratedReport,
  useReportRecordDays,
  useWeeklyReports,
} from 'hooks/useWeeklyReports';
import { WeeklyReportAPI } from 'api/WeeklyReportAPI';
import { useEffect, useMemo, useState } from 'react';
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
  reportDisplayWeek,
  reportWeekLabel,
} from 'utils/reportDisplay';
import {
  missingReportWeeks,
  ON_DEMAND_MESSAGES,
  weekHasRecords,
  type WeekRange,
} from 'utils/reportOnDemand';
import { showNetworkErrorToast } from 'utils/network';

// programReports = 같은 회차의 리포트 (한 주 더 하기로 다시 지낸 주면 "N주차 · 한 번 더")
const ReportRow = ({
  report,
  programReports,
  muted,
}: {
  report: WeeklyReport;
  programReports: WeeklyReport[];
  muted?: boolean;
}) => {
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
            style={{
              color: muted ? colors.neutral[500] : getWeekColorHex(reportDisplayWeek(report)),
            }}>
            {reportWeekLabel(report, programReports)}
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

// 리포트가 없는 끝난 주 (패스 유저, 지금 회차). 리포트가 있는 줄과 같은 자리에 점선 빈 칸으로 놓고 [지금 만들기].
// noRecords: 그 주 기록이 없다는 걸 알 때 (앱이 읽은 기록, 또는 서버가 no_records로 답함) → 버튼을 막고 안내
const MissingReportRow = ({
  weekIndex,
  range,
  noRecords,
  pending,
  disabled,
  error,
  onCreate,
}: {
  weekIndex: number;
  range: WeekRange;
  noRecords: boolean;
  pending: boolean;
  disabled: boolean;
  error: string | null;
  onCreate(): void;
}) => {
  const blocked = noRecords || disabled;
  return (
    <View className="gap-2 rounded-xl border border-dashed border-neutral-300 px-4 py-3">
      <View className="flex-row items-center gap-3">
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            <Text className="font-bold text-neutral-400">{weekIndex}주차</Text>
            <Text className="text-xs text-neutral-400">{formatReportRange(range)}</Text>
          </View>
          <Text className="text-sm text-neutral-500">
            {pending ? '한 주 기록을 정리하고 있어요' : '기록이 없어서 아직 리포트가 없어요'}
          </Text>
        </View>
        {pending ? (
          <View className="flex-row items-center gap-1.5 px-1 py-2">
            <ActivityIndicator size="small" color={colors.green[600]} />
            <Text className="text-sm font-semibold text-green-700">만드는 중</Text>
          </View>
        ) : (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: blocked }}
            disabled={blocked}
            onPress={onCreate}
            className={`rounded-full px-3.5 py-2 ${blocked ? 'bg-neutral-200' : 'bg-green-600'}`}>
            <Text className={`text-sm font-bold ${blocked ? 'text-neutral-400' : 'text-white'}`}>
              지금 만들기
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {noRecords ? (
        <Text className="text-xs text-neutral-400">{ON_DEMAND_MESSAGES.no_records}</Text>
      ) : (
        !!error && <Text className="text-xs text-red-600">{error}</Text>
      )}
    </View>
  );
};

const keyOf = (startDate: string, weekIndex: number) => `${startDate}-${weekIndex}`;
// 리포트 기간 첫날 (UTC ms)
const periodFrom = (r: { start_date: string; week_index: number }) =>
  Date.parse(`${r.start_date.slice(0, 10)}T00:00:00Z`) + (r.week_index - 1) * 7 * 86_400_000;

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

  // 패스 유저: 지금 회차의 끝난 주 중 리포트가 없는 주 (기록이 없어 cron이 만들지 않은 주). 목록을 받은 뒤에만
  const missing = useMemo(
    () =>
      hasAccess && !isLoading && !isError ? missingReportWeeks(startDate, reports, new Date()) : [],
    [hasAccess, isLoading, isError, startDate, reports]
  );
  // 빈 칸 기간의 기록이 있는 날 (모르면 null → 버튼을 열어 두고 서버 답으로 막는다)
  const recordDays = useReportRecordDays(
    missing.length > 0
      ? { from: missing[missing.length - 1].range.from, to: missing[0].range.to }
      : null
  );
  // 서버가 no_records로 답한 주 (이 화면에 있는 동안)
  const [serverNoRecords, setServerNoRecords] = useState<string[]>([]);
  const [creating, setCreating] = useState<string | null>(null);
  const [createError, setCreateError] = useState<{ key: string; message: string } | null>(null);

  const createReport = async (weekIndex: number) => {
    if (!startDate || creating) return;
    const key = keyOf(startDate, weekIndex);
    setCreating(key);
    setCreateError(null);
    const outcome = await WeeklyReportAPI.generate(startDate, weekIndex, 'create');
    setCreating(null);
    if (outcome.status === 'ok') {
      cacheGeneratedReport(outcome.report);
      router.push(`/report/${outcome.report.start_date}/${outcome.report.week_index}`);
      return;
    }
    if (outcome.status === 'no_records') {
      setServerNoRecords((prev) => [...prev, key]);
      return;
    }
    if (outcome.status === 'network') {
      showNetworkErrorToast();
      return;
    }
    setCreateError({ key, message: ON_DEMAND_MESSAGES[outcome.status] });
  };

  // 이번 회차 목록: 리포트와 빈 칸을 기간 최신 순으로 함께 (빈 칸은 지금 시작일 기준이라 기간 시작일로 비교)
  const currentItems = useMemo(() => {
    const items: (
      | { kind: 'report'; at: number; report: WeeklyReport }
      | { kind: 'missing'; at: number; weekIndex: number; range: WeekRange }
    )[] = [
      ...current.map((report) => ({ kind: 'report' as const, at: periodFrom(report), report })),
      ...missing.map((m) => ({
        kind: 'missing' as const,
        at: Date.parse(`${m.range.from}T00:00:00Z`),
        weekIndex: m.weekIndex,
        range: m.range,
      })),
    ];
    // 같은 기간이면 리포트 먼저 (정렬은 안정적이라 current의 순서를 지킨다)
    return items.sort(
      (a, b) => b.at - a.at || (a.kind === b.kind ? 0 : a.kind === 'report' ? -1 : 1)
    );
  }, [current, missing]);

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
      ) : reports.length === 0 && missing.length === 0 ? (
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
          {currentItems.length > 0 && (
            <View className="gap-3">
              <Text className="text-lg font-bold text-neutral-800">이번 회차</Text>
              {currentItems.map((item) => {
                if (item.kind === 'report') {
                  return (
                    <ReportRow
                      key={keyOf(item.report.start_date, item.report.week_index)}
                      report={item.report}
                      programReports={current}
                    />
                  );
                }
                const key = keyOf(startDate ?? '', item.weekIndex);
                return (
                  <MissingReportRow
                    key={`missing-${key}`}
                    weekIndex={item.weekIndex}
                    range={item.range}
                    noRecords={
                      serverNoRecords.includes(key) ||
                      (recordDays !== null && !weekHasRecords(item.range, recordDays))
                    }
                    pending={creating === key}
                    disabled={creating !== null}
                    error={createError?.key === key ? createError.message : null}
                    onCreate={() => void createReport(item.weekIndex)}
                  />
                );
              })}
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
                  programReports={group.reports}
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
