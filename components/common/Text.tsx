import { Text as RNText, TextProps } from 'react-native';

type CustomTextProps = TextProps & {
  className?: string;
};

export const Text = ({ className, ...props }: CustomTextProps) => {
  return <RNText {...props} className={`font-system ${className}`} />;
};
