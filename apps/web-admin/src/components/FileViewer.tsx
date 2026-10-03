/**
 * `FileViewer` — xem nội dung 2 file bài làm của 1 nhóm (task 8.2).
 *
 * Requirement 5.3: Admin xem được nội dung file NGAY trên trang, không phải
 * tải về. Requirement 5.4: `.md` render thành markdown đã format, `.xml` hiển
 * thị có syntax highlight.
 *
 * Dùng `Tabs` (không phải 2 khối cạnh nhau) vì cả 2 file đều có thể dài; xem
 * lần lượt dễ đọc hơn là chia đôi màn hình.
 *
 * ## An toàn khi render nội dung do sinh viên nộp (Requirement 11.4)
 *
 * `react-markdown` KHÔNG render raw HTML trong markdown theo mặc định — thẻ
 * HTML trong file `.md` sẽ hiện ra dưới dạng chữ, không được thực thi. Đó
 * chính là lý do chọn nó và **không** thêm plugin `rehype-raw`: thêm plugin
 * đó sẽ mở đúng lỗ XSS mà Requirement 11.4 yêu cầu chặn. Phần `.xml` dùng
 * `XmlCodeBlock`, vốn trả về React element chứ không phải HTML string (xem
 * JSDoc của file đó).
 *
 * _Requirements: 5.3, 5.4, 11.4_
 */
import Box from '@cloudscape-design/components/box';
import Tabs from '@cloudscape-design/components/tabs';
import Markdown from 'react-markdown';
import { XmlCodeBlock } from './XmlCodeBlock';

export interface FileViewerProps {
  /** Nội dung file `.md` (đã lấy từ `teamsApi.getTeamFiles`). */
  markdownContent: string;
  /** Nội dung file `.xml`. */
  xmlContent: string;
}

export function FileViewer({ markdownContent, xmlContent }: FileViewerProps) {
  return (
    <Tabs
      tabs={[
        {
          id: 'md',
          label: 'Bài làm (.md)',
          content: (
            <Box padding={{ top: 's' }}>
              <div
                // Giới hạn chiều cao + cho cuộn: file markdown dài không nên
                // đẩy phần "Chấm bài"/"Lịch sử chấm" xuống quá xa.
                style={{ maxHeight: 480, overflow: 'auto', wordBreak: 'break-word' }}
                data-testid="markdown-content"
              >
                <Markdown>{markdownContent}</Markdown>
              </div>
            </Box>
          ),
        },
        {
          id: 'xml',
          label: 'Bài làm (.xml)',
          content: (
            <Box padding={{ top: 's' }}>
              <div data-testid="xml-content">
                <XmlCodeBlock content={xmlContent} />
              </div>
            </Box>
          ),
        },
      ]}
    />
  );
}
