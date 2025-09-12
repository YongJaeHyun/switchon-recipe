import RippleButton from 'components/common/RippleButton';
import { Text } from 'components/common/Text';
import { Link } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import colors from 'tailwindcss/colors';
import { InquiryDB } from 'types/database';
import { formatKoreanDate } from 'utils/date';
import { StatusBadge } from './StatusBadge';

interface AnswerToggleProps {
  inquiry: InquiryDB;
}

export default function InquiryItem({ inquiry }: AnswerToggleProps) {
  return (
    <Link href={`/(inquiry)/${inquiry.id}`} className="rounded-xl bg-gray-100 px-4 py-4" asChild>
      <RippleButton rippleColor={colors.neutral[100]} className="w-full">
        <View className="w-full gap-2">
          <StatusBadge status={inquiry.status} />
          <Text className="font-semibold">{inquiry.title}</Text>
          <Text className="text-neutral-500">{formatKoreanDate(inquiry.created_at)}</Text>
        </View>
      </RippleButton>
    </Link>
  );
}
