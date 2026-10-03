/**
 * Trang thông báo nộp bài thành công (task 5.6).
 *
 * Requirement 2.9c: sau khi API trả OK, hiển thị thông báo "Đã nộp bài thành
 * công" ngay trên trang web.
 *
 * Nguyên tắc quan trọng — **chỉ hiển thị thành công khi có bằng chứng**. Dữ
 * liệu hiển thị đến từ `location.state` do form đặt sau khi `createTeamAndSubmit`
 * trả về. Nếu vào thẳng `/submit-success` (gõ URL, bookmark, hoặc F5 làm mất
 * state) thì KHÔNG có gì chứng minh bài đã được ghi nhận, nên trang này
 * chuyển hướng về đầu luồng thay vì nói "thành công" một cách vô căn cứ
 * (Requirement 2.10 — không hiển thị thành công khi chưa chắc đã thành công).
 *
 * _Requirements: 2.9, 2.10_
 */
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { isSubmitSuccessState } from '../submitSuccessState';

export function SubmitSuccessPage() {
  const location = useLocation();
  const navigate = useNavigate();

  if (!isSubmitSuccessState(location.state)) {
    return <Navigate to="/" replace />;
  }

  const { teamName, assignmentName, fileNames, resubmitted } = location.state;

  return (
    <Container header={<Header variant="h2">Nộp bài thành công</Header>}>
      <SpaceBetween size="l">
        {/*
          Phân biệt nộp lần đầu với nộp lại: ở lần nộp lại, bản nộp trước đã bị
          thay thế (file cũ vẫn được hệ thống lưu nhưng không còn là bản dùng để
          chấm), nên nói đúng việc vừa xảy ra để nhóm không nhầm là đã nộp 2 bài.
        */}
        <Alert
          type="success"
          header={resubmitted ? 'Đã nộp lại bài thành công' : 'Đã nộp bài thành công'}
        >
          {resubmitted ? (
            <>
              Bản nộp mới của nhóm &ldquo;{teamName}&rdquo; đã được ghi nhận cho đợt chấm &ldquo;
              {assignmentName}&rdquo; và thay thế bản nộp trước đó.
            </>
          ) : (
            <>
              Bài của nhóm &ldquo;{teamName}&rdquo; đã được ghi nhận cho đợt chấm &ldquo;
              {assignmentName}&rdquo;.
            </>
          )}
        </Alert>

        <SpaceBetween size="xs">
          <Box variant="awsui-key-label">File đã ghi nhận</Box>
          {/*
            Liệt kê tên file do SERVER trả về (không phải tên file local người
            dùng chọn) để nhóm tự đối chiếu đúng những gì hệ thống đã nhận.
          */}
          <ul>
            {fileNames.map((fileName) => (
              <li key={fileName}>{fileName}</li>
            ))}
          </ul>
        </SpaceBetween>

        <Box variant="p" color="text-body-secondary">
          Hệ thống không gửi email xác nhận. Vui lòng lưu lại thông tin trên trang này nếu cần.
        </Box>

        <Button
          onClick={() => {
            navigate('/');
          }}
        >
          Về trang danh sách đợt chấm
        </Button>
      </SpaceBetween>
    </Container>
  );
}
