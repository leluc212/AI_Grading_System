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
import type { ReactNode } from 'react';
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
function tokenizeTag(tag: string): Token[] {
  const tokens: Token[] = [];
  // `<`, `</`, `<?`, `<!` + tên thẻ
  const nameMatch = /^<[/?!]?\s*([\w:.-]+)/.exec(tag);

  if (nameMatch === null) {
    // Không nhận ra tên thẻ (ví dụ `< >`) -> để nguyên, tô như dấu câu.
    return [{ text: tag, kind: 'punctuation' }];
  }

  const prefixEnd = nameMatch[0].length - nameMatch[1].length;
  tokens.push({ text: tag.slice(0, prefixEnd), kind: 'punctuation' });
  tokens.push({ text: nameMatch[1], kind: 'tagName' });

  const rest = tag.slice(nameMatch[0].length);
  // Mỗi vòng lặp lấy 1 cặp thuộc tính; phần không khớp được giữ nguyên là dấu câu.
  const attributePattern = /([\w:.-]+)(\s*=\s*)("[^"]*"|'[^']*')/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(rest)) !== null) {
    if (match.index > cursor) {
      tokens.push({ text: rest.slice(cursor, match.index), kind: 'punctuation' });
    }
    tokens.push({ text: match[1], kind: 'attributeName' });
    tokens.push({ text: match[2], kind: 'punctuation' });
    tokens.push({ text: match[3], kind: 'attributeValue' });
    cursor = match.index + match[0].length;
  }

  if (cursor < rest.length) {
    tokens.push({ text: rest.slice(cursor), kind: 'punctuation' });
  }

  return tokens;
}

export function XmlCodeBlock({ content }: { content: string }) {
  const tokens = tokenizeXml(content);

  return (
    <pre
      style={{
        margin: 0,
        padding: spaceScaledS,
        overflow: 'auto',
        maxHeight: 480,
        // `pre-wrap` để dòng dài tự ngắt thay vì tạo scroll ngang vô tận,
        // nhưng vẫn giữ nguyên khoảng trắng — quan trọng với XML.
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: fontFamilyMonospace,
        fontSize: fontSizeBodyS,
        lineHeight: lineHeightBodyS,
        background: colorBackgroundLayoutMain,
        borderRadius: borderRadiusInput,
      }}
    >
      <code>
        {tokens.map((token, tokenIndex): ReactNode => {
          if (token.kind === 'text') {
            // Text thường: React tự escape, không tô màu.
            return token.text;
          }
          return (
            // Token chỉ phân biệt nhau bằng vị trí trong chuỗi -> index là
            // key ổn định ở đây (danh sách không bao giờ bị sắp xếp lại).
            <span key={tokenIndex} style={{ color: COLORS[token.kind] }}>
              {token.text}
            </span>
          );
        })}
      </code>
    </pre>
  );
}
