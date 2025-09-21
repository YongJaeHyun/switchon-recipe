export const CHANNELS = {
  INQUIRY: 'INQUIRY',
} as const;

export type Channels = (typeof CHANNELS)[keyof typeof CHANNELS];
