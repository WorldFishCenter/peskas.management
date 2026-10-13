import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef
} from '@tanstack/react-table';
import { IconDownload, IconAlertCircle, IconBook, IconInfoCircle } from '@tabler/icons-react';
import { AppliedFilters, DataRow } from '../../types/download';
import { useFetchFieldMetadata } from '../../api/download';
import FieldInfoIcon from './FieldInfoIcon';
import FieldMetadataModal from './FieldMetadataModal';
import { DATASETS, datasetInfo } from './datasets';

/**
 * How the "Filters Applied" line names what the server echoes: the filter form's own labels
 * (`download` keys), for each key and for the values the form offers as choices.
 */
const APPLIED_FILTERS: Record<string, { label: string; values?: Record<string, string> }> = {
  dataset: {
    label: 'filters.dataset',
    values: Object.fromEntries(Object.entries(DATASETS).map(([name, info]) => [name, info.label]))
  },
  status: { label: 'filters.status', values: { validated: 'filters.statusValidated', raw: 'filters.statusRaw' } },
  scope: { label: 'filters.scope', values: { trip_info: 'filters.scopeTripInfo', catch_info: 'filters.scopeCatchInfo' } },
  catch_taxon: { label: 'filters.catchTaxon' },
  country: { label: 'filters.country' },
  survey_id: { label: 'filters.surveys' },
  gaul_2: { label: 'filters.gaulCodes' }
};

interface DataPreviewProps {
  data: DataRow[];
  totalCount: number;
  appliedFilters: AppliedFilters | null;
  isLoading: boolean;
  error: string | null;
  onDownload: () => void;
  isDownloading: boolean;
}

const DataPreview: React.FC<DataPreviewProps> = ({
  data,
  totalCount,
  appliedFilters,
  isLoading,
  error,
  onDownload,
  isDownloading
}) => {
  const { t } = useTranslation('download');

  // Metadata state management
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const {
    metadata,
    isLoading: metadataLoading,
    error: metadataError,
    fetchMetadata
  } = useFetchFieldMetadata(appliedFilters?.scope, appliedFilters?.dataset);

  // The last preview served says which table is on screen
  const level = datasetInfo(appliedFilters?.dataset);

  // Handle field info icon click
  const handleFieldInfoClick = useCallback((fieldName: string) => {
    if (!metadata && !metadataLoading) {
      fetchMetadata(); // Lazy load on first click
    }
    setSelectedField(fieldName);
    setShowMetadataModal(true);
  }, [metadata, metadataLoading, fetchMetadata]);

  // Handle Data Dictionary button click
  const handleDataDictionaryClick = () => {
    if (!metadata && !metadataLoading) {
      fetchMetadata(); // Lazy load on first click
    }
    setSelectedField(null); // No specific field highlighted
    setShowMetadataModal(true);
  };

  // Generate columns dynamically from data with info icons
  const columns = useMemo<ColumnDef<DataRow>[]>(() => {
    if (!data || data.length === 0) return [];

    const firstRow = data[0];
    return Object.keys(firstRow).map(key => ({
      accessorKey: key,
      header: () => (
        <div className="d-flex align-items-center">
          <span>{key.replace(/_/g, ' ').toUpperCase()}</span>
          <FieldInfoIcon fieldName={key} onClick={handleFieldInfoClick} />
        </div>
      ),
      cell: info => {
        const value = info.getValue();
        // Handle null/undefined values
        if (value === null || value === undefined) {
          return <span className="text-muted">—</span>;
        }
        return String(value);
      }
    }));
  }, [data, handleFieldInfoClick]);

  const table = useReactTable({
    data: data || [],
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="card">
        <div className="card-body text-center py-5">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted">{t('preview.loading')}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="alert alert-danger d-flex align-items-center mb-0">
            <IconAlertCircle className="icon me-2" size={24} />
            <div>
              <strong>{t('preview.error')}:</strong> {error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No data state
  if (!data || data.length === 0) {
    return (
      <div className="card">
        <div className="card-body text-center py-5">
          <IconAlertCircle className="icon text-muted mb-3" size={48} stroke={1.5} />
          <h3 className="text-muted">{t('preview.noData')}</h3>
          <p className="text-muted">{t(level.noDataHint)}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <div>
            <h3 className="card-title">{t('preview.title')}</h3>
            <p className="text-muted mb-0">
              {t('preview.showing', { shown: data.length, total: totalCount.toLocaleString() })}
            </p>
          </div>
          <div className="btn-list">
            <button
              className="btn btn-ghost-secondary"
              onClick={handleDataDictionaryClick}
              title={t('preview.viewFieldDescriptions')}
            >
              <IconBook className="icon me-2" size={18} />
              {t('preview.dataDictionary')}
            </button>
            <button
              className="btn btn-success"
              onClick={onDownload}
              disabled={isDownloading}
            >
              <IconDownload className="icon me-2" size={18} />
              {isDownloading ? t('preview.downloading') : t('preview.downloadFull')}
            </button>
          </div>
        </div>

      {/* Applied Filters Summary */}
      {appliedFilters && (
        <div className="card-body border-bottom">
          <div className="text-muted small">
            <strong>{t('preview.filtersApplied')}:</strong>
            {' '}
            {Object.entries(appliedFilters)
              .filter(([, value]) => value !== undefined && value !== null && value !== '')
              .map(([key, value]) => {
                const names = APPLIED_FILTERS[key];
                const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
                const valueLabel = names?.values?.[displayValue];
                return `${names ? t(names.label) : key.replace(/_/g, ' ')}: ${valueLabel ? t(valueLabel) : displayValue}`;
              })
              .join(' | ')}
          </div>
        </div>
      )}

      {/* How to read the table, when the level needs it (monthly: the two mistakes a spreadsheet invites) */}
      {level.previewNote && (
        <div className="card-body border-bottom">
          <div className="alert alert-info mb-0 d-flex align-items-center">
            <IconInfoCircle className="icon me-2 flex-shrink-0" size={18} />
            {t(level.previewNote)}
          </div>
        </div>
      )}

      {/* Warning for large datasets */}
      {totalCount > 500000 && (
        <div className="card-body border-bottom">
          <div className="alert alert-warning mb-0 d-flex align-items-center">
            <IconAlertCircle className="icon me-2" size={18} />
            {t('preview.largeDatasetWarning', { count: totalCount })}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card-body">
        <div className="table-responsive">
          <table className="table table-vcenter card-table table-striped">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th key={header.id}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer with download button (repeated for convenience) */}
      <div className="card-footer d-flex justify-content-between align-items-center">
        <div className="text-muted">
          {t('preview.showing', { shown: data.length, total: totalCount.toLocaleString() })}
        </div>
        <button
          className="btn btn-success"
          onClick={onDownload}
          disabled={isDownloading}
        >
          <IconDownload className="icon me-2" size={18} />
          {isDownloading ? t('preview.downloading') : t('preview.downloadFull')}
        </button>
      </div>
      </div>

      {/* Field Metadata Modal */}
      {showMetadataModal && (
        <FieldMetadataModal
          onClose={() => setShowMetadataModal(false)}
          metadata={metadata}
          isLoading={metadataLoading}
          error={metadataError}
          highlightField={selectedField || undefined}
          dataset={appliedFilters?.dataset}
        />
      )}
    </>
  );
};

export default DataPreview;
