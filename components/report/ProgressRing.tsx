import { type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

// 완료율 고리 (12시 방향부터 시계 방향). percent가 null이거나 0이면 트랙만. children은 가운데에
export function ProgressRing({
  percent,
  size,
  stroke,
  color,
  track,
  children,
}: {
  percent: number | null;
  size: number;
  stroke: number;
  color: string;
  track: string;
  children?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const c = size / 2;
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={c} cy={c} r={radius} stroke={track} strokeWidth={stroke} fill="none" />
        {percent !== null && percent > 0 && (
          <Circle
            cx={c}
            cy={c}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - Math.min(100, percent) / 100)}
            transform={`rotate(-90 ${c} ${c})`}
          />
        )}
      </Svg>
      {children}
    </View>
  );
}
