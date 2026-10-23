import { LegacyTabRedirect } from 'components/common/LegacyTabRedirect';

// 체중 화면은 기록 탭 > 체중 칸으로 옮겼다 (푸시 href /weight 호환)
export default function WeightRedirect() {
  return <LegacyTabRedirect path="/weight" />;
}
