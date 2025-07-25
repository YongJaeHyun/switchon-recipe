export const getWeekColor = (week: number) => {
  if (week === 1) return 'text-rose-500/70';
  else if (week === 2) return 'text-yellow-500';
  else if (week === 3) return 'text-lime-600';
  else if (week === 4) return 'text-violet-500/65';
  else if (week >= 5) return 'text-black';
  else return '';
};
