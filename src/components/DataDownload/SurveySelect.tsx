import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconMapPin, IconStack2, IconFileDescription } from '@tabler/icons-react';
import { Survey } from '../../types/download';

interface SurveySelectProps {
  surveys: Survey[];
  /** asset_id of the chosen survey, '' for "All forms" */
  selectedSurveyId: string;
  onSelectAll: () => void;
  onSelect: (assetId: string) => void;
}

/** Survey picker of the trip-level download: single-select, with "All forms" as the default. */
const SurveySelect: React.FC<SurveySelectProps> = ({ surveys, selectedSurveyId, onSelectAll, onSelect }) => {
  const { t } = useTranslation('download');
  const hasSurveySelected = selectedSurveyId !== '';

  return (
    <>
      <div className="form-selectgroup form-selectgroup-boxes d-flex flex-column gap-2">
        {/* All forms — the default, visually distinct (green icon + badge) */}
        <label className="form-selectgroup-item">
          <input
            type="radio"
            name="survey_select"
            value=""
            className="form-selectgroup-input"
            checked={!hasSurveySelected}
            onChange={onSelectAll}
          />
          <span className="form-selectgroup-label d-flex align-items-center p-3">
            <span className="me-3">
              <span className="form-selectgroup-check"></span>
            </span>
            <IconStack2 className="icon me-3 text-green" size={24} stroke={1.5} />
            <span className="flex-fill">
              <span className="d-flex align-items-center gap-2">
                <strong>{t('filters.surveysAll')}</strong>
                <span className="badge bg-green-lt">{t('filters.defaultBadge')}</span>
              </span>
              <span className="d-block text-secondary small">
                {t('filters.surveysAllDesc')}
              </span>
            </span>
          </span>
        </label>

        {/* Specific surveys */}
        {surveys.map(survey => (
          <label key={survey.asset_id} className="form-selectgroup-item">
            <input
              type="radio"
              name="survey_select"
              value={survey.asset_id}
              className="form-selectgroup-input"
              checked={selectedSurveyId === survey.asset_id}
              onChange={() => onSelect(survey.asset_id)}
            />
            <span className="form-selectgroup-label d-flex align-items-center p-3">
              <span className="me-3">
                <span className="form-selectgroup-check"></span>
              </span>
              <IconFileDescription className="icon me-3 text-secondary" size={24} stroke={1.5} />
              <span className="flex-fill">
                <span className="d-block">{survey.name}</span>
                {typeof survey.country_id === 'string' && survey.country_id && (
                  <span className="d-block text-secondary small text-capitalize">
                    {survey.country_id}
                  </span>
                )}
              </span>
            </span>
          </label>
        ))}
      </div>

      {/* Signpost: districts unlock once a specific survey is chosen */}
      {!hasSurveySelected && (
        <small className="form-hint d-flex align-items-center mt-2">
          <IconMapPin className="icon icon-inline me-1" size={14} />
          {t('filters.surveyAreaHint')}
        </small>
      )}
    </>
  );
};

export default SurveySelect;
