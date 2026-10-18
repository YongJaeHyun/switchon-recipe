import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IngredientRequestAPI } from './IngredientRequestAPI';

const insert = vi.fn();

vi.mock('lib/supabase', () => ({ supabase: { from: () => ({ insert }) } }));
vi.mock('utils/sendError', () => ({ captureError: vi.fn() }));

describe('IngredientRequestAPI.create', () => {
  beforeEach(() => {
    insert.mockReset();
  });

  it('inserts the trimmed name and returns ok', async () => {
    insert.mockResolvedValue({ error: null });
    expect(await IngredientRequestAPI.create(' 연어 ')).toBe('ok');
    expect(insert).toHaveBeenCalledWith({ name: '연어' });
  });

  it('returns limit when RLS rejects the insert', async () => {
    insert.mockResolvedValue({ error: { code: '42501', message: 'row-level security' } });
    expect(await IngredientRequestAPI.create('연어')).toBe('limit');
  });

  it('returns error for other failures', async () => {
    insert.mockResolvedValue({ error: { code: '500', message: 'boom' } });
    expect(await IngredientRequestAPI.create('연어')).toBe('error');
  });

  it('returns error when the request throws', async () => {
    insert.mockImplementation(async () => {
      throw new Error('Network request failed');
    });
    expect(await IngredientRequestAPI.create('연어')).toBe('error');
  });
});
