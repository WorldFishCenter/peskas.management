import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../Auth/AuthContext';
import { IconDownload } from '@tabler/icons-react';
import DownloadFilters from './DownloadFilters';
import DataPreview from './DataPreview';
import { useFetchDownloadPreview, downloadCSV } from '../../api/download';
import { DownloadFilters as FiltersType } from '../../types/download';

const DataDownload: React.FC = () => {
  const { t } = useTranslation('download');
  const { user } = useAuth();

  // Filter state
  const [filters, setFilters] = useState<FiltersType>({
    dataset: 'landings', // Trips; 'district-months' = monthly figures per district
    status: 'validated',
    scope: '', // Empty = download all data (default API behavior)
    survey_id: [] // Empty = all surveys user has access to
  });

  // Preview visibility state
  const [showPreview, setShowPreview] = useState(false);

  // The selection the shown preview was made from. Download sends this one, not the filters as
  // they stand: they may have changed since, and the button sits under the previewed rows.
  const [previewedFilters, setPreviewedFilters] = useState<FiltersType>(filters);

  // Download state
  const [isDownloading, setIsDownloading] = useState(false);

  // Preview data hook
  const { data, totalCount, appliedFilters, isLoading, error, fetchPreview } = useFetchDownloadPreview();

  /**
   * Handle filter changes. Another data level is another table, so the preview of the
   * previous one is dropped rather than left next to a download button for the new one.
   */
  const handleFiltersChange = (next: FiltersType) => {
    if (next.dataset !== filters.dataset) setShowPreview(false);
    setFilters(next);
  };

  /**
   * Handle preview button click
   */
  const handlePreview = async () => {
    setShowPreview(true);
    setPreviewedFilters(filters);
    await fetchPreview(filters);
  };

  /**
   * Handle CSV download button click
   */
  const handleDownload = async () => {
    setIsDownloading(true);

    // Send the previewed selections. The export endpoint re-applies permission
    // scoping server-side from the authenticated user + these same query params
    // (identical to preview), so it always downloads exactly what was previewed.
    const success = await downloadCSV(previewedFilters);
    setIsDownloading(false);

    if (!success) {
      alert(t('errors.downloadFailed'));
    }
  };

  /**
   * Handle reset filters button click
   */
  const handleResetFilters = () => {
    setFilters({
      dataset: filters.dataset, // The data level is not a filter: it stays
      status: 'validated',
      scope: '',
      survey_id: [],
      gaul_2: ''
    });
    setShowPreview(false);
  };

  return (
    <>
      {/* Page Header */}
      <div className="page-header d-print-none">
        <div className="container-xl">
          <div className="row g-2 align-items-center">
            <div className="col">
              <h2 className="page-title">
                <IconDownload className="icon me-2" size={28} stroke={2} />
                {t('title')}
              </h2>
              <div className="text-muted mt-1">{t('description')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Page Body */}
      <div className="page-body">
        <div className="container-xl">
          {!showPreview ? (
            /* Single column layout when no preview */
            <div className="row justify-content-center">
              <div className="col-lg-6">
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">{t('filters.title')}</h3>
                  </div>
                  <div className="card-body">
                    <DownloadFilters
                      filters={filters}
                      setFilters={handleFiltersChange}
                      onPreview={handlePreview}
                      onReset={handleResetFilters}
                      isLoading={isLoading}
                      user={user}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Two column layout when preview is shown */
            <div className="row g-3">
              <div className="col-lg-4">
                <div className="card sticky-top" style={{ top: '1rem' }}>
                  <div className="card-header">
                    <h3 className="card-title">{t('filters.title')}</h3>
                  </div>
                  <div className="card-body">
                    <DownloadFilters
                      filters={filters}
                      setFilters={handleFiltersChange}
                      onPreview={handlePreview}
                      onReset={handleResetFilters}
                      isLoading={isLoading}
                      user={user}
                    />
                  </div>
                </div>
              </div>
              <div className="col-lg-8">
                <DataPreview
                  data={data}
                  totalCount={totalCount}
                  appliedFilters={appliedFilters}
                  isLoading={isLoading}
                  error={error}
                  onDownload={handleDownload}
                  isDownloading={isDownloading}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default DataDownload;
