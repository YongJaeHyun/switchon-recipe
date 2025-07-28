import React from 'react';
import { Pressable, PressableProps, Text } from 'react-native';

interface RippleButtonProps extends PressableProps {
  rippleColor: string;
  children?: React.ReactNode;
}

const RippleButton = React.forwardRef<React.ComponentRef<typeof Pressable>, RippleButtonProps>(
  ({ children, rippleColor, ...rest }, ref) => {
    return (
      <Pressable
        ref={ref}
        android_ripple={{ color: rippleColor, foreground: true }}
        className="w-full items-center justify-center overflow-hidden rounded-xl bg-green-600 py-5"
        {...rest}>
        <Text className="text-xl text-white">{children}</Text>
      </Pressable>
    );
  }
);

export default RippleButton;
