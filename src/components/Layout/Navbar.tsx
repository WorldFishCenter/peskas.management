import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IconCheck, IconChartBar, IconDownload, IconSchool, IconDatabase, IconClipboardCheck, IconUsers, IconHelp, IconShield, IconMessage } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../Auth/AuthContext';
import LanguageSwitcher from './LanguageSwitcher';
import FeedbackModal from './FeedbackModal';
import { PeskasLogo, PeskasMark } from '../common/PeskasLogo';
import { FEEDBACK_FORM_EMBED_URL, getFeedbackFormUrl } from '../../constants/support';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const { t } = useTranslation('navigation');
  const [showFeedback, setShowFeedback] = useState(false);

  return (
    <>
    <header className="navbar navbar-expand-md navbar-light d-print-none">
      <div className="container-xl">
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbar-menu" aria-controls="navbar-menu" aria-expanded="false" aria-label="Toggle navigation">
          <span className="navbar-toggler-icon"></span>
        </button>
        <h1 className="navbar-brand navbar-brand-autodark d-none-navbar-horizontal pe-0 pe-md-3">
          {/* The full logo, or the mark alone on a phone; with the product name it reads "Peskas Management Platform".
              24px and 14px, a step below the brand kit's 28px and 16px: at 28px the Swahili and Portuguese menus
              wrap their labels at 1280-1440px wide. */}
          <Link to="/" className="d-flex align-items-center gap-2">
            <PeskasLogo className="peskas-brand-logo" style={{ height: 24, width: 'auto' }} />
            <PeskasMark className="peskas-brand-mark" style={{ height: 24, width: 'auto' }} />
            <span className="peskas-brand-name fs-4 fw-medium text-muted">{t('brand')}</span>
          </Link>
        </h1>
        <div className="navbar-nav flex-row order-md-last">
          <LanguageSwitcher />
          <div className="nav-item dropdown ms-2">
            <a href="#" className="nav-link d-flex lh-1 text-reset p-0" data-bs-toggle="dropdown" aria-label="Open user menu">
              <div className="d-none d-xl-block ps-2">
                <div>{user?.username}</div>
                <div className="mt-1 small text-muted">{user?.role === 'admin' ? t('role.admin') : t('role.user')}</div>
              </div>
            </a>
            <div className="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
              {FEEDBACK_FORM_EMBED_URL && (
                <button className="dropdown-item" onClick={() => setShowFeedback(true)}>
                  <IconMessage className="icon dropdown-item-icon" size={24} stroke={2} />
                  {t('feedback.menuItem')}
                </button>
              )}
              <button className="dropdown-item" onClick={logout}>{t('logout')}</button>
            </div>
          </div>
        </div>
        <div className="collapse navbar-collapse" id="navbar-menu">
          <div className="d-flex flex-column flex-md-row flex-fill align-items-stretch align-items-md-center">
            <ul className="navbar-nav">
              <li className={`nav-item dropdown ${['/', '/enumerators'].includes(location.pathname) ? 'active' : ''}`}>
                <a
                  href="#"
                  className="nav-link dropdown-toggle"
                  data-bs-toggle="dropdown"
                  data-bs-auto-close="true"
                  role="button"
                  aria-expanded="false"
                >
                  <span className="nav-link-icon d-md-none d-lg-inline-block me-1">
                    <IconClipboardCheck className="icon" size={24} stroke={2} />
                  </span>
                  <span className="nav-link-title">{t('validation')}</span>
                </a>
                <div className="dropdown-menu">
                  <Link
                    to="/"
                    className={`dropdown-item ${location.pathname === '/' ? 'active' : ''}`}
                  >
                    <IconCheck className="icon dropdown-item-icon" size={24} stroke={2} />
                    {t('submissions')}
                  </Link>
                  <Link
                    to="/enumerators"
                    className={`dropdown-item ${location.pathname === '/enumerators' ? 'active' : ''}`}
                  >
                    <IconChartBar className="icon dropdown-item-icon" size={24} stroke={2} />
                    {t('enumeratorPerformance')}
                  </Link>
                </div>
              </li>
              <li className={`nav-item dropdown ${['/data-download', '/data-explorer'].includes(location.pathname) ? 'active' : ''}`}>
                <a
                  href="#"
                  className="nav-link dropdown-toggle"
                  data-bs-toggle="dropdown"
                  data-bs-auto-close="true"
                  role="button"
                  aria-expanded="false"
                >
                  <span className="nav-link-icon d-md-none d-lg-inline-block me-1">
                    <IconDatabase className="icon" size={24} stroke={2} />
                  </span>
                  <span className="nav-link-title">{t('dataTools')}</span>
                </a>
                <div className="dropdown-menu">
                  <Link
                    to="/data-download"
                    className={`dropdown-item ${location.pathname === '/data-download' ? 'active' : ''}`}
                  >
                    <IconDownload className="icon dropdown-item-icon" size={24} stroke={2} />
                    {t('dataDownload')}
                  </Link>
                  <Link
                    to="/data-explorer"
                    className={`dropdown-item ${location.pathname === '/data-explorer' ? 'active' : ''}`}
                  >
                    <IconSchool className="icon dropdown-item-icon" size={24} stroke={2} />
                    {t('dataExplorer')}
                  </Link>
                </div>
              </li>
              <li className={`nav-item ${location.pathname === '/how-it-works' ? 'active' : ''}`}>
                <Link to="/how-it-works" className="nav-link">
                  <span className="nav-link-icon d-md-none d-lg-inline-block me-1">
                    <IconHelp className="icon" size={24} stroke={2} />
                  </span>
                  <span className="nav-link-title">{t('howItWorks')}</span>
                </Link>
              </li>
              {/* Admin-only links */}
              {user?.role === 'admin' && (
                <>
                  <li className={`nav-item ${location.pathname === '/admin/users' ? 'active' : ''}`}>
                    <Link to="/admin/users" className="nav-link">
                      <span className="nav-link-icon d-md-none d-lg-inline-block me-1">
                        <IconUsers className="icon" size={24} stroke={2} />
                      </span>
                      <span className="nav-link-title">{t('users')}</span>
                    </Link>
                  </li>
                  <li className={`nav-item ${location.pathname === '/admin/audit-logs' ? 'active' : ''}`}>
                    <Link to="/admin/audit-logs" className="nav-link">
                      <span className="nav-link-icon d-md-none d-lg-inline-block me-1">
                        <IconShield className="icon" size={24} stroke={2} />
                      </span>
                      <span className="nav-link-title">{t('auditLog')}</span>
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>
    </header>
    {showFeedback && (
      <FeedbackModal
        src={getFeedbackFormUrl(user?.name, user?.country)}
        onClose={() => setShowFeedback(false)}
      />
    )}
    </>
  );
};

export default Navbar; 