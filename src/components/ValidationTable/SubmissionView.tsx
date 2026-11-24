import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { IconFileText } from '@tabler/icons-react';
import { useSubmissionView } from '../../api/api';
import { AVAILABLE_LANGUAGES } from '../../i18n/I18nContext';
import { catchDetail, splitAlertCodes } from '../../utils/alertCodes';
import { ALERT_FIELDS, AlertFields, SubmissionAlerts, fieldCodes, findItem, isCatchLine, lengthRowLine } from '../../utils/submissionHighlights';
import AlertBadge from './AlertBadge';
import ErrorDisplay from '../common/ErrorDisplay';
import type { AlertCatch, Submission, SubmissionItem, Translated } from '../../types/validation';

interface SubmissionViewProps {
  submission: Submission;
  describeAlert: (code: string) => string | undefined;
}

/** The form language to show: the reader's, else English, else the form's first. */
const languageIndex = (languages: (string | null)[], code: string): number => {
  for (const lang of [code, 'en']) {
    const name = AVAILABLE_LANGUAGES.find(l => l.code === lang)?.name.toLowerCase();
    const i = languages.findIndex(l => l !== null && (l.includes(`(${lang})`) || (!!name && l.toLowerCase().includes(name))));
    if (i >= 0) return i;
  }
  return 0;
};

const pick = (texts: Translated, i: number): string => texts[i] ?? texts.find(Boolean) ?? '';

// Trip details first, then the catch lines, whatever order the form asks them in.
const tripFirst = (items: SubmissionItem[]): SubmissionItem[] => [
  ...items.filter(item => item.type !== 'repeat'),
  ...items.filter(item => item.type === 'repeat')
];

const SubmissionViewModal: React.FC<SubmissionViewProps & { onClose: () => void }> = ({ submission, describeAlert, onClose }) => {
  const { t, i18n } = useTranslation('validation');
  const { submission_id: submissionId, asset_id: assetId } = submission;
  const { view, errorKey, retry } = useSubmissionView(submissionId, assetId);

  const codes = splitAlertCodes(submission.alert_flag ?? '');
  const catches: AlertCatch[] = submission.alert_catches ?? [];
  const alertFields: AlertFields | undefined = assetId ? ALERT_FIELDS[assetId] : undefined;
  const catchRepeat = view && alertFields ? findItem(view.items, alertFields.catchRepeat) : undefined;
  const catchLines = catchRepeat?.type === 'repeat' ? catchRepeat.entries : [];
  const alerts: SubmissionAlerts = { codes, catches, lines: catchLines.length };
  const lang = view ? languageIndex(view.languages, i18n.language.slice(0, 2)) : 0;

  const renderItems = (items: SubmissionItem[], line: number | null): React.ReactNode[] =>
    items.map((item, index) => {
      const key = `${item.name}-${index}`;
      if (item.type === 'group') {
        const children = renderItems(item.items, line).filter(Boolean);
        return children.length > 0 && (
          <div key={key} className="mt-3">
            <h4 className="subheader mb-1">{pick(item.label, lang)}</h4>
            {children}
          </div>
        );
      }
      if (item.type === 'repeat') {
        const isCatch = item.name === alertFields?.catchRepeat;
        const isLengths = item.name === alertFields?.lengths?.repeat;
        return (
          <div key={key} className="mt-3">
            {item.entries.map((entry, i) => {
              const entryLine = isCatch ? i + 1 : isLengths && alertFields ? lengthRowLine(alertFields, entry, catchLines) : line;
              const located = isCatch ? catches.filter(c => c.catch_number === entryLine) : [];
              return (
                <div key={i} className={`card card-sm mb-2 ${located.length ? 'border-red' : ''}`}>
                  <div className="card-header py-2 d-flex flex-wrap align-items-center gap-2">
                    <strong className={located.length ? 'text-red' : ''}>
                      {isCatch ? t('table.catchNumber', { number: i + 1 }) : `${pick(item.label, lang)} ${i + 1}`}
                    </strong>
                    {located.map(c => (
                      <span key={c.code} className="small text-secondary">
                        <AlertBadge alertFlag={c.code} describeAlert={describeAlert} /> {c.value}
                      </span>
                    ))}
                  </div>
                  <div className="card-body py-1">{renderItems(entry, entryLine)}</div>
                </div>
              );
            })}
          </div>
        );
      }
      const answered = item.value.length > 0;
      const marked = alertFields ? fieldCodes(alertFields, alerts, item.name, item.value[0] ?? undefined, line) : [];
      if (!answered && marked.length === 0) return null;
      return (
        <div key={key} className="row g-0 py-1 border-bottom">
          <div className={`col-sm-5 pe-2 ${marked.length ? 'border-start border-3 border-red ps-1 text-red' : 'ps-2 text-secondary'}`}>
            {pick(item.label, lang)}
          </div>
          <div className="col-sm-7 pe-1 d-flex align-items-start gap-2">
            <span className={`text-break flex-fill ${answered ? 'fw-medium' : 'text-secondary fst-italic'}`}>
              {answered ? pick(item.value, lang) : t('submissionView.notAnswered')}
            </span>
            {marked.length > 0 && <AlertBadge alertFlag={marked.join(', ')} describeAlert={describeAlert} />}
          </div>
        </div>
      );
    });

  const body = () => {
    if (errorKey) return <ErrorDisplay error={t(errorKey)} onRetry={retry} />;
    if (!view) {
      return (
        <div className="d-flex align-items-center gap-2 py-4 justify-content-center text-secondary">
          <div className="spinner-border spinner-border-sm" role="status" />
          {t('submissionView.loading')}
        </div>
      );
    }
    return (
      <>
        <div className={`alert ${codes.length ? 'alert-danger' : 'alert-success'} mb-3`}>
          {codes.length === 0 ? t('submissionView.noAlerts') : (
            <div>
              <strong>{t('submissionView.alerts')}</strong>
              {codes.map(code => (
                <div key={code} className="mt-1">
                  <span className="badge bg-red-lt text-red me-1">{code}</span>
                  {describeAlert(code) ?? t('table.noAlertDescription')}
                  {catches.filter(c => c.code === code).map(c => (
                    <div key={c.catch_number} className="small ms-4">
                      {t('table.catchNumber', { number: c.catch_number })}
                      {catchDetail(c) && `: ${catchDetail(c)}`}
                      {!isCatchLine(alerts, c) && <span className="text-secondary"> ({t('submissionView.notALine')})</span>}
                    </div>
                  ))}
                </div>
              ))}
              <div className="small text-secondary mt-2">{t(alertFields ? 'submissionView.marksHint' : 'submissionView.noMap')}</div>
            </div>
          )}
        </div>
        {renderItems(tripFirst(view.items), null)}
      </>
    );
  };

  return (
    <>
      <div className="modal-backdrop fade show" onClick={onClose} />
      <div className="modal modal-blur show d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="submissionViewTitle">
        <div className="modal-dialog modal-lg modal-dialog-scrollable" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="submissionViewTitle">
                <IconFileText className="icon me-2" size={20} stroke={2} />
                {t('submissionView.title', { id: submissionId })}
              </h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label={t('modal.close')} />
            </div>
            <div className="modal-body">{body()}</div>
            <div className="modal-footer">
              <span className="small text-secondary me-auto">{t('submissionView.readOnly')}</span>
              <button type="button" className="btn" onClick={onClose}>{t('modal.close')}</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

/** "View full submission": the button, and the panel it opens over the page. */
const SubmissionView: React.FC<SubmissionViewProps> = props => {
  const { t } = useTranslation('validation');
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-outline-primary w-100 mt-3" onClick={() => setOpen(true)}>
        <IconFileText className="icon me-2" size={18} stroke={2} />
        {t('submissionView.button')}
      </button>
      {/* On the page, not inside the sidebar that holds the button. */}
      {open && createPortal(<SubmissionViewModal {...props} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
};

export default SubmissionView;
