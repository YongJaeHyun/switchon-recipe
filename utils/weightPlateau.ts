// 기록 탭 체중 칸의 정체기 안내 카드용 순수 함수. 화면 컴포넌트는 이 결과를 보여주기만 한다
import type { PassStatus } from 'types/pass';
import { isPassOnSale } from './passScreen';
import { programStartOf } from './programStart';
import { round1, shiftDay, type WeightPoint } from './weight';

// 이 일수 이상 매일 기록한 체중이 PLATEAU_RANGE_KG 이내로만 움직이면 정체로 본다
export const PLATEAU_MIN_DAYS = 3;
export const PLATEAU_RANGE_KG = 0.2;

export interface WeightPlateau {
  days: number; // 연속으로 그대로인 기록 일수
  from: string; // yyyy-MM-dd
  to: string; // 마지막 기록 날짜
}

// 최근 연속 기록(하루도 빠짐없이)에서 최대·최소 차이가 0.2kg 이내인 구간이 3일 이상이면 그 구간.
// - 지금 회차(programStartOf) 기록만 본다 (이전 회차 체중과 섞지 않는다)
// - 마지막 기록이 오늘이나 어제일 때만 (그보다 오래되면 지난 일이라 "지금 정체"가 아니다)
// - 차이는 소수 한 자리로 반올림해 비교한다 (65.3-65.1 = 0.1999…, 70.9-70.7 = 0.2000…1)
export function findWeightPlateau(
  logs: WeightPoint[],
  opts: { startDate: string | null; programStart: string | null; today: string }
): WeightPlateau | null {
  const periodStart = programStartOf(opts.programStart, opts.startDate);
  if (!periodStart) return null;

  const sorted = logs
    .map((l) => ({ day: l.day.slice(0, 10), weight: Number(l.weight_kg) }))
    .filter((l) => l.day >= periodStart && Number.isFinite(l.weight))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (sorted.length < PLATEAU_MIN_DAYS) return null;

  const last = sorted[sorted.length - 1];
  if (last.day < shiftDay(opts.today, -1)) return null;

  let min = last.weight;
  let max = last.weight;
  let from = last.day;
  let days = 1;
  for (let i = sorted.length - 2; i >= 0; i--) {
    const cur = sorted[i];
    if (cur.day !== shiftDay(from, -1)) break;
    const nextMin = Math.min(min, cur.weight);
    const nextMax = Math.max(max, cur.weight);
    if (round1(nextMax - nextMin) > PLATEAU_RANGE_KG) break;
    min = nextMin;
    max = nextMax;
    from = cur.day;
    days++;
  }

  return days >= PLATEAU_MIN_DAYS ? { days, from, to: last.day } : null;
}

export function plateauTitle(days: number): string {
  return `체중이 ${days}일째 그대로예요`;
}

// 박용우 『스위치온 다이어트』: 체중보다 근육량·체지방량을 함께 보기(WEEK_BODY_CONTEXT 4주차, 6일차 팁),
// 정체될 때 단백질·근력운동과 수면(p.21 Q&A, p.19·p.22 수면 7~8시간). 앱의 기존 팁 문구를 그대로 쓴다
export const PLATEAU_TIP =
  '체중계 숫자보다 근육량과 체지방량을 함께 보세요. 단백질을 챙기고, 하루 7~8시간 자는 것도 함께 챙겨 보세요.';

// 닫은 날(KST yyyy-MM-dd)이 오늘이면 그날은 숨긴다
export function isPlateauDismissed(dismissedDay: string | null, today: string): boolean {
  return dismissedDay === today;
}

export type PlateauCta =
  // 패스 사용자: 지금 회차의 최신 리포트
  | { kind: 'report'; href: `/report/${string}/${number}` }
  // 패스 사용자인데 리포트가 아직 없음: 기록 탭 리포트 칸
  | { kind: 'reports' }
  // 패스 없음 + 판매 중: 패스 화면
  | { kind: 'pass' };

// "주간 리포트로 원인 보기" 버튼이 갈 곳. 패스가 없고 살 수도 없으면(판매 꺼짐) 버튼을 숨긴다(null)
export function plateauCta(
  status: PassStatus | undefined,
  billingAvailable: boolean | undefined,
  latestReport: { start_date: string; week_index: number } | null
): PlateauCta | null {
  if (!status) return null;
  if (status.hasAccess) {
    return latestReport
      ? {
          kind: 'report',
          href: `/report/${latestReport.start_date.slice(0, 10)}/${latestReport.week_index}`,
        }
      : { kind: 'reports' };
  }
  return isPassOnSale(status.sales, billingAvailable) ? { kind: 'pass' } : null;
}
