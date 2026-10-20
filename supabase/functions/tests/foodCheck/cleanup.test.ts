import { describe, expect, it } from 'vitest';
import { partitionRemoved, selectExpired } from '../../_shared/foodCheckCleanup.ts';

const NOW = new Date('2026-11-20T00:00:00Z');

describe('selectExpired', () => {
  it('정확히 30일 지난 원본은 삭제 대상', () => {
    const rows = [{ id: 1, image_path: 'u/1.jpg', created_at: '2026-10-21T00:00:00Z' }];
    expect(selectExpired(rows, NOW)).toEqual([{ id: 1, image_path: 'u/1.jpg' }]);
  });

  it('29일 23시간 지난 원본은 유지', () => {
    const rows = [{ id: 1, image_path: 'u/1.jpg', created_at: '2026-10-21T01:00:00Z' }];
    expect(selectExpired(rows, NOW)).toEqual([]);
  });

  it('image_path가 null인 행은 제외', () => {
    const rows = [{ id: 1, image_path: null, created_at: '2026-01-01T00:00:00Z' }];
    expect(selectExpired(rows, NOW)).toEqual([]);
  });

  it('days 인자를 바꿀 수 있고 id와 경로만 돌려줌', () => {
    const rows = [
      { id: 1, image_path: 'u/1.jpg', created_at: '2026-11-12T00:00:00Z' },
      { id: 2, image_path: 'u/2.jpg', created_at: '2026-11-14T00:00:00Z' },
    ];
    expect(selectExpired(rows, NOW, 7)).toEqual([{ id: 1, image_path: 'u/1.jpg' }]);
  });
});

describe('partitionRemoved', () => {
  const requested = [
    { id: 1, image_path: 'u/1.jpg' },
    { id: 2, image_path: 'u/2.jpg' },
    { id: 3, image_path: 'u/3.jpg' },
  ];

  it('전부 삭제됨', () => {
    expect(partitionRemoved(requested, ['u/1.jpg', 'u/2.jpg', 'u/3.jpg'])).toEqual({
      removedIds: [1, 2, 3],
      notRemoved: [],
    });
  });

  it('일부만 삭제됨: 3개 중 1개 누락', () => {
    expect(partitionRemoved(requested, ['u/1.jpg', 'u/3.jpg'])).toEqual({
      removedIds: [1, 3],
      notRemoved: [{ id: 2, image_path: 'u/2.jpg' }],
    });
  });

  it('하나도 안 돌아옴', () => {
    expect(partitionRemoved(requested, [])).toEqual({ removedIds: [], notRemoved: requested });
  });
});
