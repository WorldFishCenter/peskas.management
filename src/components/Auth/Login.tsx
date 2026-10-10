import React, { useState } from 'react';
import { IconAlertTriangle, IconLock, IconMail, IconLanguage, IconCheck, IconLogin } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { requestPasswordReset } from '../../api/auth';
import { SUPPORT_EMAIL, getSupportMailtoHref } from '../../constants/support';
import { PeskasLogo } from '../common/PeskasLogo';

const Login: React.FC = () => {
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const { i18n } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { login, loading } = useAuth();
  const { changeLanguage, availableLanguages } = useI18n();

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const openResetModal = () => {
    setResetIdentifier('');
    setResetSent(false);
    setResetError(null);
    setShowResetModal(true);
  };
  
  // Find current language configuration
  const currentLang = availableLanguages.find(l => l.code === i18n.language) || availableLanguages[0];

  const handleLogin = async () => {
    // Clear previous errors
    setError(null);

    // Validate inputs
    if (!username.trim() || !password.trim()) {
      setError(t('login.validationError'));
      return;
    }

    // Attempt login
    const result = await login(username.trim(), password);

    // Handle result
    if (!result.success) {
      setError(result.error || 'Invalid username or password');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleLogin();
    }
  };

  const handleForgotPassword = async () => {
    setResetError(null);

    if (!resetIdentifier.trim()) {
      setResetError(t('forgotPassword.validationError'));
      return;
    }

    setResetLoading(true);
    try {
      await requestPasswordReset(resetIdentifier);
      setResetSent(true);
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : t('errors.emailSendFailed'));
    } finally {
      setResetLoading(false);
    }
  };

  const closeResetModal = () => {
    setShowResetModal(false);
    setResetIdentifier('');
    setResetSent(false);
    setResetError(null);
  };

  return (
    <div className="page page-center">
      <div className="container-tight py-4">
        <div className="text-center mb-4">
          <a href="." className="navbar-brand navbar-brand-autodark">
            <PeskasLogo style={{ height: 36, width: 'auto' }} />
          </a>
        </div>
        <div className="card card-md" tabIndex={-1} style={{ outline: 'none' }}>
          <div className="card-body">
            {/* Header with title and language switcher */}
            <div className="d-flex justify-content-between align-items-start mb-3">
              <h2 className="h2 mb-0">{t('login.title')}</h2>
              <div className="dropdown">
                <button
                  className="btn btn-outline-primary d-flex align-items-center"
                  type="button"
                  data-bs-toggle="dropdown"
                  data-bs-auto-close="true"
                  aria-label="Select language"
                  aria-expanded="false"
                  onFocus={(e) => {
                    e.stopPropagation();
                    // Prevent card from getting focus outline
                    const cardBody = e.currentTarget.closest('.card-body') as HTMLElement;
                    if (cardBody) {
                      cardBody.setAttribute('tabindex', '-1');
                      cardBody.style.outline = 'none';
                    }
                  }}
                  onBlur={(e) => {
                    const cardBody = e.currentTarget.closest('.card-body') as HTMLElement;
                    if (cardBody) {
                      cardBody.removeAttribute('tabindex');
                    }
                  }}
                >
                  <IconLanguage className="icon" size={20} stroke={2} />
                  <span className="ms-2">{currentLang.nativeName}</span>
                </button>
                <div className="dropdown-menu dropdown-menu-end">
                  <h6 className="dropdown-header">Select Language</h6>
                  {availableLanguages.map(lang => {
                    const isActive = i18n.language === lang.code;
                    return (
                      <button
                        key={lang.code}
                        className={`dropdown-item d-flex align-items-center ${isActive ? 'active' : ''}`}
                        onClick={() => !isActive && changeLanguage(lang.code)}
                        type="button"
                      >
                        <span>{lang.nativeName}</span>
                        {isActive && (
                          <IconCheck className="icon ms-auto text-primary" size={20} stroke={2} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {error && (
              <div className="alert alert-danger alert-dismissible mb-3" role="alert">
                <div className="d-flex">
                  <div className="me-2">
                    <IconAlertTriangle className="icon alert-icon" size={24} stroke={2} />
                  </div>
                  <div className="flex-fill">
                    <h4 className="alert-title mb-1">{t('login.loginFailed')}</h4>
                    <div className="text-muted">{error}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setError(null)}
                  aria-label="close"
                ></button>
              </div>
            )}

            <div className="mb-3">
              <label className="form-label">{t('login.emailLabel')}</label>
              <div className="input-group input-group-flat">
                <span className="input-group-text">
                  <IconMail className="icon" size={24} stroke={2} />
                </span>
                <input
                  type="email"
                  className="form-control"
                  placeholder={t('login.emailPlaceholder')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label">{t('login.password')}</label>
              <div className="input-group input-group-flat">
                <span className="input-group-text">
                  <IconLock className="icon" size={24} stroke={2} />
                </span>
                <input
                  type="password"
                  className="form-control"
                  placeholder={t('login.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div className="form-footer d-grid gap-2">
              <button
                type="button"
                className="btn btn-outline-primary w-100"
                disabled={loading}
                onClick={handleLogin}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    {t('login.signingIn')}
                  </>
                ) : (
                  <>
                    <IconLogin className="icon me-2" size={20} stroke={2} />
                    {t('login.signIn')}
                  </>
                )}
              </button>
            </div>

            <hr className="hr my-4" />

            <div className="d-grid gap-2">
              <button
                type="button"
                className="btn btn-outline-primary w-100"
                onClick={openResetModal}
                disabled={loading}
              >
                <IconMail className="icon me-2" size={20} stroke={2} />
                {t('login.setOrResetPassword')}
              </button>
            </div>

            <div className="text-center text-muted small mt-4">
              <div className="fw-medium">{t('login.contactSupport')}</div>
              <div className="mt-1">
                <a href={getSupportMailtoHref()} className="link-secondary text-break user-select-all">
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center text-muted mt-3">
          <a href="https://www.worldfishcenter.org/" className="text-muted" target="_blank" rel="noopener noreferrer">
            WorldFish © 2025
          </a>
        </div>

        {showResetModal && (
          <div className="modal modal-blur fade show" style={{ display: 'block' }} tabIndex={-1}>
            <div className="modal-dialog modal-sm modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">{t('forgotPassword.title')}</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={closeResetModal}
                    aria-label="Close"
                  />
                </div>
                <div className="modal-body">
                  {resetSent ? (
                    <div className="text-center py-3">
                      <div className="text-success mb-3">
                        <IconMail size={48} />
                      </div>
                      <h3 className="h3 mb-2">{t('forgotPassword.successTitle')}</h3>
                      <p className="text-secondary mb-0">{t('forgotPassword.successMessage')}</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-secondary mb-3">{t('forgotPassword.subtitle')}</p>

                      {resetError && (
                        <div className="alert alert-danger alert-dismissible" role="alert">
                          <div className="d-flex">
                            <div>{resetError}</div>
                            <button
                              type="button"
                              className="btn-close"
                              onClick={() => setResetError(null)}
                              aria-label="Close"
                            />
                          </div>
                        </div>
                      )}

                      <div className="mb-3">
                        <label className="form-label">{t('forgotPassword.identifier')}</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder={t('forgotPassword.identifierPlaceholder')}
                          value={resetIdentifier}
                          onChange={(e) => setResetIdentifier(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleForgotPassword();
                            }
                          }}
                          autoFocus
                          disabled={resetLoading}
                        />
                      </div>
                    </>
                  )}
                </div>
                <div className="modal-footer">
                  <div className="w-100">
                    {resetSent ? (
                      <div className="row">
                        <div className="col-12">
                          <button
                            type="button"
                            className="btn btn-primary w-100"
                            onClick={closeResetModal}
                          >
                            {t('forgotPassword.backToLogin')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="row g-2">
                        <div className="col">
                          <button
                            type="button"
                            className="btn w-100"
                            onClick={closeResetModal}
                            disabled={resetLoading}
                          >
                            {tCommon('buttons.cancel')}
                          </button>
                        </div>
                        <div className="col">
                          <button
                            type="button"
                            className="btn btn-primary w-100"
                            onClick={handleForgotPassword}
                            disabled={resetLoading}
                          >
                            {resetLoading ? t('forgotPassword.sending') : t('forgotPassword.sendInstructions')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {showResetModal && <div className="modal-backdrop fade show" onClick={closeResetModal} />}
      </div>
    </div>
  );
};

export default Login;
