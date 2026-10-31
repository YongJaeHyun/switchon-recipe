import { describe, expect, it, vi } from 'vitest';
import { extendPassAfterRepeat } from './passExtension';

describe('extendPassAfterRepeat', () => {
  it('늘었으면 onExtended(새 만료일)를 부르고 true', async () => {
    const extend = vi.fn().mockResolvedValue('2026-12-13T10:00:00Z');
    const onExtended = vi.fn();

    expect(await extendPassAfterRepeat('2026-10-15', { extend, onExtended })).toBe(true);
    expect(extend).toHaveBeenCalledWith('2026-10-15');
    expect(onExtended).toHaveBeenCalledWith('2026-12-13T10:00:00Z');
  });

  it('서버가 늘리지 않았으면(패스 없음 등 null) false, onExtended 안 부름', async () => {
    const onExtended = vi.fn();
    expect(
      await extendPassAfterRepeat('2026-10-15', {
        extend: vi.fn().mockResolvedValue(null),
        onExtended,
      })
    ).toBe(false);
    expect(onExtended).not.toHaveBeenCalled();
  });

  it('실패해도 throw하지 않고 false (한 주 더 하기 결과에 영향 없음)', async () => {
    const onExtended = vi.fn();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      await extendPassAfterRepeat('2026-10-15', {
        extend: vi.fn().mockRejectedValue(new Error('offline')),
        onExtended,
      })
    ).toBe(false);
    expect(onExtended).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('onExtended가 throw해도 늘어난 것은 맞으므로 true', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      await extendPassAfterRepeat('2026-10-15', {
        extend: vi.fn().mockResolvedValue('2026-12-13T10:00:00Z'),
        onExtended: () => {
          throw new Error('toast');
        },
      })
    ).toBe(true);
    spy.mockRestore();
  });
});
