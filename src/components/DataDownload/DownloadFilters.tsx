import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconSearch,
  IconX,
  IconInfoCircle,
  IconExternalLink,
  IconWorld,
  IconCircleCheck,
  IconAdjustmentsHorizontal,
  IconFish,
  IconClipboardList,
  IconMapPin,
  IconStack2,
  IconFileDescription
} from '@tabler/icons-react';
import { DownloadFilters as FiltersType } from '../../types/download';
import { taxonLabel, taxonInput, toTaxonCode } from '../../utils/taxon';
import { useFetchDownloadMetadata } from '../../api/api';
import { AuthUser } from '../Auth/AuthContext';

interface DownloadFiltersProps {
  filters: FiltersType;
  setFilters: (filters: FiltersType) => void;
  onPreview: () => void;
  onReset: () => void;
  isLoading: boolean;
  user: AuthUser | null;
}

/** Small leading icon for a field label (subtle, for scannability). */
const LabelIcon: React.FC<{ icon: React.ElementType }> = ({ icon: Icon }) => (
  <Icon className="icon icon-inline me-1 text-secondary" size={16} stroke={1.75} />
);

const DownloadFilters: React.FC<DownloadFiltersProps> = ({
  filters,
  setFilters,
  onPreview,
  onReset,
  isLoading,
  user
}) => {
  const { t } = useTranslation('download');
  const isAdmin = user?.role === 'admin';

  // Fetch all metadata in one request (pre-filtered server-side by user permissions).
  // Pass the selected survey so districts cascade to that survey (Country → Survey → District).
  const { metadata, isLoading: loadingMetadata } = useFetchDownloadMetadata(
    isAdmin ? filters.country : undefined,
    filters.survey_id?.[0]
  );
  const { countries, districts, surveys, taxa } = metadata;

  const selectedSurveyId = filters.survey_id?.[0] || '';
  const hasSurveySelected = selectedSurveyId !== '';

  // Regular users are scoped to their assigned surveys (country is derived per-survey
  // server-side); admins must pick a country first.
  const hasAccess = isAdmin ? !!filters.country : surveys.length > 0;

  // ~950 options, and every keystroke in any field re-renders this component. Built once per
  // metadata load instead: identical element references let React skip the whole subtree.
  const taxonOptions = useMemo(
    () => taxa.map((tx) => <option key={tx.code} value={taxonLabel(tx)} />),
    [taxa]
  );

  const taxonCode = toTaxonCode(filters.catch_taxon || '');
  const selectedTaxon = taxa.find((tx) => tx.code === taxonCode);

  // The hint invites typing a species name, but anything that isn't a 3-letter code is rejected
  // by the PeSKAS filter validator with an English-only message. Catch it here instead, in the
  // user's language. Only when we actually have a list to check against — if the species list
  // failed to load, a user who knows the code must still be able to use it.
  const taxonInvalid = taxonCode !== '' && taxa.length > 0 && !selectedTaxon;

  const isPreviewDisabled = isLoading || loadingMetadata || !hasAccess || taxonInvalid;

  // Every caller passes a `<select>`/`<input>` value, so a plain string covers all fields.
  const handleChange = (field: keyof FiltersType, value: string) => {
    if (field === 'country') {
      // Country changed → reset the cascade below it (survey + district).
      setFilters({ ...filters, [field]: value, survey_id: [], gaul_2: '' });
    } else {
      setFilters({ ...filters, [field]: value });
    }
  };

  // Survey is single-select with an explicit "All forms" option so it can be cleared.
  const handleSelectAllSurveys = () => {
    // No specific survey → download all accessible forms. District only applies to a
    // single survey, so clear it.
    setFilters({ ...filters, survey_id: [], gaul_2: '' });
  };

  const handleSurveySelect = (assetId: string) => {
    // New survey → reset district (its options depend on the survey).
    setFilters({ ...filters, survey_id: [assetId], gaul_2: '' });
  };

  return (
    <div>
      {/* Admin Only: Country Selector */}
      {isAdmin && (
        <div className="mb-3">
          <label className="form-label required">
            <LabelIcon icon={IconWorld} />
            {t('filters.country')}
          </label>
          <select
            className="form-select"
            value={filters.country || ''}
            onChange={(e) => handleChange('country', e.target.value)}
            disabled={loadingMetadata}
          >
            <option value="">{t('filters.selectCountry')}</option>
            {countries.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
          <small className="form-hint">{t('filters.countryHint')}</small>
        </div>
      )}

      {/* Status Selector */}
      <div className="mb-3">
        <label className="form-label required">
          <LabelIcon icon={IconCircleCheck} />
          {t('filters.status')}
        </label>
        <select
          className="form-select"
          value={filters.status}
          onChange={(e) => handleChange('status', e.target.value as 'validated' | 'raw')}
        >
          <option value="validated">{t('filters.statusValidated')}</option>
          <option value="raw">{t('filters.statusRaw')}</option>
        </select>
        <small className="form-hint">{t('filters.statusHint')}</small>
      </div>

      {/* Scope Selector */}
      <div className="mb-3">
        <label className="form-label">
          <LabelIcon icon={IconAdjustmentsHorizontal} />
          {t('filters.scope')}
        </label>
        <select
          className="form-select"
          value={filters.scope || ''}
          onChange={(e) => handleChange('scope', e.target.value)}
        >
          <optgroup label={t('filters.scopeGroupDefault')}>
            <option value="">{t('filters.scopeAll')}</option>
          </optgroup>
          <optgroup label={t('filters.scopeGroupFiltered')}>
            <option value="trip_info">{t('filters.scopeTripInfo')}</option>
            <option value="catch_info">{t('filters.scopeCatchInfo')}</option>
          </optgroup>
        </select>
        <small className="form-hint">{t('filters.scopeHint')}</small>
      </div>

      {/* Catch Taxon */}
      <div className="mb-3">
        <label className="form-label">
          <LabelIcon icon={IconFish} />
          {t('filters.catchTaxon')}
        </label>
        <input
          type="text"
          className={`form-control${taxonInvalid ? ' is-invalid' : ''}`}
          list="catch-taxon-options"
          placeholder={t('filters.catchTaxonPlaceholder')}
          value={filters.catch_taxon || ''}
          onChange={(e) => handleChange('catch_taxon', taxonInput(e.target.value))}
        />
        <datalist id="catch-taxon-options">{taxonOptions}</datalist>
        {taxonInvalid ? (
          <div className="invalid-feedback d-block">{t('filters.catchTaxonInvalid')}</div>
        ) : selectedTaxon ? (
          <small className="form-hint text-secondary">
            <strong>{selectedTaxon.code}</strong> — {selectedTaxon.english_name}
            {selectedTaxon.scientific_name && (
              <em className="ms-1">({selectedTaxon.scientific_name})</em>
            )}
            {selectedTaxon.family && (
              <span className="badge bg-blue-lt ms-2">{selectedTaxon.family}</span>
            )}
          </small>
        ) : (
          <small
            className="form-hint"
            dangerouslySetInnerHTML={{ __html: t('filters.catchTaxonHint') }}
          />
        )}
      </div>

      {/* Survey + District cascade (only once the user has access) */}
      {surveys.length > 0 && (
        <>
          <hr className="my-3" />

          {/* Survey (single-select; "All forms" is the distinct default) */}
          <div className="mb-3">
            <label className="form-label">
              <LabelIcon icon={IconClipboardList} />
              {t('filters.surveys')}
            </label>
            <div className="form-selectgroup form-selectgroup-boxes d-flex flex-column gap-2">
              {/* All forms — the default, visually distinct (green icon + badge) */}
              <label className="form-selectgroup-item">
                <input
                  type="radio"
                  name="survey_select"
                  value=""
                  className="form-selectgroup-input"
                  checked={!hasSurveySelected}
                  onChange={handleSelectAllSurveys}
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
                    onChange={() => handleSurveySelect(survey.asset_id)}
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
          </div>

          {/* District (GAUL 2) — only after a specific survey is chosen */}
          {hasSurveySelected && districts.length > 0 && (
            <div className="mb-3">
              <label className="form-label">
                <LabelIcon icon={IconMapPin} />
                {t('filters.gaulCodes')}
              </label>
              <select
                className="form-select"
                value={filters.gaul_2 || ''}
                onChange={(e) => handleChange('gaul_2', e.target.value)}
                disabled={loadingMetadata}
              >
                <option value="">{t('filters.gaulAll')}</option>
                {districts.map(district => (
                  <option key={district.code} value={district.code}>
                    {district.name}
                  </option>
                ))}
              </select>
              <small className="form-hint">
                {t('filters.gaulCodesHint')}{' '}
                <a
                  href={t('filters.gaulHelpLink')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-secondary"
                >
                  <IconExternalLink className="icon icon-inline" size={14} />
                  {t('learnMore', { ns: 'common' })}
                </a>
              </small>
            </div>
          )}
        </>
      )}

      {/* Regular user with no accessible surveys */}
      {!isAdmin && !loadingMetadata && surveys.length === 0 && (
        <div className="alert alert-warning mb-3">
          <IconInfoCircle className="icon me-2" />
          {t('filters.noSurveysAssigned')}
        </div>
      )}

      {/* Admin without a country selected */}
      {isAdmin && !filters.country && (
        <div className="alert alert-info mb-3">
          <IconInfoCircle className="icon me-2" />
          {t('filters.selectCountryFirst')}
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-4">
        <button
          className="btn btn-primary w-100 mb-2"
          onClick={onPreview}
          disabled={isPreviewDisabled}
        >
          <IconSearch className="icon me-2" size={18} />
          {isLoading ? t('filters.loading') : t('filters.previewData')}
        </button>
        <button
          className="btn w-100"
          onClick={onReset}
          disabled={isLoading}
        >
          <IconX className="icon me-2" size={18} />
          {t('filters.resetFilters')}
        </button>
      </div>
    </div>
  );
};

export default DownloadFilters;
