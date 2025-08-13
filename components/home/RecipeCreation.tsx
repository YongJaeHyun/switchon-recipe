import { FontAwesome6 } from '@expo/vector-icons';
import { Text } from 'components/common/Text';
import { Href, Link } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import RippleButton from '../common/RippleButton';

type RecipeCreationType = '무탄수' | '저탄수';

interface RecipeCreationProps {
  href: Href;
  title: RecipeCreationType;
  subtitle: string;
}

export default function RecipeCreation({ title, subtitle, href }: RecipeCreationProps) {
  const borderColor = title === '무탄수' ? 'border-green-600' : 'border-amber-500';
  const textColor = title === '무탄수' ? 'text-green-600' : 'text-amber-500';
  const iconColor = title === '무탄수' ? colors.green[100] : colors.amber[100];

  return (
    <Link href={href} asChild>
      <RippleButton
        outerClassName={`flex-1 h-48 shadow-lg bg-white border ${borderColor}`}
        className="bg-transparent"
        rippleColor={colors.neutral[400]}
        rounded="xl">
        <View className="relative flex-1 px-6 py-5">
          <View className="z-10 flex-1 justify-between">
            <View>
              <Text className={`text-2xl font-bold ${textColor}`}>{title}</Text>
              <Text className={`text-2xl font-bold ${textColor}`}>레시피 제작</Text>
            </View>
            <Text className={`text-medium font-semibold leading-6 ${textColor}`}>{subtitle}</Text>
          </View>

          <FontAwesome6
            name={title === '무탄수' ? 'carrot' : 'bowl-rice'}
            size={100}
            color={iconColor}
            className="absolute -bottom-5 -right-5"
            pointerEvents="none"
          />
        </View>
      </RippleButton>
    </Link>
  );
}
