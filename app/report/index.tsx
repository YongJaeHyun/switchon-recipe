import { LegacyTabRedirect } from 'components/common/LegacyTabRedirect';

// 주간 리포트 목록은 기록 탭 > 리포트 칸으로 옮겼다 (/report 링크 호환)
export default function ReportListRedirect() {
  return <LegacyTabRedirect path="/report" />;
}
