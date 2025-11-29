import React, { useEffect } from 'react';
import { Animated, Pressable, Text, View, useWindowDimensions } from 'react-native';
import colors from 'tailwindcss/colors';

interface TabsProps<TabItemType> {
  selectedIndex: number;
  onSelect: (selectedIndex: number) => void;
  tabItems: readonly TabItemType[];
  bgColor?: string;
  underlineColor?: string;
}

export const Tabs = <TabItemType extends string>({
  selectedIndex,
  onSelect,
  tabItems,
  bgColor,
  underlineColor,
}: TabsProps<TabItemType>) => {
  const layout = useWindowDimensions();
  const width = (layout.width - 40) / tabItems.length;

  const animatedValue = React.useRef(new Animated.Value(selectedIndex * width)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: selectedIndex * width,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [animatedValue, selectedIndex, width]);

  return (
    <View
      className="relative flex-1 flex-row items-center border-b border-neutral-200"
      style={{
        backgroundColor: bgColor || colors.transparent,
      }}>
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width,
          borderBottomWidth: 2,
          borderBottomColor: underlineColor || colors.green[600],
          transform: [{ translateX: animatedValue }],
        }}
      />
      {tabItems.map((item, i) => (
        <Pressable
          key={item}
          onPress={() => onSelect(i)}
          className="h-11 flex-1 items-center justify-center">
          <Text className={selectedIndex === i ? 'font-bold' : 'text-neutral-500'}>{item}</Text>
        </Pressable>
      ))}
    </View>
  );
};
