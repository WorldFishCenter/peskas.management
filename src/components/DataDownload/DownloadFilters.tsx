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
  IconTable
} from '@tabler/icons-react';
import { DownloadFilters as FiltersType } from '../../types/download';
import { taxonLabel, taxonInput, toTaxonCode } from '../../utils/taxon';
import { useFetchDownloadMetadata } from '../../api/download';
import { AuthUser } from '../Auth/AuthContext';
import DatasetSelect from './DatasetSelect';
import { datasetInfo } from './datasets';
import SurveySelect from './SurveySelect';

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

  // Monthly figures per district add up every survey of a country and are validated data only,
  // so status, scope, species and survey do not apply: only country and district.
  const { tripFilters } = datasetInfo(filters.dataset);

  // Fetch all metadata in one request (pre-filtered server-side by user permissions).
  // Pass the selected survey so districts cascade to that survey (Country → Survey → District).
  // The species list only for trips: monthly figures have no species filter.
  const { metadata, isLoading: loadingMetadata, error: metadataError } = useFetchDownloadMetadata(
    filters.country,
    filters.survey_id?.[0],
    tripFilters
  );
  const { countries, districts, surveys, taxa } = metadata;

  // `countries` holds only the user's own. Admins, and users whose forms span several countries,
  // pick one first, so the form and district lists never mix countries. A user with one country
  // has nothing to pick: their forms are scoped server-side.
  const pickCountry = isAdmin || countries.length > 1;

  const selectedSurveyId = filters.survey_id?.[0] || '';
  const hasSurveySelected = selectedSurveyId !== '';

  const hasAccess = pickCountry ? !!filters.country : surveys.length > 0;

  // District (GAUL 2): after a specific survey for trips, straight away for monthly figures.
  // Timor's monthly figures are per municipality: its districts, all but Atauro, match no row,
  // so the whole country is downloaded.
  const showDistricts =
    districts.length > 0 &&
    (tripFilters ? hasSurveySelected : hasAccess && !districts.some((d) => d.country_id === 'timor'));

  // ~950 options, and every keystroke in any field re-renders this component. Built once per
  // metadata load instead: identical element references let React skip the whole subtree.
  const taxonOptions = useMemo(
    () => taxa.map((tx) => <option key={tx.code} value={taxonLabel(tx)} />),
    [taxa]
  );

  // `catch_taxon` is the comma-separated list the Peskas API takes. Leading "ABC," segments are
  // picked codes, shown as chips; whatever follows is the text still being typed. Typed text
  // thus stays part of the filter — one code typed and previewed works as it always did — and may
  // hold commas of its own, as species names do ("Sharks, rays, skates").
  const [, pickedTaxa = '', taxonText = ''] =
    /^((?:[a-z]{3},)*)(.*)$/i.exec(filters.catch_taxon || '') || [];
  const taxonCodes = [...new Set(pickedTaxa.toUpperCase().split(',').filter(Boolean))];
  const taxaByCode = useMemo(() => new Map(taxa.map((tx) => [tx.code, tx])), [taxa]);
  const typedCode = toTaxonCode(taxonText);
  const typedTaxon = taxaByCode.get(typedCode);

  // Only checked against the list when we actually have one — if the species list failed to
  // load, a user who knows the code must still be able to use it.
  const isKnownTaxon = (code: string) =>
    taxa.length > 0 ? taxaByCode.has(code) : /^[A-Z]{3}$/.test(code);

  // The hint invites typing a species name, but anything that isn't a 3-letter code is rejected
  // by the Peskas filter validator with an English-only message. Catch it here instead, in the
  // user's language. A picked code can also stop being known when the country changes under it.
  const taxonInvalid =
    taxonCodes.some((code) => !isKnownTaxon(code)) || (typedCode !== '' && !isKnownTaxon(typedCode));

  const isPreviewDisabled = isLoading || loadingMetadata || !hasAccess || (tripFilters && taxonInvalid);

  // Every caller passes a `<select>`/`<input>` value, so a plain string covers all fields.
  const handleChange = (field: keyof FiltersType, value: string) => {
    if (field === 'country' || field === 'dataset') {
      // Country or data level changed → reset the cascade below it (survey + district). The
      // district list depends on both: one survey's for trips, the country's for monthly figures.
      setFilters({ ...filters, [field]: value, survey_id: [], gaul_2: '' });
    } else {
      setFilters({ ...filters, [field]: value });
    }
  };

  const setTaxon = (codes: string[], text: string) =>
    handleChange('catch_taxon', codes.map((code) => `${code},`).join('') + text);

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
      {/* Data level: decides which of the filters below apply */}
      <div className="mb-3">
        <label className="form-label">
          <LabelIcon icon={IconTable} />
          {t('filters.dataset')}
        </label>
        <DatasetSelect value={filters.dataset} onChange={(value) => handleChange('dataset', value)} />
      </div>

      {/* Country Selector: admins, and users with forms in several countries */}
      {pickCountry && (
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

      {/* Survey + District cascade, once the country is known (Country → Survey → District) */}
      {hasAccess && surveys.length > 0 && (
        <>
          {/* Survey (trip level only; "All forms" is the distinct default) */}
          {tripFilters && (
            <div className="mb-3">
              <label className="form-label">
                <LabelIcon icon={IconClipboardList} />
                {t('filters.surveys')}
              </label>
              <SurveySelect
                surveys={surveys}
                selectedSurveyId={selectedSurveyId}
                onSelectAll={handleSelectAllSurveys}
                onSelect={handleSurveySelect}
              />
            </div>
          )}

          {showDistricts && (
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

      {/* Trip level only: status, scope and species. The species list follows the country too. */}
      {hasAccess && tripFilters && (
        <>
          <hr className="my-3" />
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
              value={taxonText}
              onChange={(e) => {
                // A picked option carries the label separator and becomes a chip at once. Typed text
                // waits for Enter or a comma: a species name can begin with three letters that are
                // themselves a code.
                const value = e.target.value;
                if (value !== taxonInput(value)) setTaxon([...taxonCodes, toTaxonCode(value)], '');
                else setTaxon(taxonCodes, value);
              }}
              onKeyUp={(e) => {
                if (e.key === 'Enter' && typedCode && isKnownTaxon(typedCode)) {
                  setTaxon([...taxonCodes, typedCode], '');
                }
              }}
            />
            <datalist id="catch-taxon-options">{taxonOptions}</datalist>
            {taxonCodes.length > 0 && (
              <div className="d-flex flex-wrap gap-1 mt-2">
                {taxonCodes.map((code) => {
                  const tx = taxaByCode.get(code);
                  return (
                    <span
                      key={code}
                      className={`badge ${isKnownTaxon(code) ? 'bg-blue-lt' : 'bg-red-lt'}`}
                      title={tx && [tx.scientific_name, tx.family].filter(Boolean).join(' · ')}
                    >
                      <strong>{code}</strong>
                      {tx && <span className="ms-1">{tx.english_name || tx.scientific_name}</span>}
                      <button
                        type="button"
                        className="btn-close ms-1"
                        aria-label={t('filters.catchTaxonRemove', { code })}
                        onClick={() => setTaxon(taxonCodes.filter((c) => c !== code), taxonText)}
                      />
                    </span>
                  );
                })}
              </div>
            )}
            {taxonInvalid ? (
              <div className="invalid-feedback d-block">{t('filters.catchTaxonInvalid')}</div>
            ) : typedTaxon ? (
              <small className="form-hint text-secondary">
                <strong>{typedTaxon.code}</strong> — {typedTaxon.english_name}
                {typedTaxon.scientific_name && <em className="ms-1">({typedTaxon.scientific_name})</em>}
                {typedTaxon.family && <span className="badge bg-blue-lt ms-2">{typedTaxon.family}</span>}
              </small>
            ) : (
              <small
                className="form-hint"
                dangerouslySetInnerHTML={{ __html: t('filters.catchTaxonHint') }}
              />
            )}
          </div>
        </>
      )}

      {/* The filter lists failed to load: say so, rather than "no surveys assigned" */}
      {metadataError && (
        <div className="alert alert-danger mb-3">
          <IconInfoCircle className="icon me-2" />
          {metadataError}
        </div>
      )}

      {/* Regular user with no accessible surveys */}
      {!isAdmin && !loadingMetadata && !metadataError && surveys.length === 0 && (
        <div className="alert alert-warning mb-3">
          <IconInfoCircle className="icon me-2" />
          {t('filters.noSurveysAssigned')}
        </div>
      )}

      {/* Country to pick, none selected yet */}
      {pickCountry && !filters.country && (
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
