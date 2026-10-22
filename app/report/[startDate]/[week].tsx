import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { ReportStats } from 'components/report/ReportStats';
import { router, useLocalSearchParams } from 'expo-router';
import { useWeeklyReport } from 'hooks/useWeeklyReports';
import { type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserStore } from 'stores/userStore';
import colors from 'tailwindcss/colors';
import type { ReportContent } from 'types/report';
import { MEAL_LABELS } from 'utils/recommendForm';
import { formatProgramStart, formatReportRange, isEmptyReport } from 'utils/reportDisplay';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

const EMPTY_CONTENT: ReportContent = {
  summary: '',
  good: '',
  improve: '',
  action: '',
  actionLink: null,
  weightNote: '',
  nextWeek: '',
};

const Header = ({ title }: { title: string }) => (
  <View className="flex-row items-center gap-3 px-5 pb-2 pt-4">
    <TouchableOpacity onPress={router.back} hitSlop={10}>
      <MaterialIcons name="arrow-back" size={28} color="black" />
    </TouchableOpacity>
    <Text className="text-xl font-bold">{title}</Text>
  </View>
);

const Section = ({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) => (
  <View className="gap-3 rounded-xl border border-neutral-200 bg-white p-4">
    <View className="flex-row items-center gap-2">
      <MaterialIcons name={icon} size={20} color={colors.green[600]} />
      <Text className="text-base font-bold text-neutral-800">{title}</Text>
    </View>
    {children}
  </View>
);

const Body = ({ children }: { children: ReactNode }) => (
  <Text className="text-base leading-6 text-neutral-700">{children}</Text>
);

const Message = ({ text, onRetry }: { text: string; onRetry?(): void }) => (
  <View className="items-center gap-3 py-16">
    <Text className="text-neutral-500">{text}</Text>
    {onRetry && (
      <TouchableOpacity
        className="rounded-lg border border-neutral-300 px-3 py-2"
        onPress={onRetry}>
        <Text className="text-sm text-neutral-600">다시 시도</Text>
      </TouchableOpacity>
    )}
  </View>
);

export default function ReportDetailScreen() {
  const params = useLocalSearchParams<{ startDate: string; week: string }>();
  const startDate = String(params.startDate ?? '');
  const weekIndex = Number(params.week);
  const currentStartDate = (useUserStore((state) => state.start_date) || '').slice(0, 10);
  const { report, isLoading, isError, refetch } = useWeeklyReport(startDate, weekIndex);

  const title = Number.isInteger(weekIndex) ? `${weekIndex}주차 리포트` : '주간 리포트';
  // 시작일을 아직 모르면(사용자 정보 불러오는 중) 이전 프로그램으로 표시하지 않는다
  const isPrevious = !!report && !!currentStartDate && report.start_date !== currentStartDate;
  // 문장이 없거나 깨진 행이어도 숫자는 보여준다 (빈 칸은 숨김)
  const content = report?.content ?? EMPTY_CONTENT;

  const renderBody = () => {
    if (isLoading) return <ActivityIndicator className="py-16" color={colors.green[600]} />;
    if (!report) {
      return isError ? (
        <Message text="리포트를 불러오지 못했어요" onRetry={refetch} />
      ) : (
        <Message text="리포트를 찾을 수 없어요" />
      );
    }

    if (isEmptyReport(report)) {
      return (
        <View className="items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-10">
          <MaterialIcons name="event-note" size={36} color={colors.neutral[300]} />
          <Text className="text-lg font-bold text-neutral-700">이번 주는 기록이 없어요</Text>
          <Text className="text-center text-sm text-neutral-500">
            체중이나 할 일을 기록하면 다음 리포트에서 한 주를 정리해 드릴게요
          </Text>
        </View>
      );
    }

    return (
      <>
        {!!content.summary && (
          <View className="rounded-xl bg-green-600 p-4">
            <Text className="text-lg font-bold leading-7 text-white">{content.summary}</Text>
          </View>
        )}

        {report.stats && (
          <Section icon="bar-chart" title="숫자로 본 이번 주">
            <ReportStats stats={report.stats} />
          </Section>
        )}

        {!!content.good && (
          <Section icon="thumb-up-off-alt" title="잘한 점">
            <Body>{content.good}</Body>
          </Section>
        )}

        {(!!content.improve || !!content.action) && (
          <Section icon="lightbulb-outline" title="아쉬운 점과 다음 주 행동">
            {!!content.improve && <Body>{content.improve}</Body>}
            {!!content.action && (
              <View className="flex-row gap-2 rounded-lg bg-green-50 p-3">
                <MaterialIcons name="arrow-forward" size={18} color={colors.green[700]} />
                <Text className="flex-1 font-semibold leading-6 text-green-800">
                  {content.action}
                </Text>
              </View>
            )}
            {content.actionLink && (
              <RippleButton
                outerClassName="border border-green-600 bg-white"
                className="w-full flex-row gap-1 py-3"
                rippleColor={colors.green[100]}
                onPress={() => router.push(`/recommend?meal=${content.actionLink?.meal ?? ''}`)}>
                <MaterialIcons name="restaurant-menu" size={18} color={colors.green[600]} />
                <Text className="font-bold text-green-600">
                  {MEAL_LABELS[content.actionLink.meal]} 추천 보기
                </Text>
              </RippleButton>
            )}
          </Section>
        )}

        {!!content.weightNote && (
          <Section icon="monitor-weight" title="체중 해석">
            <Body>{content.weightNote}</Body>
          </Section>
        )}

        {!!content.nextWeek && (
          <Section icon="event" title="다음 주 달라지는 점">
            {/* 줄바꿈(\n)이 들어 있으면 그대로 줄을 나눠 보여준다 */}
            <Body>{content.nextWeek}</Body>
          </Section>
        )}
      </>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-neutral-50">
      <Header title={title} />
      <ScrollView
        contentContainerClassName="gap-4 px-5 pb-10 pt-2"
        showsVerticalScrollIndicator={false}>
        {report && (report.stats || isPrevious) && (
          <View className="flex-row flex-wrap items-center gap-2">
            {report.stats && (
              <Text className="text-sm text-neutral-500">
                {formatReportRange(report.stats.range)}
              </Text>
            )}
            {isPrevious && (
              <View className="rounded-full bg-neutral-200 px-2 py-0.5">
                <Text className="text-xs text-neutral-600">
                  이전 프로그램 · {formatProgramStart(report.start_date)}
                </Text>
              </View>
            )}
          </View>
        )}
        {renderBody()}
      </ScrollView>
    </SafeAreaView>
  );
}
