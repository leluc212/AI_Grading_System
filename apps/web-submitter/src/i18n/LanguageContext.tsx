/**
 * Hệ thống đa ngôn ngữ (i18n): Mặc định Tiếng Anh (ENG), hỗ trợ chuyển đổi sang Tiếng Việt (VN).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Language = 'en' | 'vi';

export const TRANSLATIONS = {
  en: {
    // Brand & Top Navigation
    brandTitle: 'AWS First Cloud AI Journey',
    brandSubtitle: 'Student Assignment Submission Portal',
    portalBadge: 'Home',
    navHome: 'Assignments',
    navAbout: 'About',
    navMoments: 'Moments',
    navFaq: 'FAQ',
    langToggleLabel: 'Tiếng Việt',

    // Hero Section
    heroHeadlinePart1: 'Assignment',
    heroHeadlinePart2: 'Submission Portal',
    heroTagline:
      'Submit your team project and architecture files for AWS First Cloud AI Journey. Select an open assignment below to get started.',

    btnJoinCommunity: 'Join Community',
    btnStudyGroup: 'AWS Study Group',

    // Assignments Page (Eliminating border stacking)
    selectAssignmentTitle: 'Select an assignment to submit',
    selectAssignmentDesc:
      'Select an open assignment to submit your project files — Click "Submit" to proceed to the submission form',
    statusOpen: 'Accepting Submissions',
    statusClosed: 'Closed',
    createdDate: 'Created on',
    fileReqHeader: 'Required Files',
    fileReqContent: '1 .md file (max 2MB) and 1 .xml file (max 5MB)',
    btnSubmit: 'Submit',
    loadingAssignments: 'Loading available assignments...',
    emptyAssignmentsTitle: 'No assignments are currently accepting submissions',
    emptyAssignmentsDesc: 'Please contact your instructor if you believe this is an error.',
    searchPlaceholder: 'Search assignments by name...',
    loadErrorTitle: 'Failed to load assignments',
    btnRetry: 'Try again',

    // Submit Form Page
    submitFormTitle: 'Submit',
    submitFormSubtitle: 'Assignment',
    teamNameLabel: 'Team Name',
    teamNameDesc:
      'Team name must match exactly with the team name on the AWS FCAJ portal. Each team can only submit "once only".',
    teamNamePlaceholder: '',
    membersLabel: 'Team Members',
    membersDesc: 'Each team requires at least 1 member.',
    studentNameLabel: 'Student Name',
    studentNamePlaceholder: '',
    emailLabel: 'Email',
    emailPlaceholder: '',
    studentCodeLabel: 'Student ID',
    studentCodePlaceholder: '',
    btnAddMember: '+ Add Student',
    btnRemoveMember: 'Remove',
    emptyMembers: 'No members added yet. Click "+ Add Student" to add.',
    mdFileLabel: 'Assignment file (.md)',
    mdFileDesc: 'Markdown file containing your team presentation.',
    xmlFileLabel: 'Assignment file (.xml)',
    xmlFileDesc: 'XML file accompanying your team submission.',
    btnCancel: 'Cancel',
    btnSubmitForm: 'Submit',
    checkingAssignment: 'Checking assignment status...',
    assignmentClosedHeader: 'Assignment Closed',
    assignmentClosedError:
      'This assignment is closed and no longer accepting submissions. Please contact your instructor if your team needs late submission.',
    btnChooseOther: 'Choose another assignment',
    fileUploadButton: 'Choose file',
    errorLabel: 'Error',
    warningLabel: 'Warning',
    limitShowFewer: 'Show fewer',
    limitShowMore: 'Show more',

    // Success Page (Digital Receipt)
    successTitle: 'Submission Successful',
    successAlertHeader: 'Submitted successfully!',
    resubmittedAlertHeader: 'Resubmitted successfully!',
    successAlertBody: 'Your team submission has been recorded on the system.',
    resubmittedAlertBody:
      'Your new submission has been recorded and replaces the previous version.',
    receiptHeader: 'Recorded Files',
    labelTeamName: 'Team Name',
    labelAssignment: 'Assignment',
    labelFiles: 'Recorded Files',
    labelSubmissionType: 'Submission Status',
    submissionInitial: 'Initial Submission',
    submissionResubmit: 'Resubmission (Updated Version)',
    successNote:
      'The system does not send confirmation emails. Please save the information on this page if needed.',
    btnBackHome: 'Back to assignment list',

    // Login & Anti-Spam Auth
    loginTitle: 'Sign In to Submit',
    loginSubtitle: 'Authenticate with your Google account to submit your project and prevent spam.',
    loginWithGoogle: 'Continue with Google',
    loginDemoBtn: 'Quick Demo Login (Test Mode)',
    loginWhyTitle: 'Why do you need to sign in?',
    loginWhyDesc:
      'To prevent automated spam and ensure every team submission is authenticated and attributed to verified students.',
    loginBadgeCognito: 'Secured by AWS Cognito',
    loginBadgePkce: 'OAuth 2.0 PKCE Protected',
    loginBadgeAntiSpam: 'Anti-Spam Shield Active',
    navLogin: 'Sign In',
    navLogout: 'Sign Out',
    verifiedGoogleBadge: 'Verified via Google',
    loginRequiredAlert: 'Please sign in with Google to access the assignment submission form.',
  },
  vi: {
    // Brand & Top Navigation
    brandSubtitle: 'Cổng Nộp Bài Sinh Viên',
    portalBadge: 'Trang Chủ',
    navHome: 'Đợt nộp bài',
    navAbout: 'Giới thiệu',
    navMoments: 'Khoảnh khắc',
    navFaq: 'Hỏi đáp',
    langToggleLabel: 'English',

    // Hero Section
    heroHeadlinePart1: 'Cổng Nộp Bài',
    heroHeadlinePart2: 'Dự Án Nhóm',

    heroTagline:
      'Nộp file dự án và kiến trúc cho AWS First Cloud AI Journey.    Chọn đợt phù hợp đang mở bên dưới để bắt đầu.',

    btnJoinCommunity: 'Tham Gia Cộng Đồng',
    btnStudyGroup: 'Nhóm Học Tập AWS',

    // Assignments Page
    selectAssignmentTitle: 'Chọn bài tập cần nộp',
    selectAssignmentDesc:
      'Chọn đợt chấm mà nhóm bạn cần nộp bài — Nhấn "Nộp bài" để chuyển sang bước điền form',

    statusOpen: 'Đang mở nộp bài',
    statusClosed: 'Đã đóng',
    createdDate: 'Ngày tạo',
    fileReqHeader: 'Tệp yêu cầu',
    fileReqContent: '1 file .md (tối đa 2MB) và 1 file .xml (tối đa 5MB)',
    btnSubmit: 'Nộp bài',
    loadingAssignments: 'Đang tải danh sách đợt chấm...',
    emptyAssignmentsTitle: 'Hiện không có đợt chấm nào đang mở',
    emptyAssignmentsDesc: 'Vui lòng liên hệ giảng viên nếu bạn cho rằng đây là sự nhầm lẫn.',
    searchPlaceholder: 'Tìm kiếm tên đợt chấm bài...',
    loadErrorTitle: 'Không tải được danh sách đợt chấm',
    btnRetry: 'Thử lại',

    // Submit Form Page
    submitFormTitle: 'Nộp bài',
    submitFormSubtitle: 'Đợt chấm',
    teamNameLabel: 'Tên nhóm',
    teamNameDesc:
      'Tên nhóm phải chính xác với tên nhóm trên portal AWS FCAJ. Mỗi nhóm chỉ được nộp "một lần duy nhất"',
    teamNamePlaceholder: '',
    membersLabel: 'Thành viên nhóm',
    membersDesc: 'Mỗi nhóm cần ít nhất 1 thành viên.',
    studentNameLabel: 'Tên sinh viên',
    studentNamePlaceholder: '',
    emailLabel: 'Email',
    emailPlaceholder: '',
    studentCodeLabel: 'MSSV',
    studentCodePlaceholder: '',
    btnAddMember: '+ Thêm sinh viên',
    btnRemoveMember: 'Xoá',
    emptyMembers: 'Chưa có thành viên nào. Bấm "+ Thêm sinh viên" để thêm.',
    mdFileLabel: 'File bài làm (.md)',
    mdFileDesc: 'File markdown chứa phần trình bày của nhóm.',
    xmlFileLabel: 'File bài làm (.xml)',
    xmlFileDesc: 'File XML kèm theo bài làm của nhóm.',
    btnCancel: 'Huỷ',
    btnSubmitForm: 'Nộp bài',
    checkingAssignment: 'Đang kiểm tra đợt chấm...',
    assignmentClosedHeader: 'Đợt chấm đã đóng',
    assignmentClosedError:
      'Đợt chấm đã đóng, không thể nộp bài. Vui lòng liên hệ giảng viên nếu nhóm bạn cần nộp muộn.',
    btnChooseOther: 'Chọn đợt chấm khác',
    fileUploadButton: 'Chọn file',
    errorLabel: 'Lỗi',
    warningLabel: 'Cảnh báo',
    limitShowFewer: 'Hiện ít hơn',
    limitShowMore: 'Hiện thêm',

    // Success Page
    successTitle: 'Nộp bài thành công',
    successAlertHeader: 'Đã nộp bài thành công',
    resubmittedAlertHeader: 'Đã nộp lại bài thành công',
    successAlertBody: 'Bài của nhóm bạn đã được ghi nhận trên hệ thống.',
    resubmittedAlertBody: 'Bản nộp mới của nhóm đã được ghi nhận và thay thế bản nộp trước đó.',
    receiptHeader: 'File đã ghi nhận',
    labelTeamName: 'Tên nhóm',
    labelAssignment: 'Đợt chấm',
    labelFiles: 'File đã ghi nhận',
    labelSubmissionType: 'Trạng thái nộp',
    submissionInitial: 'Nộp lần đầu',
    submissionResubmit: 'Nộp lại (Bản cập nhật)',
    successNote:
      'Hệ thống không gửi email xác nhận. Vui lòng lưu lại thông tin trên trang này nếu cần.',
    btnBackHome: 'Về trang danh sách đợt chấm',

    // Login & Anti-Spam Auth
    loginTitle: 'Đăng nhập để nộp bài',
    loginSubtitle: 'Xác thực tài khoản Google để bắt đầu nộp bài và phòng chống spam.',
    loginWithGoogle: 'Tiếp tục với Google',
    loginDemoBtn: 'Đăng nhập thử nghiệm (Chế độ Test)',
    loginWhyTitle: 'Tại sao cần đăng nhập?',
    loginWhyDesc:
      'Hệ thống yêu cầu xác thực qua Google nhằm ngăn chặn spam bài nộp, bảo vệ quyền tác giả và đảm bảo tính minh bạch cho nhóm bạn.',
    loginBadgeCognito: 'Bảo mật bởi AWS Cognito',
    loginBadgePkce: 'Bảo vệ OAuth 2.0 PKCE',
    loginBadgeAntiSpam: 'Kích hoạt lá chắn chống Spam',
    navLogin: 'Đăng nhập',
    navLogout: 'Đăng xuất',
    verifiedGoogleBadge: 'Đã xác thực qua Google',
    loginRequiredAlert: 'Vui lòng đăng nhập bằng Google để vào biểu mẫu nộp bài.',
  },
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS.en;

interface LanguageContextValue {
  language: Language;
  toggleLanguage: () => void;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const STORAGE_KEY = 'fcaj-portal-lang-v2';

const LanguageContext = createContext<LanguageContextValue>({
  language: 'vi',
  toggleLanguage: () => {},
  setLanguage: () => {},
  t: (key: TranslationKey) => TRANSLATIONS.vi[key] || key,
});

export function LanguageProvider({ children }: { readonly children: ReactNode }) {
  // Mặc định ngôn ngữ Tiếng Việt (VI), hỗ trợ lưu trữ và chuyển đổi linh hoạt
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'vi') {
        return saved;
      }
    } catch {
      // Fallback
    }
    return 'vi';
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Fallback
    }
  }, [language]);

  const toggleLanguage = useCallback(() => {
    setLanguage((curr) => (curr === 'en' ? 'vi' : 'en'));
  }, []);

  const handleSetLanguage = useCallback((lang: Language) => {
    setLanguage(lang);
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      return TRANSLATIONS[language]?.[key] ?? TRANSLATIONS.vi[key] ?? (key as string);
    },
    [language],
  );

  const contextValue = useMemo(
    () => ({
      language,
      toggleLanguage,
      setLanguage: handleSetLanguage,
      t,
    }),
    [language, toggleLanguage, handleSetLanguage, t],
  );

  return <LanguageContext.Provider value={contextValue}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
