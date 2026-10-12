import React, { useState, useMemo } from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';
import { getCountryFlag, getCountryName } from '../../utils/countryMetadata';
import { useTranslation } from 'react-i18next';
import { describeAlertCode, displayAlertCode } from '../../utils/alertCodes';
import type { SurveyAlertCodes } from '../../hooks/useContextualAlertCodes';

interface AlertGuideModalProps {
  onClose: () => void;
  surveyAlertCodes: SurveyAlertCodes[];
}

const AlertGuideModal: React.FC<AlertGuideModalProps> = ({ onClose, surveyAlertCodes }) => {
  const { t, i18n } = useTranslation('validation');
  const [selectedSurvey, setSelectedSurvey] = useState<string>(
    surveyAlertCodes.length > 0 ? surveyAlertCodes[0].assetId : ''
  );

  // Get the currently selected survey's alert codes
  const currentSurvey = useMemo(() => {
    return surveyAlertCodes.find(s => s.assetId === selectedSurvey) || surveyAlertCodes[0];
  }, [selectedSurvey, surveyAlertCodes]);

  if (!currentSurvey) {
    return (
      <div className="modal modal-blur show d-block" tabIndex={-1} role="dialog">
        <div className="modal-dialog modal-dialog-centered" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{t('modal.alertCodesTitle')}</h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label={t('modal.close')}></button>
            </div>
            <div className="modal-body">
              <div className="alert alert-warning">
                {t('modal.noAlertCodes')}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal modal-blur show d-block" tabIndex={-1} role="dialog">
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <IconAlertTriangle className="icon text-yellow me-2" size={24} stroke={2} />
              {t('modal.alertCodesTitle')}
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
              aria-label={t('modal.close')}
            ></button>
          </div>
          <div className="modal-body">
            {/* Info Banner */}
            <div className="alert alert-info d-flex align-items-center mb-3" role="alert">
              <div>
                <svg xmlns="http://www.w3.org/2000/svg" className="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                  <circle cx="12" cy="12" r="9"></circle>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  <polyline points="11 12 12 12 12 16 13 16"></polyline>
                </svg>
              </div>
              <div>
                {t('modal.alertCodesInfo')}
              </div>
            </div>

            {/* Survey Selector - only show if multiple surveys */}
            {surveyAlertCodes.length > 1 && (
              <div className="mb-3">
                <label className="form-label">{t('filters.survey')}</label>
                <select
                  className="form-select"
                  value={selectedSurvey}
                  onChange={(e) => setSelectedSurvey(e.target.value)}
                >
                  {surveyAlertCodes.map((survey) => {
                    const flag = getCountryFlag(survey.surveyCountry);
                    const country = getCountryName(survey.surveyCountry);
                    return (
                      <option key={survey.assetId} value={survey.assetId}>
                        {flag} {survey.surveyName} {country && `(${country})`}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Single Survey Header - only show if single survey */}
            {surveyAlertCodes.length === 1 && (
              <div className="mb-3">
                <div className="text-muted small">
                  Survey: <span className="fw-bold text-dark">
                    {getCountryFlag(currentSurvey.surveyCountry)} {currentSurvey.surveyName}
                  </span>
                </div>
              </div>
            )}

            {/* Alert Codes Table */}
            <div className="table-responsive">
              <table className="table table-vcenter card-table">
                <thead>
                  <tr>
                    <th className="w-1">{t('table.codeHeader')}</th>
                    <th>{t('table.descriptionHeader')}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(currentSurvey.alertCodes).map(code => {
                    const translatedDescription =
                      describeAlertCode(i18n, currentSurvey.assetId, code, currentSurvey.alertCodes);

                    return (
                      <tr key={code}>
                        <td>
                          <span className="badge bg-red-lt text-red fs-5">
                            {displayAlertCode(code)}
                          </span>
                        </td>
                        <td className="text-wrap">
                          {translatedDescription}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn"
              onClick={onClose}
            >
              {t('modal.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlertGuideModal; 