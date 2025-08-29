/** @type {import('tailwindcss').Config} */
import { platformSelect } from 'nativewind/theme';
import colors from 'tailwindcss/colors';

module.exports = {
  content: ['./app/**/*.{js,ts,tsx}', './components/**/*.{js,ts,tsx}'],
  safelist: [
    'font-bold',
    'bg-green-600',
    'bg-amber-500',
    {
      pattern: /(text|bg|border)-week-(1|2|3|4|5)/,
    },
    {
      pattern: /rounded-(lg|xl|full)/,
    },
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
