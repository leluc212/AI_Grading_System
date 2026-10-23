/**
 * Hiển thị nội dung XML có syntax highlight (phần `.xml` của Requirement 5.4).
 *
 * ## Vì sao tự tô màu thay vì dùng thư viện highlight
 *
 * Nội dung này do SINH VIÊN nộp lên, tức là dữ liệu không tin cậy. Hầu hết
 * thư viện highlight (Prism, highlight.js) hoạt động bằng cách sinh ra chuỗi
 * HTML rồi nhờ `dangerouslySetInnerHTML` để chèn vào DOM — làm vậy với dữ
 * liệu không tin cậy là đúng kịch bản XSS mà Requirement 11.4 yêu cầu chặn,
 * và chỉ an toàn nếu ta tin tuyệt đối vào bước escape của thư viện.
 *
 * Bộ tô màu dưới đây nhận chuỗi và trả về **React element**, không phải HTML
 * string. React tự escape mọi text node, nên kể cả khi tokenizer này phân
 * tích sai thì điều tệ nhất xảy ra là màu bị lệch — không có đường nào để
 * thực thi mã. Đổi lại là phạm vi hẹp (XML: thẻ, tên thuộc tính, giá trị
 * thuộc tính, comment, text), vừa đủ cho yêu cầu "có định dạng/syntax
 * highlight" mà không thêm dependency.
 *
 * _Requirements: 5.4, 11.4_
 */
import { memo, useMemo, type ReactNode } from 'react';
import {
  borderRadiusInput,
  colorBackgroundLayoutMain,
  colorTextBodySecondary,
  colorTextStatusInfo,
  colorTextStatusSuccess,
  colorTextStatusWarning,
  fontFamilyMonospace,
  fontSizeBodyS,
  lineHeightBodyS,
  spaceScaledS,
} from '@cloudscape-design/design-tokens';

/**
 * Màu lấy từ `@cloudscape-design/design-tokens`.
 *
 * Quan trọng: KHÔNG viết tay chuỗi `var(--color-text-...-<hash>)`. Cloudscape
 * sinh tên CSS custom property kèm hash theo từng version, nên tên viết tay sẽ
 * âm thầm không khớp sau mỗi lần nâng thư viện (rơi về giá trị fallback) và
 * cũng không đổi theo dark mode. Package `design-tokens` expose đúng các tên
 * ổn định này nên theme luôn khớp phần còn lại của UI.
 */
const COLORS = {
  punctuation: colorTextBodySecondary,
  tagName: colorTextStatusInfo,
  attributeName: colorTextStatusSuccess,
  attributeValue: colorTextStatusWarning,
  comment: colorTextBodySecondary,
} as const;

/** 1 đoạn đã được phân loại để tô màu. */
interface Token {
  text: string;
  kind: keyof typeof COLORS | 'text';
}

/**
 * Cắt chuỗi XML thành các token để tô màu.
 *
 * Cách làm: quét tuần tự, mỗi lần gặp `<` thì lấy trọn khối tới `>` rồi phân
 * tích bên trong khối đó; phần ngoài khối là text thường. Có xử lý comment
 * (`<!-- ... -->`) vì nội dung bên trong comment không được tô như thẻ.
 *
 * `export` để test được trực tiếp ở mức hàm thuần, không cần dựng DOM.
 */
export function tokenizeXml(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const tagStart = source.indexOf('<', index);

    // Không còn thẻ nào -> phần còn lại là text.
    if (tagStart === -1) {
      tokens.push({ text: source.slice(index), kind: 'text' });
      break;
    }

    // Text đứng trước thẻ.
    if (tagStart > index) {
      tokens.push({ text: source.slice(index, tagStart), kind: 'text' });
    }

    // Comment: lấy trọn tới `-->` (hoặc hết chuỗi nếu comment chưa đóng).
    if (source.startsWith('<!--', tagStart)) {
      const commentEnd = source.indexOf('-->', tagStart);
      const end = commentEnd === -1 ? source.length : commentEnd + 3;
      tokens.push({ text: source.slice(tagStart, end), kind: 'comment' });
      index = end;
      continue;
    }

    const tagEnd = source.indexOf('>', tagStart);
    // Thẻ chưa đóng (XML không hợp lệ) -> coi phần còn lại là text, không cố đoán.
    if (tagEnd === -1) {
      tokens.push({ text: source.slice(tagStart), kind: 'text' });
      break;
    }

    tokens.push(...tokenizeTag(source.slice(tagStart, tagEnd + 1)));
    index = tagEnd + 1;
  }

  return tokens;
}

/**
 * Phân tích 1 khối thẻ hoàn chỉnh (`<...>`) thành token.
 *
 * Dùng regex trên 1 khối ĐÃ được cắt sẵn (không phải trên cả file) nên không
 * có chuyện "dùng regex để parse XML": việc tách khối do `tokenizeXml` lo,
 * đây chỉ nhận diện tên thẻ và các cặp `thuộc tính="giá trị"` bên trong.
 */
function consumeWhile(
  str: string,
  startIndex: number,
  predicate: (char: string) => boolean,
): number {
  let i = startIndex;
  while (i < str.length && predicate(str[i])) {
    i++;
  }
  return i;
}

function parseQuotedValue(rest: string, startIndex: number): { nextIndex: number; token: Token } {
  const quote = rest[startIndex];
  let i = startIndex + 1;
  while (i < rest.length && rest[i] !== quote) {
    i++;
  }
  if (i < rest.length && rest[i] === quote) {
    i++;
  }
  return { nextIndex: i, token: { text: rest.slice(startIndex, i), kind: 'attributeValue' } };
}

function parseAttributeEquals(
  rest: string,
  startIndex: number,
): { nextIndex: number; tokens: Token[] } {
  let i = consumeWhile(rest, startIndex, (c) => /\s/.test(c));
  if (i < rest.length && rest[i] === '=') {
    i = consumeWhile(rest, i + 1, (c) => /\s/.test(c));
    const tokens: Token[] = [{ text: rest.slice(startIndex, i), kind: 'punctuation' }];
    if (i < rest.length && (rest[i] === '"' || rest[i] === "'")) {
      const val = parseQuotedValue(rest, i);
      tokens.push(val.token);
      i = val.nextIndex;
    }
    return { nextIndex: i, tokens };
  }
  if (i > startIndex) {
    return { nextIndex: i, tokens: [{ text: rest.slice(startIndex, i), kind: 'punctuation' }] };
  }
  return { nextIndex: startIndex, tokens: [] };
}

function tokenizeTagAttributes(rest: string, tokens: Token[]): void {
  let i = 0;
  while (i < rest.length) {
    const punctEnd = consumeWhile(rest, i, (c) => /[\s/>?]/.test(c));
    if (punctEnd > i) {
      tokens.push({ text: rest.slice(i, punctEnd), kind: 'punctuation' });
      i = punctEnd;
    }
    if (i >= rest.length) break;

    const nameEnd = consumeWhile(rest, i, (c) => !/[\s=/>?]/.test(c));
    if (nameEnd === i) {
      tokens.push({ text: rest[i], kind: 'punctuation' });
      i++;
      continue;
    }
    tokens.push({ text: rest.slice(i, nameEnd), kind: 'attributeName' });
    i = nameEnd;

    const eqResult = parseAttributeEquals(rest, i);
    tokens.push(...eqResult.tokens);
    i = eqResult.nextIndex;
  }
}

/**
 * Phân tích 1 khối thẻ hoàn chỉnh (`<...>`) thành token.
 *
 * Dùng regex trên 1 khối ĐÃ được cắt sẵn (không phải trên cả file) nên không
 * có chuyện "dùng regex để parse XML": việc tách khối do `tokenizeXml` lo,
 * đây chỉ nhận diện tên thẻ và các cặp `thuộc tính="giá trị"` bên trong.
 */
function tokenizeTag(tag: string): Token[] {
  const tokens: Token[] = [];
  // `<`, `</`, `<?`, `<!` + tên thẻ
  const nameMatch = /^<[/?!]?\s*([\w:.-]+)/.exec(tag);

  if (nameMatch === null) {
    // Không nhận ra tên thẻ (ví dụ `< >`) -> để nguyên, tô như dấu câu.
    return [{ text: tag, kind: 'punctuation' }];
  }

  const prefixEnd = nameMatch[0].length - nameMatch[1].length;
  tokens.push(
    { text: tag.slice(0, prefixEnd), kind: 'punctuation' },
    { text: nameMatch[1], kind: 'tagName' },
  );

  const rest = tag.slice(nameMatch[0].length);
  tokenizeTagAttributes(rest, tokens);

  return tokens;
}

export const XmlCodeBlock = memo(function XmlCodeBlock({ content }: { readonly content: string }) {
  const tokens = useMemo(() => tokenizeXml(content), [content]);

  return (
    <pre
      className="gpu-code-container gpu-scroll-container"
      style={{
        margin: 0,
        padding: spaceScaledS,
        overflow: 'auto',
        minHeight: 450,
        maxHeight: 700,
        // `pre-wrap` để dòng dài tự ngắt thay vì tạo scroll ngang vô tận,
        // nhưng vẫn giữ nguyên khoảng trắng — quan trọng với XML.
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: fontFamilyMonospace,
        fontSize: fontSizeBodyS,
        lineHeight: lineHeightBodyS,
        background: colorBackgroundLayoutMain,
        borderRadius: borderRadiusInput,
        transform: 'translateZ(0)',
        willChange: 'scroll-position',
      }}
    >
      <code>
        {tokens.map((token, tokenIndex): ReactNode => {
          if (token.kind === 'text') {
            // Text thường: React tự escape, không tô màu.
            return token.text;
          }
          return (
            <span key={`xml-tok-${tokenIndex}-${token.kind}`} style={{ color: COLORS[token.kind] }}>
              {token.text}
            </span>
          );
        })}
      </code>
    </pre>
  );
});
