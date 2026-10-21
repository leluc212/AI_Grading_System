import { describe, it, expect } from 'vitest';
import { truncateSubmissionFiles, estimateTokens } from '../../src/grading/truncate.js';

describe('truncateSubmissionFiles', () => {
  it('giữ nguyên nội dung khi tổng kích thước nằm trong giới hạn', () => {
    const md = '# Báo cáo đồ án';
    const xml = '<data><item>test</item></data>';
    const result = truncateSubmissionFiles({
      mdContent: md,
      xmlContent: xml,
      maxInputTokens: 100, // 300 chars
    });

    expect(result.truncated).toBe(false);
    expect(result.mdContent).toBe(md);
    expect(result.xmlContent).toBe(xml);
  });

  it('cắt ngắn và chèn marker khi tổng dung lượng vượt quá maxInputTokens', () => {
    // maxInputTokens = 100 -> maxChars = 300
    // md: 400 chars, xml: 200 chars -> total: 600 chars
    const md = 'A'.repeat(400);
    const xml = 'B'.repeat(200);

    const result = truncateSubmissionFiles({
      mdContent: md,
      xmlContent: xml,
      maxInputTokens: 100,
    });

    expect(result.truncated).toBe(true);
    expect(result.mdContent).toContain('[...đã cắt');
    expect(result.xmlContent).toContain('[...đã cắt');
    expect(result.mdContent.length + result.xmlContent.length).toBeLessThanOrEqual(350);
  });

  it('ước lượng token đúng theo tỷ lệ 1/3 số ký tự làm tròn lên', () => {
    expect(estimateTokens('123456')).toBe(2);
    expect(estimateTokens('1234567')).toBe(3);
  });
});
