// 업데이트 내역 화면 표시용. 데이터(const/notices)는 홈 공지 띠와 같이 쓰므로 이모지는 화면에서만 뗀다

// 첫 낱말에 글자·숫자·괄호가 하나도 없으면 이모지로 보고 뗀다 (Hermes 정규식 차이를 피하려고 유니코드 속성은 쓰지 않는다)
export const noticeChangeText = (change: string): string => {
  const match = change.match(/^(\S+)\s+([\s\S]*)$/);
  if (!match) return change;
  return /[0-9A-Za-z가-힣[(]/.test(match[1]) ? change : match[2];
};

// '2026.10.31' → 올해면 '10월 31일', 아니면 '2025년 8월 8일'
export const formatNoticeDate = (date: string, currentYear: number): string => {
  const match = date.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (!match) return date;
  const [, y, m, d] = match;
  const monthDay = `${Number(m)}월 ${Number(d)}일`;
  return Number(y) === currentYear ? monthDay : `${y}년 ${monthDay}`;
};
