/**
 * Nút chuyển đổi ngôn ngữ ENG / VI trên thanh Header.
 */
import { useLanguage } from '../i18n/LanguageContext';

export function LanguageToggle() {
  const { language, toggleLanguage } = useLanguage();

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      aria-label={`Current language: ${language.toUpperCase()}. Click to switch to ${language === 'en' ? 'Vietnamese' : 'English'}`}
      title={language === 'en' ? 'Chuyển sang Tiếng Việt' : 'Switch to English'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: 36,
        padding: '0 12px',
        borderRadius: '18px',
        border: '1px solid var(--lang-border, rgba(0, 0, 0, 0.12))',
        backgroundColor: 'var(--lang-bg, rgba(0, 0, 0, 0.04))',
        color: 'inherit',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 600,
        letterSpacing: '0.5px',
        transition: 'transform 0.15s ease, background-color 0.15s ease',
        transform: 'translateZ(0)',
        willChange: 'transform',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <span style={{ fontSize: '15px' }}>{language === 'en' ? '🇬🇧' : '🇻🇳'}</span>
      <span>{language === 'en' ? 'ENG' : 'VIE'}</span>
    </button>
  );
}
