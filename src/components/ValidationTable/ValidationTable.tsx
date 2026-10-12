import React, { useMemo, useState, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  Row,
  ColumnFiltersState,
  SortingState,
} from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import StatusUpdateForm from './StatusUpdateForm';
import { useFetchSubmissions } from '../../api/api';
import { useContextualAlertCodes } from '../../hooks/useContextualAlertCodes';
import { updateValidationStatus } from '../../api/koboToolbox';
import { Submission } from '../../types/validation';
import AlertBadge from './AlertBadge';
import TableFilters from './TableFilters';
import AlertGuideModal from './AlertGuideModal';
import StatusBadge from './StatusBadge';
import { getCountryFlag, getCountryName } from '../../utils/countryMetadata';

/** How long the search box waits before asking the server. */
const SEARCH_DEBOUNCE_MS = 300;

const day = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

const formatDateWithDefault = (dateStr: string | null, defaultText: string, invalidText: string): string => {
  if (!dateStr) return defaultText;
  try {
    // Check if the date string is actually a Unix timestamp (number)
    const timestamp = Number(dateStr);
    const date = !isNaN(timestamp)
      ? new Date(timestamp * 1000)  // Convert seconds to milliseconds
      : new Date(dateStr);

    // Check if it's a valid date object
    if (isNaN(date.getTime())) {
      return invalidText;
    }

    return date.toLocaleString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return invalidText;
  }
};


const ValidationTable: React.FC = () => {
  const { t } = useTranslation('validation');
  const [selectedRow, setSelectedRow] = useState<Submission | null>(null);
  const [statusToUpdate, setStatusToUpdate] = useState<string>('validation_status_approved');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  // Raw input value, and the debounced copy that actually reaches the server.
  const [globalFilter, setGlobalFilter] = useState('');
  const [search, setSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [showAlertGuide, setShowAlertGuide] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setSearch(globalFilter), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [globalFilter]);

  // Paging, sorting and filtering all happen in MongoDB — the table holds one page, never the
  // whole collection. `columnFilters` is still the state container the filter dropdowns write
  // to; it is read here and sent to the server rather than applied to the rows.
  const statusFilter = columnFilters.find(f => f.id === 'validation_status')?.value as string | undefined;
  const alertFilter = columnFilters.find(f => f.id === 'alert_flag')?.value as string | undefined;

  const {
    data: submissions,
    total,
    statuses,
    dateRange,
    accessibleSurveys,
    loadedSurvey,
    selectedSurvey,
    setSelectedSurvey,
    isLoading,
    error,
    refetch,
  } = useFetchSubmissions({
    page: pageIndex + 1,
    limit: pageSize,
    sort: sorting[0]?.id ?? 'submission_date',
    order: sorting[0] && !sorting[0].desc ? 'asc' : 'desc',
    status: statusFilter,
    alert: alertFilter === 'all' ? undefined : alertFilter,
    from: fromDate || undefined,
    to: toDate || undefined,
    search: search || undefined,
  });

  // Bounds for the date pickers come from the collection, not from the loaded rows — deriving
  // them from the rows stopped being correct at the first page break. Both are null on a survey
  // whose submissions carry no date at all, which leaves the pickers empty and unconstrained.
  const minDate = day(dateRange.min);
  const maxDate = day(dateRange.max);

  // Any change to what is being asked for starts again at page one. Doing it in the setters
  // rather than in an effect avoids firing a request for the old page first.
  const firstPage = () => setPageIndex(0);

  // Helper function that uses translation
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return t('table.notAvailable');
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return t('table.invalidDate');
      }
      return date.toLocaleString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return t('table.invalidDate');
    }
  };

  // Alert codes for the survey these rows came from. The API names it directly, so this no
  // longer keeps a second filtered copy of every row just to work out which survey they are.
  const { surveyAlertCodes, describeAlert } = useContextualAlertCodes(loadedSurvey);

  const columns = useMemo<ColumnDef<Submission, unknown>[]>(
    () => [
      {
        accessorKey: 'submission_id',
        header: () => t('columns.submissionId'),
        cell: info => info.getValue(),
        enableSorting: true,
      },
      {
        accessorKey: 'survey_name',
        header: () => t('columns.survey'),
        cell: info => {
          const row = info.row.original;
          const surveyName = row.survey_name || t('table.unknownSurvey');
          const countryCode = row.survey_country || '';
          const countryFlag = getCountryFlag(countryCode);
          const countryName = getCountryName(countryCode);
          return (
            <div>
              <div className="text-truncate mw-12" title={surveyName}>
                {surveyName}
              </div>
              {countryCode && (
                <small className="text-muted">
                  {countryFlag} {countryName}
                </small>
              )}
            </div>
          );
        },
        // Every row on the page belongs to the same survey — the API serves exactly one per
        // request — so there is nothing here to sort by.
        enableSorting: false,
      },
      {
        accessorKey: 'submitted_by',
        header: () => t('columns.enumerator'),
        cell: info => {
          const row = info.row.original;
          const value = info.getValue();
          
          
          // Try multiple ways to get the value
          let displayValue = value;
          
          // If the primary accessor didn't work, try direct access to the row
          if (!displayValue && row) {
            if (typeof row.submitted_by === 'string' && row.submitted_by.trim() !== '') {
              displayValue = row.submitted_by;
            } else if (typeof row.submittedBy === 'string' && row.submittedBy.trim() !== '') {
              displayValue = row.submittedBy;
            }
          }
          
          // Final display logic
          return displayValue && String(displayValue).trim() !== '' 
            ? String(displayValue)
            : <span className="text-muted">—</span>;
        },
        enableSorting: true,
      },
      {
        accessorKey: 'submission_date',
        header: () => t('columns.date'),
        cell: info => {
          const date = info.getValue() as string;
          if (!date) return t('table.notAvailable');
          try {
            // For submission date, we only want YYYY-MM-DD
            return date.split('T')[0];
          } catch {
            return t('table.invalidDate');
          }
        },
        enableSorting: true,
      },
      {
        accessorKey: 'alert_flag',
        header: () => t('columns.alert'),
        cell: info => <AlertBadge alertFlag={info.getValue() as string} describeAlert={describeAlert} />,
        enableColumnFilter: true,
      },
      {
        accessorKey: 'validation_status',
        header: () => t('columns.status'),
        cell: info => <StatusBadge status={info.getValue() as string} />,
        enableSorting: true,
        enableColumnFilter: true,
        size: 150,
        minSize: 150,
      },
      {
        accessorKey: 'validated_at',
        header: () => t('columns.actions'),
        cell: info => formatDateWithDefault(info.getValue() as string, t('table.neverValidated'), t('table.invalidDate')),
        enableSorting: true,
      },
    ],
    [t, describeAlert]
  );

  const table = useReactTable({
    data: submissions,
    columns,
    state: {
      sorting,
      pagination: { pageIndex, pageSize },
      columnFilters,
    },
    onSortingChange: updater => { setSorting(updater); firstPage(); },
    onPaginationChange: updater => {
      if (typeof updater === 'function') {
        const newState = updater({ pageIndex, pageSize });
        setPageIndex(newState.pageIndex);
        setPageSize(newState.pageSize);
      }
    },
    onColumnFiltersChange: updater => { setColumnFilters(updater); firstPage(); },
    getCoreRowModel: getCoreRowModel(),
    // The row models that page, sort and filter in the browser are gone: the server does all
    // three. Without this the table would page a single page of rows a second time.
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  });

  const resetFilters = () => {
    setGlobalFilter('');
    // Cleared directly as well as through `globalFilter`: waiting for the debounce would fetch
    // once with the old search term still attached, then again 300ms later once it clears.
    setSearch('');
    table.resetColumnFilters();
    setFromDate('');
    setToDate('');
    firstPage();
  };

  const handleRowClick = (row: Row<Submission>) => {
    setSelectedRow(row.original);
    setSidebarOpen(true);
    setUpdateMessage(null);
  };

  const handleUpdateStatus = async () => {
    if (!selectedRow) return;

    setIsUpdating(true);
    try {
      const result = await updateValidationStatus(selectedRow.submission_id, statusToUpdate, selectedRow.asset_id);
      setUpdateMessage(result.message);
      
      if (result.success) {
        // If the update was successful, refresh the data
        refetch();
      }
    } catch (error) {
      setUpdateMessage("An error occurred while updating the validation status");
      console.error(error);
    } finally {
      setIsUpdating(false);
    }
  };

  // Only the first load replaces the page. Every page turn, sort and filter is now a request
  // too, and swapping the whole screen out for a spinner each time would unmount the search box
  // mid-typing; those show as a dimmed table instead.
  if (isLoading && !loadedSurvey)
    return (
      <div className="page-body">
        <div className="container-xl">
          <div className="d-flex justify-content-center py-5">
            <div className="spinner-border text-primary"></div>
          </div>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="page-body">
        <div className="container-xl">
          <div className="alert alert-danger">{error}</div>
        </div>
      </div>
    );

  return (
    <>
      {/* Page Header */}
      <div className="page-header d-print-none">
        <div className="container-xl">
          <div className="row g-2 align-items-center">
            <div className="col">
              <h2 className="page-title">{t('pageTitle')}</h2>
              <div className="text-muted mt-1">
                {t('pageDescription')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Page Body */}
      <div className="page-body">
        <div className="container-xl">
          {/* Filters Card */}
          <div className="card mb-3">
            <div className="card-body">
              <TableFilters
                table={table}
                globalFilter={globalFilter}
                setGlobalFilter={(value: string) => { setGlobalFilter(value); firstPage(); }}
                resetFilters={resetFilters}
                fromDate={fromDate}
                toDate={toDate}
                setFromDate={(date: string) => { setFromDate(date); firstPage(); }}
                setToDate={(date: string) => { setToDate(date); firstPage(); }}
                minDate={minDate}
                maxDate={maxDate}
                statusOptions={statuses}
                accessibleSurveys={accessibleSurveys}
                selectedSurvey={selectedSurvey}
                onSurveyChange={(assetId) => {
                  resetFilters();
                  setSelectedSurvey(assetId);
                  refetch(assetId);
                }}
                onShowAlertGuide={() => setShowAlertGuide(true)}
              />
            </div>
          </div>

          {/* Table Card */}
          <div className={`card ${isLoading ? 'opacity-50' : ''}`} aria-busy={isLoading}>
            <div className="table-responsive-fixed">
              <table className="table table-vcenter table-hover">
                <thead>
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => (
                        <th
                          key={header.id}
                          scope="col"
                          onClick={header.column.getToggleSortingHandler()}
                          className={`text-center text-uppercase fw-semibold ${header.column.getCanSort() ? 'cursor-pointer' : ''}`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span className="ms-1">
                            {{
                              asc: ' ↑',
                              desc: ' ↓',
                              false: ' ↕',
                            }[header.column.getIsSorted() as string] ?? ' ↕'}
                          </span>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.length > 0 ? (
                    table.getRowModel().rows.map(row => (
                      <tr
                        key={row.id}
                        onClick={() => handleRowClick(row)}
                        className={`cursor-pointer ${
                          selectedRow?.submission_id === row.original.submission_id
                            ? 'table-active'
                            : ''
                        }`}
                      >
                        {row.getVisibleCells().map(cell => (
                          <td
                            key={cell.id}
                            className="text-center align-middle"
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={columns.length} className="text-center py-4">
                        {t('table.noResults')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="card-footer d-flex align-items-center">
              <p className="m-0 text-muted">
                {t('pagination.showing', { ns: 'common' })} <span>{total === 0 ? 0 : pageIndex * pageSize + 1}</span> {t('pagination.to', { ns: 'common' })} <span>{Math.min((pageIndex + 1) * pageSize, total)}</span> {t('pagination.of', { ns: 'common' })} <span>{total}</span> {t('pagination.entries', { ns: 'common' })}
              </p>
              <ul className="pagination m-0 ms-auto">
                <li className={`page-item ${!table.getCanPreviousPage() ? 'disabled' : ''}`}>
                  <button
                    className="page-link"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="icon" width="24" height="24" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="15 6 9 12 15 18" /></svg>
                    {t('table.prev')}
                  </button>
                </li>
                <li className="page-item">
                  <select
                    value={table.getState().pagination.pageSize}
                    onChange={e => table.setPageSize(Number(e.target.value))}
                    className="form-select form-select-sm w-auto"
                  >
                    {[5, 10, 20, 25, 50].map(size => (
                      <option key={size} value={size}>
                        {t('pagination.perPage', { ns: 'common', count: size })}
                      </option>
                    ))}
                  </select>
                </li>
                <li className={`page-item ${!table.getCanNextPage() ? 'disabled' : ''}`}>
                  <button
                    className="page-link"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                  >
                    {t('table.next')}
                    <svg xmlns="http://www.w3.org/2000/svg" className="icon" width="24" height="24" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="9 6 15 12 9 18" /></svg>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      
      {/* Offcanvas Sidebar */}
      {selectedRow && (
        <>
          {/* Backdrop overlay */}
          {sidebarOpen && (
            <div 
              className="offcanvas-backdrop fade show" 
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
          )}
          
          <div
            className={`offcanvas offcanvas-end ${sidebarOpen ? 'show' : ''}`}
            tabIndex={-1}
            id="submissionSidebar"
            aria-labelledby="submissionSidebarLabel"
            aria-hidden={!sidebarOpen}
          >
            <div className="offcanvas-header">
              <h5 className="offcanvas-title" id="submissionSidebarLabel">{t('table.submissionDetails')}</h5>
              <button 
                type="button" 
                className="btn-close" 
                onClick={() => setSidebarOpen(false)}
                aria-label={t('buttons.close', { ns: 'common' })}
              />
            </div>
            <div className="offcanvas-body">
              {/* Submission Details - Using Tabler description list pattern */}
              <div className="mb-4">
                <h6 className="text-muted text-uppercase fw-semibold mb-3">{t('table.submissionDetails')}</h6>
                <dl className="datagrid">
                  <div className="datagrid-item">
                    <div className="datagrid-title">{t('table.submissionIdLabel')}</div>
                    <div className="datagrid-content">
                      <strong>{selectedRow?.submission_id || t('table.notAvailable')}</strong>
                    </div>
                  </div>
                  <div className="datagrid-item">
                    <div className="datagrid-title">{t('table.dateLabel')}</div>
                    <div className="datagrid-content">
                      {selectedRow?.submission_date ? formatDate(selectedRow.submission_date) : t('table.notAvailable')}
                    </div>
                  </div>
                  <div className="datagrid-item">
                    <div className="datagrid-title">{t('table.submittedByLabel')}</div>
                    <div className="datagrid-content">
                      {selectedRow?.submitted_by || t('table.unknownEnumerator')}
                    </div>
                  </div>
                  <div className="datagrid-item">
                    <div className="datagrid-title">{t('table.statusLabel')}</div>
                    <div className="datagrid-content">
                      <StatusBadge status={selectedRow.validation_status} />
                    </div>
                  </div>
                  {selectedRow?.alert_flag && selectedRow.alert_flag.trim() !== '' && (
                    <div className="datagrid-item">
                      <div className="datagrid-title">{t('table.alertFlagsLabel')}</div>
                      <div className="datagrid-content">
                        <AlertBadge alertFlag={selectedRow.alert_flag} describeAlert={describeAlert} />
                      </div>
                    </div>
                  )}
                  {selectedRow?.alert_catches && selectedRow.alert_catches.length > 0 && (
                    <div className="datagrid-item">
                      <div className="datagrid-title">{t('table.flaggedCatchesLabel')}</div>
                      <div className="datagrid-content">
                        {selectedRow.alert_catches.map(c => (
                          <div key={`${c.catch_number}-${c.code}`}>
                            <span className="me-1">
                              <AlertBadge alertFlag={c.code} describeAlert={describeAlert} />
                            </span>
                            {t('table.catchNumber', { number: c.catch_number })}
                            {c.species && `: ${c.species}`}
                            {c.value && `, ${c.value}`}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="datagrid-item">
                    <div className="datagrid-title">{t('table.lastValidatedLabel')}</div>
                    <div className="datagrid-content">
                      {formatDate(selectedRow?.validated_at || null)}
                    </div>
                  </div>
                </dl>
              </div>

              {/* Visual separator */}
              <hr className="my-4" />

              {/* Status Update Form Section */}
              <div>
                <h6 className="text-muted text-uppercase fw-semibold mb-3">{t('form.updateStatus')}</h6>
                <StatusUpdateForm
                  selectedSubmission={selectedRow}
                  status={statusToUpdate}
                  setStatus={setStatusToUpdate}
                  onUpdate={handleUpdateStatus}
                  isUpdating={isUpdating}
                  updateMessage={updateMessage}
                  hideSubmissionInfo={true}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Alert Guide Modal */}
      {showAlertGuide && (
        <AlertGuideModal
          onClose={() => setShowAlertGuide(false)}
          surveyAlertCodes={surveyAlertCodes}
        />
      )}
    </>
  );
};

export default ValidationTable;