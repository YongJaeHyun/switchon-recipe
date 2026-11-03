import { describe, expect, it } from 'vitest';
import {
  buildInquirySlackText,
  INQUIRY_IMAGE_LINK_DAYS,
  INQUIRY_IMAGE_LINK_SECONDS,
  toImagePaths,
} from '../../notify-inquiry/inquiryMessage.ts';

const base = {
  id: 7,
  uid: 'user-1',
  title: '환불하고 싶어요',
  message: '패스를 잘못 샀어요',
  category: '환불 문의',
  createdAtText: '2026. 11. 03. 오후 03:00',
  link: 'https://example.com/inquiry/7',
};

describe('buildInquirySlackText', () => {
  it('카테고리를 제목 위에 넣는다', () => {
    const text = buildInquirySlackText({ ...base, imageUrls: [] });
    expect(text).toBe(
      '📩 새 문의가 도착했습니다!\n\nUUID: user-1\n카테고리: 환불 문의\n제목: 환불하고 싶어요\n내용: 패스를 잘못 샀어요\n접수일자: 2026. 11. 03. 오후 03:00\n링크: https://example.com/inquiry/7'
    );
  });

  it('사진마다 링크 줄을 붙이고 열리는 기간을 알린다', () => {
    const text = buildInquirySlackText({
      ...base,
      imageUrls: ['https://s/1', 'https://s/2'],
    });
    expect(
      text.endsWith(
        `링크: https://example.com/inquiry/7\n\n사진 2장 (링크는 ${INQUIRY_IMAGE_LINK_DAYS}일 동안 열려요)\n사진 1: https://s/1\n사진 2: https://s/2`
      )
    ).toBe(true);
  });

  it('서명에 실패한 사진은 실패라고 적고 번호는 그대로 둔다', () => {
    const text = buildInquirySlackText({ ...base, imageUrls: [null, 'https://s/2'] });
    expect(text).toContain('사진 1: (링크를 만들지 못했어요)\n사진 2: https://s/2');
  });

  it('카테고리가 없으면 "없음"으로 적는다', () => {
    const text = buildInquirySlackText({ ...base, category: null, imageUrls: [] });
    expect(text).toContain('카테고리: 없음\n');
  });

  it('사진이 없으면 사진 줄을 넣지 않는다', () => {
    expect(buildInquirySlackText({ ...base, imageUrls: [] })).not.toContain('사진');
  });
});

describe('toImagePaths', () => {
  it('보낸 사람 폴더 밖의 경로는 빼서 남의 사진 링크를 만들지 않는다', () => {
    expect(toImagePaths(['a/1.jpg', 'b/2.jpg', 'a/../b/3.jpg', 'ab/4.jpg'], 'a')).toEqual([
      'a/1.jpg',
    ]);
  });

  it('문자열 배열에서 빈 값을 빼고 최대 3개만 쓴다', () => {
    expect(toImagePaths(['a/1.jpg', '', 'a/2.jpg', 'a/3.jpg', 'a/4.jpg'], 'a')).toEqual([
      'a/1.jpg',
      'a/2.jpg',
      'a/3.jpg',
    ]);
  });

  it('옛 앱처럼 열이 없거나 모양이 다르면 빈 배열', () => {
    expect(toImagePaths(undefined, 'a')).toEqual([]);
    expect(toImagePaths(null, 'a')).toEqual([]);
    expect(toImagePaths('a/1.jpg', 'a')).toEqual([]);
    expect(toImagePaths([1, 'a/1.jpg'], 'a')).toEqual(['a/1.jpg']);
  });
});

describe('INQUIRY_IMAGE_LINK_SECONDS', () => {
  it('7일', () => {
    expect(INQUIRY_IMAGE_LINK_SECONDS).toBe(7 * 24 * 60 * 60);
  });
});
