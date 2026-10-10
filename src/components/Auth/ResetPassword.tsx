import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconLock, IconArrowLeft, IconCheck } from '@tabler/icons-react';
import LanguageSwitcher from '../Layout/LanguageSwitcher';
import { PeskasLogo } from '../common/PeskasLogo';
import { validateResetToken, resetPassword } from '../../api/auth';

const ResetPassword: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('auth');

  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkToken = async () => {
      if (!token) {
        setTokenValid(false);
        return;
      }

      try {
        const result = await validateResetToken(token);
        setTokenValid(result.valid);
        if (result.valid && result.username) {
          setUsername(result.username);
        }
      } catch {
        setTokenValid(false);
      }
    };

    checkToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (newPassword.length < 8) {
      setError(t('resetPassword.validationErrors.passwordTooShort'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('resetPassword.validationErrors.passwordsDoNotMatch'));
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token!, newPassword, confirmPassword);
      setSuccess(true);

      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/');
      }, 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('errors.resetFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (tokenValid === null) {
    return (
      <div className="page page-center">
        <div className="container container-tight py-4">
          <div className="text-center">
            <div className="spinner-border text-primary" role="status" />
          </div>
        </div>
      </div>
    );
  }

  // Invalid token
  if (tokenValid === false) {
    return (
      <div className="page page-center">
        <div className="container container-tight py-4">
          <div className="text-center mb-4">
            <Link to="/">
              <PeskasLogo style={{ height: 36, width: 'auto' }} />
            </Link>
          </div>
          <div className="card card-md">
            <div className="card-body text-center">
              <div className="text-danger mb-3">
                <IconLock size={48} />
              </div>
              <h2 className="card-title mb-3">{t('resetPassword.invalidToken')}</h2>
              <p className="text-secondary">{t('resetPassword.invalidTokenMessage')}</p>
              <div className="mt-4">
                {/* The login page hosts the reset-request modal; there is no /forgot-password
                    route, so this used to fall through the catch-all to "/" anyway. */}
                <Link to="/" className="btn btn-primary w-100">
                  {t('resetPassword.requestNewLink')}
                </Link>
              </div>
              <div className="text-center text-secondary mt-3">
                <Link to="/" className="link-secondary">
                  <IconArrowLeft size={16} className="me-1" />
                  {t('forgotPassword.backToLogin')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="page page-center">
        <div className="container container-tight py-4">
          <div className="text-center mb-4">
            <Link to="/">
              <PeskasLogo style={{ height: 36, width: 'auto' }} />
            </Link>
          </div>
          <div className="card card-md">
            <div className="card-body text-center">
              <div className="text-success mb-3">
                <IconCheck size={48} />
              </div>
              <h2 className="card-title mb-3">{t('resetPassword.successTitle')}</h2>
              <p className="text-secondary">{t('resetPassword.successMessage')}</p>
              <p className="text-muted mt-2">
                <small>{t('resetPassword.redirecting')}</small>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Reset form
  return (
    <div className="page page-center">
      <div className="container container-tight py-4">
        <div className="text-center mb-4">
          <Link to="/">
            <PeskasLogo style={{ height: 36, width: 'auto' }} />
          </Link>
        </div>
        <div className="card card-md">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h2 className="card-title">{t('resetPassword.title')}</h2>
              <LanguageSwitcher />
            </div>
            <p className="text-secondary mb-4">
              {t('resetPassword.subtitle')} <strong>{username}</strong>
            </p>

            {error && (
              <div className="alert alert-danger alert-dismissible" role="alert">
                <div className="d-flex">
                  <div>{error}</div>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setError(null)}
                    aria-label="Close"
                  />
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label">{t('resetPassword.newPassword')}</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder={t('resetPassword.newPasswordPlaceholder')}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoFocus
                  disabled={loading}
                />
              </div>
              <div className="mb-3">
                <label className="form-label">{t('resetPassword.confirmPassword')}</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder={t('resetPassword.confirmPasswordPlaceholder')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="form-footer">
                <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                  {loading ? t('resetPassword.resetting') : t('resetPassword.resetButton')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
