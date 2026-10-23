/**
 * `FileViewer` — xem nội dung 2 file bài làm của 1 nhóm (task 8.2 - GPU Accelerated).
 *
 * Tối ưu hoá với React.memo và Hardware Compositing để tránh render lại
 * khi trang chi tiết nhóm polling cập nhật trạng thái chấm bài.
 *
 * _Requirements: 5.3, 5.4, 11.4_
 */
import { memo, useCallback, useState } from 'react';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Tabs from '@cloudscape-design/components/tabs';
import Markdown from 'react-markdown';
import { XmlCodeBlock } from './XmlCodeBlock';
import { ArchitectureViewer } from './ArchitectureViewer';

export interface FileViewerProps {
  /** Nội dung file `.md` (đã lấy từ `teamsApi.getTeamFiles`). */
  markdownContent: string;
  /** Nội dung file `.xml`. */
  xmlContent: string;
}

export const FileViewer = memo(function FileViewer({
  markdownContent,
  xmlContent,
}: FileViewerProps) {
  const [copiedXml, setCopiedXml] = useState(false);

  const handleCopyXml = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(xmlContent);
      setCopiedXml(true);
      setTimeout(() => setCopiedXml(false), 2000);
    } catch (err) {
      console.error('Không thể sao chép XML:', err);
    }
  }, [xmlContent]);

  return (
    <Tabs
      tabs={[
        {
          id: 'md',
          label: 'Bài làm (.md)',
          content: (
            <Box padding={{ top: 's' }}>
              <div
                className="gpu-scroll-container"
                style={{
                  maxHeight: 520,
                  overflow: 'auto',
                  wordBreak: 'break-word',
                  transform: 'translateZ(0)',
                  willChange: 'scroll-position',
                  padding: '12px',
                  borderRadius: '6px',
                }}
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
              <SpaceBetween size="xs">
                <Box textAlign="right">
                  <Button
                    iconName={copiedXml ? 'status-positive' : 'copy'}
                    variant="inline-icon"
                    ariaLabel="Sao chép toàn bộ mã XML"
                    onClick={handleCopyXml}
                  >
                    {copiedXml ? 'Đã sao chép' : 'Sao chép XML'}
                  </Button>
                </Box>
                <div data-testid="xml-content">
                  <XmlCodeBlock content={xmlContent} />
                </div>
              </SpaceBetween>
            </Box>
          ),
        },
        {
          id: 'architecture',
          label: 'Architecture',
          content: (
            <div data-testid="architecture-tab-content">
              <ArchitectureViewer xmlContent={xmlContent} />
            </div>
          ),
        },
      ]}
    />
  );
});
