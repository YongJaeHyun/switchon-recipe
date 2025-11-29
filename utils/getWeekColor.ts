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

export { getWeekBGColor, getWeekBorderColor, getWeekColor, getWeekColorHex };
