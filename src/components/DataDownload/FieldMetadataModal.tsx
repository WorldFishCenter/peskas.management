/**
 * FieldMetadataModal Component
 *
 * Modal dialog that displays comprehensive field documentation from Peskas API metadata.
 * Shows field descriptions, data types, units, examples, and other metadata.
 *
 * Features:
 * - Search/filter fields by name or description
 * - Highlight specific field when opened from column header
 * - Type badges for visual categorization
 * - Expandable details for examples, ranges, ontology
 * - Loading and error states
 * - i18n support (download.metadata namespace)
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IconBook, IconSearch } from '@tabler/icons-react';
import { FieldMetadata } from '../../types/download';

interface FieldMetadataModalProps {
  /** Function to close the modal */
  onClose: () => void;

  /** Field metadata from API */
  metadata: FieldMetadata | null;

  /** Loading state */
  isLoading: boolean;

  /** Error message */
  error: string | null;

  /** Optional field to highlight */
  highlightField?: string;
}

const FieldMetadataModal: React.FC<FieldMetadataModalProps> = ({
  onClose,
  metadata,
  isLoading,
  error,
  highlightField
}) => {
  const { t } = useTranslation('download');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter fields based on highlightField (single field mode) or search query (all fields mode)
  const filteredFields = useMemo(() => {
    if (!metadata?.fields) return [];

    const entries = Object.entries(metadata.fields);

    // Single field mode: show only the highlighted field
    if (highlightField) {
      return entries.filter(([fieldName]) => fieldName === highlightField);
    }

    // All fields mode: apply search filter
    if (!searchQuery.trim()) {
      return entries;
    }

    const query = searchQuery.toLowerCase();
    return entries.filter(([fieldName, fieldDesc]) => {
      return (
        fieldName.toLowerCase().includes(query) ||
        fieldDesc.description?.toLowerCase().includes(query) ||
        false
      );
    });
  }, [metadata, searchQuery, highlightField]);

  // Format field name for display (replace underscores with spaces, title case)
  const formatFieldName = (fieldName: string): string => {
    return fieldName
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="modal modal-blur show d-block" tabIndex={-1} role="dialog">
      <div className={`modal-dialog ${highlightField ? 'modal-dialog-centered' : 'modal-lg modal-dialog-centered modal-dialog-scrollable'}`} role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <IconBook className="icon text-blue me-2" size={24} stroke={2} />
              {highlightField ? t('metadata.fieldInfo') : t('metadata.title')}
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
              aria-label="Close"
            ></button>
          </div>

          <div className="modal-body">
            {/* Subtitle - only show in all fields mode */}
            {!highlightField && (
              <p className="text-muted mb-3">
                {t('metadata.subtitle')}
              </p>
            )}

            {/* Single field header */}
            {highlightField && (
              <div className="mb-3">
                <h6 className="text-muted">
                  Field: <span className="text-dark fw-bold">{formatFieldName(highlightField)}</span>
                </h6>
                <code className="text-muted small">{highlightField}</code>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="text-center py-5">
                <div className="spinner-border text-blue" role="status"></div>
                <p className="text-muted mt-2">{t('metadata.loading')}</p>
              </div>
            )}

            {/* Error State */}
            {error && !isLoading && (
              <div className="alert alert-danger d-flex align-items-center" role="alert">
                <div>
                  <svg xmlns="http://www.w3.org/2000/svg" className="icon alert-icon" width="24" height="24" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                    <circle cx="12" cy="12" r="9"></circle>
                    <line x1="12" y1="8" x2="12" y2="8.01"></line>
                    <polyline points="11 12 12 12 12 16 13 16"></polyline>
                  </svg>
                </div>
                <div>{error}</div>
              </div>
            )}

            {/* No Metadata State */}
            {!isLoading && !error && (!metadata || Object.keys(metadata.fields || {}).length === 0) && (
              <div className="text-center py-5">
                <IconBook className="icon text-muted mb-3" size={48} stroke={1} />
                <p className="text-muted">{t('metadata.noMetadata')}</p>
              </div>
            )}

            {/* Search and Fields Display */}
            {!isLoading && !error && metadata && Object.keys(metadata.fields).length > 0 && (
              <>
                {/* Search Input - only show in all fields mode */}
                {!highlightField && (
                  <div className="mb-3">
                    <div className="input-icon">
                      <span className="input-icon-addon">
                        <IconSearch size={18} />
                      </span>
                      <input
                        type="text"
                        className="form-control"
                        placeholder={t('metadata.searchPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* Fields Table */}
                {filteredFields.length > 0 ? (
                  <div className="table-responsive">
                    <table className="table table-vcenter card-table">
                      <thead>
                        <tr>
                          <th>{t('metadata.fieldName')}</th>
                          <th>{t('metadata.description')}</th>
                          <th className="w-1">{t('metadata.unit')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFields.map(([fieldName, fieldDesc]) => {
                          return (
                            <tr key={fieldName}>
                              <td>
                                <strong>{formatFieldName(fieldName)}</strong>
                                {/* Only show raw field name in all fields mode */}
                                {!highlightField && (
                                  <div className="small text-muted">{fieldName}</div>
                                )}
                              </td>
                              <td className="text-wrap">
                                {fieldDesc.description || '—'}
                                {fieldDesc.examples && fieldDesc.examples.length > 0 && (
                                  <div className="small text-muted mt-1">
                                    <strong>{t('metadata.example')}:</strong>{' '}
                                    {fieldDesc.examples.map((ex, idx) => (
                                      <code key={idx} className="me-1">{String(ex)}</code>
                                    ))}
                                  </div>
                                )}
                                {fieldDesc.possible_values && fieldDesc.possible_values.length > 0 && (
                                  <div className="small text-muted mt-1">
                                    <strong>{t('metadata.values')}:</strong> {fieldDesc.possible_values.join(', ')}
                                  </div>
                                )}
                                {fieldDesc.value_range && (
                                  <div className="small text-muted mt-1">
                                    <strong>{t('metadata.range')}:</strong>{' '}
                                    {fieldDesc.value_range[0] !== null && `Min: ${fieldDesc.value_range[0]}`}
                                    {fieldDesc.value_range[0] !== null && fieldDesc.value_range[1] !== null && ', '}
                                    {fieldDesc.value_range[1] !== null && `Max: ${fieldDesc.value_range[1]}`}
                                  </div>
                                )}
                                {fieldDesc.url && (
                                  <div className="small mt-1">
                                    <a
                                      href={fieldDesc.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue"
                                    >
                                      📖 Documentation
                                    </a>
                                  </div>
                                )}
                                {fieldDesc.ontology_url && (
                                  <div className="small mt-1">
                                    <a
                                      href={fieldDesc.ontology_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-purple"
                                    >
                                      🔗 Ontology
                                    </a>
                                  </div>
                                )}
                              </td>
                              <td>
                                {fieldDesc.unit ? (
                                  <code className="text-muted">{fieldDesc.unit}</code>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-muted">
                      {highlightField
                        ? `No metadata available for field "${highlightField}"`
                        : t('metadata.noResults')
                      }
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FieldMetadataModal;
