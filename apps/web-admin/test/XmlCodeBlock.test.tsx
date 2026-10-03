/**
 * Test bộ tô màu XML (task 8.2).
 *
 * Hai thứ cần đảm bảo:
 *   1. Tokenizer phân loại đúng (để có syntax highlight thật — Requirement 5.4).
 *   2. **Không mất và không thực thi nội dung**: file XML do sinh viên nộp là
 *      dữ liệu không tin cậy, nên dù chuỗi có chứa gì thì ghép các token lại
 *      phải ra đúng chuỗi gốc, và không có script nào được tạo ra
 *      (Requirement 11.4).
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { XmlCodeBlock, tokenizeXml } from '../src/components/XmlCodeBlock';

/** Ghép lại toàn bộ token — phải khôi phục y nguyên chuỗi đầu vào. */
function detokenize(source: string): string {
  return tokenizeXml(source)
    .map((token) => token.text)
    .join('');
}

describe('tokenizeXml - phân loại', () => {
  it('nhận ra tên thẻ', () => {
    const tokens = tokenizeXml('<root></root>');
    const tagNames = tokens.filter((t) => t.kind === 'tagName').map((t) => t.text);
    expect(tagNames).toEqual(['root', 'root']);
  });

  it('nhận ra tên và giá trị thuộc tính', () => {
    const tokens = tokenizeXml('<item id="42" name=\'abc\'/>');
    expect(tokens.filter((t) => t.kind === 'attributeName').map((t) => t.text)).toEqual([
      'id',
      'name',
    ]);
    expect(tokens.filter((t) => t.kind === 'attributeValue').map((t) => t.text)).toEqual([
      '"42"',
      "'abc'",
    ]);
  });

  it('nhận ra comment và KHÔNG tô nội dung bên trong như thẻ', () => {
    const tokens = tokenizeXml('<!-- <fake attr="x"> --><real/>');
    expect(tokens.filter((t) => t.kind === 'comment').map((t) => t.text)).toEqual([
      '<!-- <fake attr="x"> -->',
    ]);
    // Chỉ `real` được coi là tên thẻ; `fake` nằm trong comment.
    expect(tokens.filter((t) => t.kind === 'tagName').map((t) => t.text)).toEqual(['real']);
  });

  it('coi phần ngoài thẻ là text thường', () => {
    const tokens = tokenizeXml('<a>noi dung</a>');
    expect(tokens.filter((t) => t.kind === 'text').map((t) => t.text)).toEqual(['noi dung']);
  });

  it('xử lý khai báo prolog', () => {
    const tokens = tokenizeXml('<?xml version="1.0"?>');
    expect(tokens.filter((t) => t.kind === 'tagName').map((t) => t.text)).toEqual(['xml']);
    expect(tokens.filter((t) => t.kind === 'attributeName').map((t) => t.text)).toEqual([
      'version',
    ]);
  });
});

describe('tokenizeXml - không làm hỏng dữ liệu', () => {
  it.each([
    '<root></root>',
    '<a b="c">d</a>',
    '<!-- comment --><x/>',
    'text không có thẻ nào',
    '<thẻ chưa đóng',
    '<a>unclosed',
    '< >',
    '',
    '<a b="<không phải thẻ>">x</a>',
    '  <a>\n\t<b/>\n</a>  ',
  ])('ghép token lại ra đúng chuỗi gốc: %j', (source) => {
    // Nếu tokenizer đánh rơi hoặc nhân đôi ký tự, Admin sẽ đọc sai bài làm —
    // tệ hơn là không highlight.
    expect(detokenize(source)).toBe(source);
  });

  it('giữ nguyên khoảng trắng và dòng mới của XML nhiều dòng', () => {
    const source = '<root>\n  <child attr="1">value</child>\n</root>\n';
    expect(detokenize(source)).toBe(source);
  });
});

describe('XmlCodeBlock - an toàn XSS (Requirement 11.4)', () => {
  it('hiển thị thẻ script dưới dạng chữ, không tạo element script', () => {
    const malicious = '<root><script>window.__xss = true;</script></root>';
    const { container } = render(<XmlCodeBlock content={malicious} />);

    // Không có `<script>` thật nào được tạo trong DOM.
    expect(container.querySelector('script')).toBeNull();
    // Nội dung vẫn hiển thị đầy đủ cho Admin đọc.
    expect(container.textContent).toBe(malicious);
  });

  it('không tạo được thuộc tính sự kiện từ nội dung file', () => {
    const malicious = '<img src="x" onerror="window.__xss = true" />';
    const { container } = render(<XmlCodeBlock content={malicious} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe(malicious);
  });

  it('render được XML thường và tô màu bằng span', () => {
    render(<XmlCodeBlock content={'<root attr="1">x</root>'} />);

    // `root` được tách thành token riêng -> có element riêng cho nó.
    expect(screen.getAllByText('root').length).toBeGreaterThan(0);
  });
});
