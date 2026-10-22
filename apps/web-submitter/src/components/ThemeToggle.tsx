/**
 * Nút chuyển đổi Dark/Light mode dạng Icon Mặt Trời / Mặt Trăng (Chuẩn Ảnh 2).
 * Sử dụng GPU transition cho hiệu ứng chuyển đổi mượt mà.
 */
import { useTheme } from '../theme/ThemeContext';

export function ThemeToggle() {
  const { mode, toggleMode } = useTheme();
  const isDark = mode === 'dark';

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 38,
        height: 38,
        padding: 0,
        margin: '0 4px',
        borderRadius: '50%',
        border: '1px solid ' + (isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)'),
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
        color: isDark ? '#fbfbfb' : '#16191f',
        cursor: 'pointer',
        transition: 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.18s ease',
        transform: 'translateZ(0)',
        willChange: 'transform',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.08) rotate(15deg)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
      }}
    >
      {isDark ? (
        // Icon Mặt Trăng (Moon SVG)
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        // Icon Mặt Trời (Sun SVG - Chuẩn Ảnh 2)
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      )}
    </button>
  );
}
