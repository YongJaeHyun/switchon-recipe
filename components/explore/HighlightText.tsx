import { Text } from 'components/common/Text';
import { ComponentPropsWithoutRef } from 'react';

interface HighlightTextProps extends ComponentPropsWithoutRef<typeof Text> {
  text: string;
  keyword?: string;
}

export const HighlightText = ({ text, keyword, className, ...props }: HighlightTextProps) => {
  if (!keyword) return <Text className={className}>{text}</Text>;

  const regex = new RegExp(`(${keyword})`, 'gi');
  const parts = text.split(regex);

  return (
    <Text>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <Text
            key={`${part}-${i}`}
            className={`rounded-sm bg-yellow-200/60 text-yellow-500 ${className}`}
            {...props}>
            {part}
          </Text>
        ) : (
          <Text key={`${part}-${i}`} className={className}>
            {part}
          </Text>
        )
      )}
    </Text>
  );
};
