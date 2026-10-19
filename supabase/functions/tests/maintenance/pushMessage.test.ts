import { describe, expect, it } from 'vitest';
import { buildPushMessage } from '../../push/message.ts';

const record = {
  title: '제목',
  body: '내용',
  href: '/(tabs)/home/recipeCreation/zero',
  channel_id: 'INGREDIENT',
};

describe('buildPushMessage', () => {
  it('builds an Expo push message for a user with a token', () => {
    expect(buildPushMessage(record, 'ExponentPushToken[abc]')).toEqual({
      to: 'ExponentPushToken[abc]',
      sound: 'default',
      title: '제목',
      body: '내용',
      data: { href: '/(tabs)/home/recipeCreation/zero' },
      channelId: 'INGREDIENT',
    });
  });

  it('returns null when the user has no push token', () => {
    expect(buildPushMessage(record, null)).toBeNull();
    expect(buildPushMessage(record, '')).toBeNull();
  });
});
