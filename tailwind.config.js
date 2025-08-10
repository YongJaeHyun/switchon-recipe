/** @type {import('tailwindcss').Config} */
import { platformSelect } from 'nativewind/theme';

module.exports = {
  content: ['./app/**/*.{js,ts,tsx}', './components/**/*.{js,ts,tsx}'],
  safelist: [
    'text-rose-500/70',
    'text-yellow-500',
    'text-lime-600',
    'text-violet-500/65',
    'rounded-lg',
    'rounded-xl',
    'rounded-full',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        system: platformSelect({
          default: 'PretendardVariable-Regular',
        }),
      },
    },
  },
  plugins: [],
};
