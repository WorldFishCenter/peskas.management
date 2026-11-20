import React, { useState, useEffect } from 'react';
import { IconInfoCircle, IconAlertCircle, IconCheck, IconExternalLink } from '@tabler/icons-react';
import type { TFunction } from 'i18next';
import { generateEditUrl, EditUrlError, StatusUpdateResult } from '../../api/koboToolbox';
import { statusLabelKey } from '../../types/validation';
import { useTranslation } from 'react-i18next';
// The shared declaration, not a local near-copy: the two had already drifted on `validated_at`.
import { Submission } from '../../types/validation';

/** The result of Update Status, shown under the form. */
export interface StatusMessage {
  kind: 'success' | 'warning' | 'danger';
  text: string;
}

const FAILURE_KEYS = { forbidden: 'form.forbidden', notFound: 'form.notFound', failed: 'form.saveFailed' } as const;

/** What to tell the reviewer after Update Status. */
export const statusMessage = (result: StatusUpdateResult, t: TFunction<'validation'>): StatusMessage => {
  if (result.outcome !== 'saved' && result.outcome !== 'conflict') {
    return { kind: 'danger', text: t(FAILURE_KEYS[result.outcome]) };
  }
  const status = t(statusLabelKey(result.current.validation_status ?? undefined), { ns: 'common' });
  if (result.outcome === 'conflict') {
    return { kind: 'danger', text: t('form.conflict', { status, by: result.current.validated_by ?? '—' }) };
  }
  return result.kobo === 'failed'
    ? { kind: 'warning', text: t('form.savedKoboFailed', { status }) }
    : { kind: 'success', text: t('form.saved', { status }) };
};

interface StatusUpdateFormProps {
  selectedSubmission: Submission;
  status: string;
  setStatus: (status: string) => void;
  onUpdate: () => void;
  isUpdating: boolean;
  updateMessage: StatusMessage | null;
  hideSubmissionInfo?: boolean;
}

const StatusUpdateForm: React.FC<StatusUpdateFormProps> = ({
  selectedSubmission,
  status,
  setStatus,
  onUpdate,
  isUpdating,
  updateMessage,
  hideSubmissionInfo = false
}) => {
  const { t } = useTranslation('validation');
  const [editUrl, setEditUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [urlGeneratedTime, setUrlGeneratedTime] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset URL state when selected submission changes - with cleanup
  useEffect(() => {
    let mounted = true;
    
    if (mounted) {
      setEditUrl(null);
      setUrlGeneratedTime(null);
      setIsLoadingUrl(false);
      setErrorMessage(null);
    }
    
    return () => { mounted = false; };
  }, [selectedSubmission?.submission_id]); // Add optional chaining

  // Function to generate the URL when explicitly requested - with proper safeguards
  const handleGenerateEditUrl = async () => {
    if (!selectedSubmission?.submission_id) return;

    // Prevent multiple clicks
    if (isLoadingUrl) return;

    setIsLoadingUrl(true);
    setErrorMessage(null); // Clear any previous errors
    
    try {
      const url = await generateEditUrl(selectedSubmission.submission_id, selectedSubmission.asset_id);
      
      // Set the URL regardless of loading state (remove the problematic check)
      setEditUrl(url);
      setUrlGeneratedTime(new Date());
      
      // Open URL in new tab with safeguards
      if (url) {
        const newWindow = window.open(url, '_blank');
        // Handle if popup was blocked
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
          console.warn('Popup blocked or could not open window');
          // Show a message to the user
          alert(t('form.popupBlocked'));
        }
      }
    } catch (error) {
      console.error("Failed to get edit URL:", error);
      setEditUrl(null);
      // Set user-friendly error message
      setErrorMessage(t(error instanceof EditUrlError ? error.key : 'form.editUrlError'));
    } finally {
      setIsLoadingUrl(false);
    }
  };

  // Calculate remaining time for URL validity
  const getRemainingTime = () => {
    if (!urlGeneratedTime) return 0;
    
    const now = new Date();
    const elapsedMs = now.getTime() - urlGeneratedTime.getTime();
    const remainingSeconds = Math.max(0, 30 - Math.floor(elapsedMs / 1000));
    return remainingSeconds;
  };

  const remainingSeconds = getRemainingTime();
  const urlValid = remainingSeconds > 0;

  return (
    <div>
      {!hideSubmissionInfo && (
        <div className="alert alert-info py-2 mb-3 border-start border-primary border-4">
          <div className="d-flex align-items-center gap-2">
            <IconInfoCircle className="icon" size={14} stroke={2} />
            <div className="small">
              {t('form.selectedSubmission')}{selectedSubmission.submission_id}
            </div>
          </div>
        </div>
      )}

      <div className="row g-2">
        <div className="col-auto">
          <div className="mb-0">
            <label className="form-label">{t('form.assignStatus')}</label>
            <select
              className="form-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="" disabled>{t('form.chooseStatus')}</option>
              <option value="validation_status_approved">{t('status.approved', { ns: 'common' })}</option>
              <option value="validation_status_not_approved">{t('status.notApproved', { ns: 'common' })}</option>
            </select>
          </div>
        </div>
        <div className="col-auto d-flex align-items-end">
          <button
            className="btn btn-primary"
            onClick={onUpdate}
            disabled={isUpdating || !status}
          >
            {isUpdating ? t('form.updating') : t('form.updateStatus')}
          </button>
        </div>
        <div className="col-auto d-flex align-items-end">
          <button
            onClick={handleGenerateEditUrl}
            className="btn btn-secondary"
            disabled={isLoadingUrl}
          >
            {isLoadingUrl ? t('form.generatingLink') : t('form.goToSubmission')}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="alert alert-danger alert-dismissible mt-3" role="alert">
          <div className="d-flex align-items-center">
            <IconAlertCircle className="icon me-2" size={20} stroke={2} />
            <div className="flex-fill">{errorMessage}</div>
            <button
              type="button"
              className="btn-close"
              onClick={() => setErrorMessage(null)}
              aria-label={t('modal.close')}
            ></button>
          </div>
        </div>
      )}

      {urlGeneratedTime && urlValid && (
        <div className="alert alert-success alert-dismissible mt-3" role="alert">
          <div className="d-flex align-items-center">
            <IconCheck className="icon alert-icon me-2" size={20} stroke={2} />
            <div className="flex-fill">
              <strong>{t('form.editLinkOpened')}</strong>
              {editUrl && (
                <div className="mt-2">
                  <a
                    href={editUrl}
                    target="_blank"
                    className="btn btn-sm btn-success"
                    rel="noreferrer"
                  >
                    <IconExternalLink className="icon me-1" size={16} stroke={2} />
                    {t('buttons.openAgain', { ns: 'common' })}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {updateMessage && (
        <div className={`alert alert-${updateMessage.kind} mt-3`} role="status">
          {updateMessage.text}
        </div>
      )}
    </div>
  );
};

export default StatusUpdateForm; 