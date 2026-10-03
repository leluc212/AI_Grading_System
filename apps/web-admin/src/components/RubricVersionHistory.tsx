/**
 * `RubricVersionHistory` — danh sách các phiên bản rubric, CHỈ XEM
 * (phần lịch sử của task 10.1).
 *
 * Requirement 9.2: lưu rubric mới thì tăng `version` và giữ lại các bản
 * trước, không xoá. Requirement 9.3: mỗi lượt chấm ghi lại `rubricVersion`
 * được dùng — nên Admin phải tra được bản cũ đó gồm những tiêu chí gì, nếu
 * không thì con số `rubricVersion` trên lịch sử chấm là vô nghĩa.
 *
 * KHÔNG có đường sửa ở đây là chủ ý: sửa bản cũ sẽ làm sai lệch ý nghĩa của
 * `rubricVersion` đã ghi trong các lượt chấm trước. Muốn đổi rubric thì sửa ở
 * form phía trên và lưu, việc đó tạo ra phiên bản MỚI.
 *
 * _Requirements: 9.2, 9.3, 9.4_
 */
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import Container from '@cloudscape-design/components/container';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import type { Rubric } from '@quick-grading/shared-types';
import { formatDateTime } from '../format';

export interface RubricVersionHistoryProps {
  /** Toàn bộ phiên bản, đã sort tăng dần theo `version` (service layer lo việc đó). */
  versions: Rubric[];
}

export function RubricVersionHistory({ versions }: RubricVersionHistoryProps) {
  if (versions.length === 0) {
    return (
      <div data-testid="rubric-versions">
        <Container header={<Header variant="h2">Phiên bản rubric</Header>}>
          <Box variant="p" color="text-body-secondary">
            Chưa có phiên bản rubric nào được lưu.
          </Box>
        </Container>
      </div>
    );
  }

  // Mới nhất lên đầu khi hiển thị. `slice()` trước `reverse()` để KHÔNG đảo
  // mảng gốc của caller (đảo tại chỗ sẽ sửa ngầm state của trang cha).
  const newestFirst = versions.slice().reverse();

  return (
    <div data-testid="rubric-versions">
      <Container
        header={
          <Header
            variant="h2"
            counter={`(${versions.length})`}
            description="Các phiên bản cũ được giữ lại để tra cứu; chỉ xem, không sửa được."
          >
            Phiên bản rubric
          </Header>
        }
      >
        <SpaceBetween size="s">
          {newestFirst.map((rubric, index) => (
            <ExpandableSection
              key={rubric.rubricId}
              // Mở sẵn bản mới nhất, các bản cũ thu gọn.
              defaultExpanded={index === 0}
              variant="container"
              headerText={`Phiên bản ${rubric.version} — ${formatDateTime(rubric.createdAt)}`}
              headerActions={
                // Requirement 9.4: chỉ bản active được dùng cho lượt chấm mới,
                // nên phải nhìn ra ngay bản nào đang có hiệu lực.
                rubric.isActive ? <Badge color="green">Đang dùng</Badge> : undefined
              }
            >
              <Table
                items={rubric.criteria}
                trackBy="id"
                variant="embedded"
                columnDefinitions={[
                  { id: 'label', header: 'Tiêu chí', cell: (criterion) => criterion.label },
                  {
                    id: 'weight',
                    header: 'Trọng số',
                    // Trọng số là optional -> gạch ngang chứ không để ô trống.
                    cell: (criterion) => criterion.weight ?? '—',
                  },
                ]}
                empty={<Box variant="p">Phiên bản này không có tiêu chí nào.</Box>}
              />
            </ExpandableSection>
          ))}
        </SpaceBetween>
      </Container>
    </div>
  );
}
