import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserStore } from 'stores/userStore';
import { StatisticsAPI } from './StatisticsAPI';

const from = vi.fn();

vi.mock('lib/supabase', () => ({ supabase: { from: (table: string) => from(table) } }));
vi.mock('utils/sendError', () => ({ sendError: (fn: () => unknown) => fn() }));

// 사용자 정보를 불러오기 전(uid 없음)에는 통계를 보내지 않는다 (알림으로 앱을 막 연 때 등)
describe('StatisticsAPI uid 없음', () => {
  beforeEach(() => {
    from.mockReset();
    useUserStore.setState({ id: '', start_date: '' });
  });

  it('upsert는 보내지 않고 null', async () => {
    expect(await StatisticsAPI.upsert(50)).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('deleteFrom은 보내지 않고 false', async () => {
    expect(await StatisticsAPI.deleteFrom(2, 1)).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});
