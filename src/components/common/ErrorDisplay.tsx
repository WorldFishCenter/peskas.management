import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconAlertCircle } from '@tabler/icons-react';

interface ErrorDisplayProps {
  error: string;
  /** Shows a Try again button. */
  onRetry?: () => void;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, onRetry }) => {
  const { t } = useTranslation('common');
  return (
    <div className="alert alert-danger d-flex align-items-center" role="alert">
      <IconAlertCircle className="icon me-2" size={24} stroke={2} />
      <div className="flex-fill">{error}</div>
      {onRetry && (
        <button className="btn btn-outline-danger btn-sm ms-2" onClick={onRetry}>
          {t('buttons.tryAgain')}
        </button>
      )}
    </div>
  );
};

export default ErrorDisplay;
