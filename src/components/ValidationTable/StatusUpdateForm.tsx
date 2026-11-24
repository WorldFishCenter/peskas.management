import React from 'react';
import { IconInfoCircle } from '@tabler/icons-react';
import type { TFunction } from 'i18next';
import { StatusUpdateResult } from '../../api/koboToolbox';
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
      </div>

      {updateMessage && (
        <div className={`alert alert-${updateMessage.kind} mt-3`} role="status">
          {updateMessage.text}
        </div>
      )}
    </div>
  );
};

export default StatusUpdateForm; 