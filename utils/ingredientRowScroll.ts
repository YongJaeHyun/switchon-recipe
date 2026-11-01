// 재료 만들기 화면의 가로 재료 줄: 옆으로 더 있는지·끝인지, 안내 글자, '넘겨 보기' 다음 위치

// 소수점 레이아웃 오차 (px)
const EPSILON = 1;

export interface RowMetrics {
  // 줄 전체 내용 폭
  contentWidth: number;
  // 보이는 폭
  viewportWidth: number;
  // 지금 가로 스크롤 위치
  offset: number;
}

export function rowScrollState({ contentWidth, viewportWidth, offset }: RowMetrics) {
  const overflows = viewportWidth > 0 && contentWidth - viewportWidth > EPSILON;
  const atEnd = !overflows || offset >= contentWidth - viewportWidth - EPSILON;
  return { overflows, atEnd };
}
