import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Text, View } from 'react-native';
import colors from 'tailwindcss/colors';

const TipLinearGradient = () => (
  <LinearGradient
    colors={[
      colors.yellow[100],
      colors.yellow[200],
      colors.yellow[300],
      colors.yellow[400],
      colors.yellow[100],
    ]}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 0 }}
    style={{ width: '100%', height: '100%' }}
  />
);

export function Tip() {
  const translateX = useRef(new Animated.Value(0)).current;
  const [textWidth, setTextWidth] = useState(0);

  const checkTextWidth = (e: LayoutChangeEvent) => {
    setTextWidth(e.nativeEvent.layout.width);
  };

  useEffect(() => {
    if (textWidth === 0) return;

    Animated.loop(
      Animated.timing(translateX, {
        toValue: 2 * textWidth,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [textWidth, translateX]);

  return (
    <View className="relative">
      <Text className="text-sm font-bold text-white" onLayout={checkTextWidth}>
        Tip. 아래 탐색 탭으로도 이동할 수 있어요!
      </Text>

      <View
        className="absolute -bottom-1 h-1.5 overflow-hidden rounded-full"
        style={{ width: textWidth }}>
        <Animated.View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            width: textWidth * 2,
            height: '100%',
            transform: [{ translateX }],
          }}>
          <TipLinearGradient />
          <TipLinearGradient />
        </Animated.View>
      </View>
    </View>
  );
}
