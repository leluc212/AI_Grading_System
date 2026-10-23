import { memo, useEffect, useRef, useState, useMemo } from 'react';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Alert from '@cloudscape-design/components/alert';
import Spinner from '@cloudscape-design/components/spinner';
import Badge from '@cloudscape-design/components/badge';

export interface ArchitectureViewerProps {
  /** Nội dung thô của file XML bài làm do sinh viên nộp */
  readonly xmlContent: string;
}

const VIEWER_ORIGIN = 'https://viewer.diagrams.net';
const VIEWER_URL = 'https://viewer.diagrams.net/?embed=1&proto=json&spin=1';

/**
 * Kiểm tra nhanh xem chuỗi XML có chứa cấu trúc của bản vẽ draw.io hay không.
 * Phòng ngừa lỗi và cảnh báo sớm nếu sinh viên nộp nhầm file XML không phải sơ đồ.
 */
function isDrawioXml(xml: string): boolean {
  if (!xml || typeof xml !== 'string') return false;
  const trimmed = xml.trim();
  if (trimmed.length === 0) return false;
  return (
    trimmed.includes('<mxfile') ||
    trimmed.includes('<mxGraphModel') ||
    trimmed.includes('<mxCell') ||
    trimmed.includes('&lt;mxfile') ||
    trimmed.includes('&lt;mxGraphModel')
  );
}

export const ArchitectureViewer = memo(function ArchitectureViewer({
  xmlContent,
}: ArchitectureViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isValidDiagram = useMemo(() => isDrawioXml(xmlContent), [xmlContent]);

  useEffect(() => {
    if (!isValidDiagram) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    // Xử lý giao tiếp bảo mật với Diagrams.net viewer thông qua postMessage
    const handleMessage = (event: MessageEvent) => {
      // 1. Kiểm tra xuất xứ nghiêm ngặt (Chỉ nhận từ viewer.diagrams.net)
      if (event.origin !== VIEWER_ORIGIN && event.origin !== 'https://embed.diagrams.net') {
        return;
      }

      try {
        let msg: { event?: string; [key: string]: unknown } = {};
        if (typeof event.data === 'string') {
          try {
            msg = JSON.parse(event.data);
          } catch {
            return;
          }
        } else if (typeof event.data === 'object' && event.data !== null) {
          msg = event.data;
        }

        // Khi viewer phát sự kiện 'init', gửi nội dung XML vào để render
        if (msg.event === 'init') {
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              JSON.stringify({
                action: 'load',
                xml: xmlContent,
                autosave: 0,
              }),
              VIEWER_ORIGIN,
            );
          }
        }

        // Khi viewer tải và render xong
        if (msg.event === 'load') {
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('Lỗi xử lý thông điệp từ diagrams viewer:', err);
      }
    };

    window.addEventListener('message', handleMessage);

    // Timeout phòng ngừa trường hợp mạng chập chờn không tải được iframe
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 12000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(timer);
    };
  }, [xmlContent, isValidDiagram]);

  // Tải file XML về máy nếu admin cần lưu trữ
  const handleDownloadXml = () => {
    const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'architecture.xml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Mở sơ đồ trên tab mới của draw.io để xem phóng to toàn màn hình
  const handleOpenDrawioNewTab = () => {
    // Mở trực tiếp app.diagrams.net
    window.open('https://app.diagrams.net/', '_blank', 'noopener,noreferrer');
  };

  if (!isValidDiagram) {
    return (
      <Box padding={{ vertical: 's' }}>
        <Alert
          type="info"
          header="Không tìm thấy cấu trúc sơ đồ draw.io"
          action={
            <Button onClick={handleDownloadXml} iconName="download">
              Tải file XML về máy
            </Button>
          }
        >
          File XML bài làm này không chứa các thẻ định dạng sơ đồ của draw.io (như &lt;mxfile&gt;
          hoặc &lt;mxGraphModel&gt;). Bạn có thể chuyển qua tab <strong>Bài làm (.xml)</strong> để
          đọc mã nguồn XML thô.
        </Alert>
      </Box>
    );
  }

  return (
    <Box padding={{ top: 's' }}>
      <SpaceBetween size="s">
        {/* Thanh công cụ điều khiển phía trên khung xem */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            background: 'var(--color-background-container-content, #ffffff)',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid var(--color-border-divider-default, #e9ebed)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Badge color="blue">Draw.io Viewer</Badge>
            <span style={{ fontSize: '13px', color: 'var(--color-text-body-secondary, #5f6b7a)' }}>
              💡 Cuộn chuột để phóng to/thu nhỏ • Giữ chuột để kéo rê bản vẽ
            </span>
          </div>
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="normal" iconName="download" onClick={handleDownloadXml}>
              Tải file XML
            </Button>
            <Button
              variant="normal"
              iconName="external"
              iconAlign="right"
              onClick={handleOpenDrawioNewTab}
            >
              Mở trên Draw.io
            </Button>
          </SpaceBetween>
        </div>

        {loadError && (
          <Alert type="warning" dismissible onDismiss={() => setLoadError(null)}>
            {loadError}
          </Alert>
        )}

        {/* Khung iframe hiển thị sơ đồ (được cô lập hoàn toàn bằng Sandbox) */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '640px',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid var(--color-border-divider-default, #e9ebed)',
            background: '#ffffff',
          }}
          data-testid="architecture-viewer-container"
        >
          {isLoading && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '12px',
                background: 'rgba(255, 255, 255, 0.85)',
                zIndex: 10,
              }}
            >
              <Spinner size="large" />
              <span style={{ fontSize: '14px', color: '#5f6b7a', fontWeight: 500 }}>
                Đang dựng hình vẽ sơ đồ kiến trúc...
              </span>
            </div>
          )}

          <iframe
            ref={iframeRef}
            src={VIEWER_URL}
            title="Sơ đồ kiến trúc Draw.io"
            sandbox="allow-scripts allow-same-origin allow-popups"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
            }}
          />
        </div>
      </SpaceBetween>
    </Box>
  );
});
