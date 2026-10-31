import colors from 'tailwindcss/colors';

const getWeekColor = (week: number) => {
  if (week === 1) return 'text-week-1';
  else if (week === 2) return 'text-week-2';
  else if (week === 3) return 'text-week-3';
  else if (week === 4) return 'text-week-4';
  else if (week >= 5) return 'text-week-5';
  else return '';
};

const getWeekBGColor = (week: number) => {
  if (week === 1) return 'bg-week-1';
  else if (week === 2) return 'bg-week-2';
  else if (week === 3) return 'bg-week-3';
  else if (week === 4) return 'bg-week-4';
  else if (week >= 5) return 'bg-week-5';
  else return '';
};

const getWeekBorderColor = (week: number) => {
  if (week === 1) return 'border-week-1';
  else if (week === 2) return 'border-week-2';
  else if (week === 3) return 'border-week-3';
  else if (week === 4) return 'border-week-4';
  else if (week >= 5) return 'border-week-5';
  else return '';
};

const getWeekColorHex = (week: number) => {
  if (week === 1) return '#F4758A';
  else if (week === 2) return colors.yellow[500];
  else if (week === 3) return colors.lime[600];
  else if (week === 4) return '#B192F5';
  else if (week >= 5) return colors.black;
  else return '';
};

// 주차 색으로 채운 칩·배지 위 글자색. 밝은 주차 색(분홍·노랑·연두·보라)에는 흰 글자 대비가 3:1도 안 돼서
// 어두운 글자를 쓰고, 검정(유지기)에만 흰 글자 (모두 4.5:1 이상)
const getWeekOnColorHex = (week: number) => (week >= 5 ? colors.white : colors.neutral[900]);

// 흰 바탕 위 주차 글자색. 주차 색 그대로는 글자로 읽기 어려워 같은 계열의 진한 색 (4.5:1 이상)
const getWeekInkHex = (week: number) => {
  if (week === 1) return colors.rose[700];
  else if (week === 2) return colors.yellow[700];
  else if (week === 3) return colors.lime[700];
  else if (week === 4) return colors.violet[700];
  else if (week >= 5) return colors.black;
  else return colors.neutral[900];
};

export {
  getWeekBGColor,
  getWeekBorderColor,
  getWeekColor,
  getWeekColorHex,
  getWeekInkHex,
  getWeekOnColorHex,
};
