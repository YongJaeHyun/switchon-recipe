import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps } from 'react-native';
import colors from 'tailwindcss/colors';

type Rounded = 'lg' | 'xl' | 'full';

interface RippleButtonProps extends PressableProps {
  rippleColor?: string;
  rounded?: Rounded;
  outerClassName?: string;
  children?: React.ReactNode;
}

const RippleButton = React.forwardRef<React.ComponentRef<typeof Pressable>, RippleButtonProps>(
  (
    {
      children,
      className,
      outerClassName,
      rippleColor = outerClassName ? colors.white : colors.green[700],
      rounded = 'xl',
      ...rest
    },
    ref
  ) => {
    const scale = useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
      Animated.spring(scale, {
        toValue: 0.96,
        useNativeDriver: true,
        speed: 50,
      }).start();
    };

    const handlePressOut = () => {
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 50,
      }).start();
    };

    const getRoundedClassName = (rounded: Rounded) => {
      if (rounded === 'lg') return 'rounded-lg';
      else if (rounded === 'xl') return 'rounded-xl';
      else if (rounded === 'full') return 'rounded-full';
      else return '';
    };

    return (
      <Animated.View
        style={{
          transform: [{ scale }],
        }}
        className={`items-center justify-center overflow-hidden ${outerClassName} ${getRoundedClassName(rounded)}`}>
        <Pressable
          ref={ref}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          android_ripple={{ color: rippleColor, foreground: true }}
          className={`items-center justify-center ${className}`}
          {...rest}>
          {children}
        </Pressable>
      </Animated.View>
    );
  }
);

export default RippleButton;
