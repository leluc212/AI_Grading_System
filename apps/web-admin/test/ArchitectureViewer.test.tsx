import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArchitectureViewer } from '../src/components/ArchitectureViewer';
import { FileViewer } from '../src/components/FileViewer';

const SAMPLE_DRAWIO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net">
  <diagram id="diag1" name="Architecture">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="2" value="API Gateway" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="120" y="80" width="120" height="60" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

describe('ArchitectureViewer Component', () => {
  it('hiển thị cảnh báo thân thiện khi nội dung XML không phải sơ đồ draw.io', () => {
    render(<ArchitectureViewer xmlContent="<note><to>Admin</to><message>Hello</message></note>" />);

    expect(screen.getByText('Không tìm thấy cấu trúc sơ đồ draw.io')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tải file XML về máy' })).toBeDefined();
  });

  it('hiển thị cảnh báo khi xmlContent là chuỗi rỗng', () => {
    render(<ArchitectureViewer xmlContent="" />);

    expect(screen.getByText('Không tìm thấy cấu trúc sơ đồ draw.io')).toBeDefined();
  });

  it('dựng iframe viewer với sandbox an toàn khi XML là sơ đồ draw.io hợp lệ', () => {
    render(<ArchitectureViewer xmlContent={SAMPLE_DRAWIO_XML} />);

    // Kiểm tra các nút công cụ
    expect(screen.getByText('Draw.io Viewer')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tải file XML' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Mở trên Draw.io' })).toBeDefined();

    // Kiểm tra iframe an toàn
    const iframe = screen.getByTitle('Sơ đồ kiến trúc Draw.io') as HTMLIFrameElement;
    expect(iframe).toBeDefined();
    expect(iframe.src).toContain('https://viewer.diagrams.net/');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups');
  });

  it('mở draw.io trong tab mới khi bấm nút Mở trên Draw.io', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<ArchitectureViewer xmlContent={SAMPLE_DRAWIO_XML} />);

    await user.click(screen.getByRole('button', { name: 'Mở trên Draw.io' }));

    expect(openSpy).toHaveBeenCalledWith(
      'https://app.diagrams.net/',
      '_blank',
      'noopener,noreferrer',
    );
    openSpy.mockRestore();
  });
});

describe('FileViewer với tab Architecture', () => {
  it('có đủ 3 tab theo đúng thứ tự: Bài làm (.md), Bài làm (.xml), Architecture', async () => {
    render(<FileViewer markdownContent="# Báo cáo kiến trúc" xmlContent={SAMPLE_DRAWIO_XML} />);

    expect(screen.getByRole('tab', { name: 'Bài làm (.md)' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Bài làm (.xml)' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Architecture' })).toBeDefined();
  });

  it('khi bấm tab Architecture thì chuyển sang xem sơ đồ kiến trúc', async () => {
    const user = userEvent.setup();
    render(<FileViewer markdownContent="# Báo cáo kiến trúc" xmlContent={SAMPLE_DRAWIO_XML} />);

    // Mặc định tab Markdown đang mở
    expect(screen.getByTestId('markdown-content')).toBeDefined();

    // Bấm sang tab Architecture
    await user.click(screen.getByRole('tab', { name: 'Architecture' }));

    expect(screen.getByTestId('architecture-tab-content')).toBeDefined();
    expect(screen.getByTitle('Sơ đồ kiến trúc Draw.io')).toBeDefined();
  });
});
