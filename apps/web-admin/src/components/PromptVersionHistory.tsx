/**
 * `PromptVersionHistory` — danh sách các phiên bản cấu hình chấm điểm & System Prompt (chỉ xem).
 */
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import type { GradingConfig, GradingMode } from '@quick-grading/shared-types';
import { formatDateTime } from '../format';

export interface PromptVersionHistoryProps {
  readonly versions: readonly GradingConfig[];
}

function modeLabel(mode: GradingMode): {
  label: string;
  color: 'blue' | 'green' | 'severity-medium';
} {
  switch (mode) {
    case 'PROMPT':
      return { label: 'Chấm bằng Prompt', color: 'green' };
    case 'HYBRID':
      return { label: 'Kết hợp Rubric & Prompt', color: 'blue' };
    case 'RUBRIC':
    default:
      return { label: 'Chấm bằng Rubric', color: 'severity-medium' };
  }
}

export function PromptVersionHistory({ versions }: PromptVersionHistoryProps) {
  if (versions.length === 0) {
    return (
      <Container header={<Header variant="h2">Lịch sử phiên bản cấu hình</Header>}>
        <Box variant="p" color="text-body-secondary">
          Chưa có phiên bản cấu hình nào được lưu.
        </Box>
      </Container>
    );
  }

  const newestFirst = versions.slice().reverse();

  return (
    <Container
      header={
        <Header
          variant="h2"
          counter={`(${versions.length})`}
          description="Các phiên bản cấu hình trước đây được lưu trữ để tra cứu lịch sử chấm điểm."
        >
          Lịch sử phiên bản cấu hình
        </Header>
      }
    >
      <SpaceBetween size="s">
        {newestFirst.map((cfg, index) => {
          const modeInfo = modeLabel(cfg.mode);
          return (
            <ExpandableSection
              key={cfg.version}
              defaultExpanded={index === 0}
              variant="container"
              headerText={`Phiên bản ${cfg.version} — ${modeInfo.label} — ${formatDateTime(cfg.createdAt)}`}
              headerActions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Badge color={modeInfo.color}>{cfg.mode}</Badge>
                  {cfg.isActive && <Badge color="green">Đang dùng</Badge>}
                </SpaceBetween>
              }
            >
              <SpaceBetween size="m">
                <ColumnLayout columns={3} variant="text-grid">
                  <div>
                    <Box variant="awsui-key-label">Chế độ chấm</Box>
                    <Box variant="p">{modeInfo.label}</Box>
                  </div>
                  <div>
                    <Box variant="awsui-key-label">Mô hình AI</Box>
                    <Box variant="p">{cfg.model ?? 'Mặc định (gpt-6.1-sol)'}</Box>
                  </div>
                  <div>
                    <Box variant="awsui-key-label">Người tạo</Box>
                    <Box variant="p">{cfg.createdBy ?? 'admin'}</Box>
                  </div>
                </ColumnLayout>

                <div>
                  <Box variant="awsui-key-label">Nội dung System Prompt</Box>
                  {cfg.systemPrompt ? (
                    <Box
                      padding="s"
                      margin={{ top: 'xs' }}
                      variant="code"
                      color="text-body-secondary"
                      fontSize="body-s"
                      display="block"
                    >
                      <pre
                        style={{
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          margin: 0,
                          fontFamily: 'inherit',
                          maxHeight: '300px',
                          overflowY: 'auto',
                        }}
                      >
                        {cfg.systemPrompt}
                      </pre>
                    </Box>
                  ) : (
                    <Box variant="p" color="text-body-secondary">
                      (Không áp dụng System Prompt riêng — AI chấm theo tiêu chuẩn Rubric)
                    </Box>
                  )}
                </div>
              </SpaceBetween>
            </ExpandableSection>
          );
        })}
      </SpaceBetween>
    </Container>
  );
}
