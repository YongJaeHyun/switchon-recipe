/** @type {import('tailwindcss').Config} */
import { platformSelect } from 'nativewind/theme';
import colors from 'tailwindcss/colors';

module.exports = {
  content: ['./app/**/*.{js,ts,tsx}', './components/**/*.{js,ts,tsx}'],
  safelist: [
    'text-week-1',
    'text-week-2',
    'text-week-3',
    'text-week-4',
    'text-week-5',
    'bg-week-1',
    'bg-week-2',
    'bg-week-3',
    'bg-week-4',
    'bg-week-5',
    'border-week-1',
    'border-week-2',
    'border-week-3',
    'border-week-4',
    'border-week-5',
    'rounded-lg',
    'rounded-xl',
    'rounded-full',
    'font-bold',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        week: {
          1: '#F4758A',
          2: colors.yellow[500],
          3: colors.lime[600],
          4: '#B192F5',
          5: colors.black,
        },
      },
      fontFamily: {
        system: platformSelect({
          default: 'PretendardVariable-Regular',
        }),
      },
      fontSize: {
        medium: ['1.0625rem'],
      },
    },
  },
  plugins: [],
};
