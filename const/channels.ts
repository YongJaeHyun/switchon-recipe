export const CHANNELS = {
  INQUIRY: 'INQUIRY',
  FASTING: 'FASTING',
  INGREDIENT: 'INGREDIENT',
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];
