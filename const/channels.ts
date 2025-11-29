export const CHANNELS = {
  INQUIRY: 'INQUIRY',
  FASTING: 'FASTING',
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];
