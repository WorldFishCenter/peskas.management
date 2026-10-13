import React, { useState, useMemo, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from '@tanstack/react-table';
import { IconShield, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useFetchAuditLogs, AuditLog as AuditLogEntry, AuditLogsFilters } from '../../api/admin';

const CATEGORY_BADGE: Record<string, string> = {
  auth: 'bg-blue-lt',
  validation: 'bg-green-lt',
  download: 'bg-orange-lt',
  admin: 'bg-purple-lt',
};

const STATUS_BADGE: Record<string, string> = {
  success: 'bg-success-lt',
  failure: 'bg-danger-lt',
};

function str(val: unknown): string | null {
  return typeof val === 'string' && val ? val : null;
}

function list(val: unknown): string | null {
  return Array.isArray(val) && val.length > 0 ? val.join(', ') : null;
}

function formatIp(ip: string | null): string {
  if (!ip) return '—';
  if (ip === '::1' || ip === '127.0.0.1') return 'localhost';
  return ip;
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function renderDetails(entry: AuditLogEntry, t: Translate): React.ReactNode {
  const d = entry.details;
  switch (entry.action) {
    case 'login_failure': {
      const reason = str(d['reason']);
      return reason ? <span className="text-secondary small">Reason: {reason}</span> : <span className="text-secondary">—</span>;
    }
    case 'validation_status_changed': {
      const from = str(d['from_status']) ?? '—';
      const to = str(d['to_status']) ?? '—';
      const id = str(d['submission_id']);
      return (
        <span className="small">
          <span className="text-secondary">{from}</span>
          {' → '}
          <span className="fw-medium">{to}</span>
          {id && <span className="text-muted ms-1 font-monospace">({id})</span>}
        </span>
      );
    }
    case 'data_preview':
    case 'data_export':
    case 'data_explorer_load': {
      // Recorded from 2.11.0: trips (landings) or monthly figures per district (district-months)
      const dataset = str(d['dataset']);
      const country = str(d['country_id']);
      const dataStatus = str(d['data_status']);
      const scope = str(d['scope']);
      const catchTaxon = str(d['catch_taxon']);
      const district = str(d['district']);
      const surveyId = str(d['survey_asset_id']);
      const hasAny = dataset || country || dataStatus || scope || catchTaxon || district || surveyId;
      if (!hasAny) return <span className="text-secondary">—</span>;
      return (
        <div className="d-flex flex-wrap gap-1">
          {country    && <span className="badge bg-blue-lt">{country}</span>}
          {dataset    && <span className="badge bg-secondary-lt">{t(`auditLog.datasets.${dataset}`, { defaultValue: dataset })}</span>}
          {dataStatus && <span className="badge bg-secondary-lt">{dataStatus}</span>}
          {scope      && <span className="badge bg-secondary-lt">{scope}</span>}
          {catchTaxon && <span className="badge bg-secondary-lt">{catchTaxon}</span>}
          {district   && <span className="badge bg-secondary-lt">district: {district}</span>}
          {surveyId   && <span className="badge bg-secondary-lt font-monospace" title="Survey asset ID">{surveyId}</span>}
        </div>
      );
    }
    // Admin actions all name the thing they acted on, plus either the fields that changed
    // or the role/permissions involved. Never the values themselves — passwords included.
    case 'user_created':
    case 'user_updated':
    case 'user_deleted':
    case 'user_permissions_changed':
    case 'user_password_reset': {
      const username = str(d['target_username']);
      const userId = str(d['target_user_id']);
      const role = str(d['role']);
      const fields = list(d['fields']);
      const surveys = Array.isArray(d['surveys']) ? d['surveys'].length : null;
      return (
        <div className="d-flex flex-wrap gap-1">
          {username
            ? <span className="badge bg-purple-lt">{t('auditLog.details.targetUser')}: {username}</span>
            : userId && <span className="badge bg-purple-lt font-monospace">{userId}</span>}
          {role    && <span className="badge bg-secondary-lt">{t('auditLog.details.role')}: {role}</span>}
          {fields  && <span className="badge bg-secondary-lt">{t('auditLog.details.fields')}: {fields}</span>}
          {surveys !== null && <span className="badge bg-secondary-lt">{surveys} {t('auditLog.details.surveys')}</span>}
        </div>
      );
    }
    case 'country_created':
    case 'country_updated':
    case 'country_deleted': {
      const code = str(d['country_code']);
      const name = str(d['country_name']);
      const fields = list(d['fields']);
      if (!code && !name && !fields) return <span className="text-secondary">—</span>;
      return (
        <div className="d-flex flex-wrap gap-1">
          <span className="badge bg-purple-lt">{t('auditLog.details.country')}: {name || code}</span>
          {fields && <span className="badge bg-secondary-lt">{t('auditLog.details.fields')}: {fields}</span>}
        </div>
      );
    }
    default:
      return <span className="text-secondary">—</span>;
  }
}

const PAGE_SIZES = [50, 100, 200];

const SORT_ICONS: Record<string, string> = { asc: ' ↑', desc: ' ↓' };

const AuditLog: React.FC = () => {
  const { t } = useTranslation('admin');

  // Filter state — immediate for selects/dates, debounced for text
  const [usernameInput, setUsernameInput] = useState('');
  const [debouncedUsername, setDebouncedUsername] = useState('');
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Pagination and sorting
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'timestamp', desc: true }]);

  // Debounce username input — reset to page 1 when it settles
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedUsername(usernameInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [usernameInput]);

  const filters = useMemo<AuditLogsFilters>(
    () => ({
      page,
      limit,
      sortBy: sorting[0]?.id,
      sortOrder: sorting[0]?.desc === false ? 'asc' : 'desc',
      username: debouncedUsername || undefined,
      category: category || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [page, limit, sorting, debouncedUsername, category, from, to]
  );

  const { data, isLoading, error } = useFetchAuditLogs(filters);
  const { logs, total } = data;

  const totalPages = Math.ceil(total / limit) || 1;

  function resetFilters() {
    setUsernameInput('');
    setDebouncedUsername('');
    setCategory('');
    setFrom('');
    setTo('');
    setPage(1);
  }

  const columns = useMemo<ColumnDef<AuditLogEntry>[]>(
    () => [
      {
        accessorKey: 'timestamp',
        header: () => t('auditLog.columns.timestamp'),
        enableSorting: true,
        cell: info => (
          <span className="text-nowrap">
            {new Date(info.getValue() as string).toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: 'username',
        header: () => t('auditLog.columns.user'),
        enableSorting: true,
        cell: info => (
          <span className="fw-medium">{(info.getValue() as string | null) ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'category',
        header: () => t('auditLog.columns.category'),
        enableSorting: true,
        cell: info => {
          const cat = info.getValue() as string;
          const badge = CATEGORY_BADGE[cat] ?? 'bg-secondary-lt';
          const label = t(`auditLog.categories.${cat}`, { defaultValue: cat });
          return <span className={`badge ${badge}`}>{label}</span>;
        },
      },
      {
        accessorKey: 'action',
        header: () => t('auditLog.columns.action'),
        enableSorting: true,
        cell: info => {
          const action = info.getValue() as string;
          return t(`auditLog.actions.${action}`, { defaultValue: action });
        },
      },
      {
        id: 'details',
        header: () => t('auditLog.columns.details'),
        enableSorting: false,
        cell: ({ row }) => renderDetails(row.original, t),
      },
      {
        accessorKey: 'status',
        header: () => t('auditLog.columns.status'),
        enableSorting: true,
        cell: info => {
          const status = info.getValue() as string;
          const badge = STATUS_BADGE[status] ?? 'bg-secondary-lt';
          return <span className={`badge ${badge}`}>{status}</span>;
        },
      },
      {
        accessorKey: 'ip',
        header: () => t('auditLog.columns.ip'),
        enableSorting: false,
        cell: info => (
          <span className="text-secondary small">{formatIp(info.getValue() as string | null)}</span>
        ),
      },
    ],
    [t]
  );

  const table = useReactTable({
    data: logs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: totalPages,
    state: { sorting },
    onSortingChange: updater => {
      setSorting(updater);
      setPage(1);
    },
  });

  if (error) {
    return (
      <div className="page-body">
        <div className="container-xl">
          <div className="alert alert-danger">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Page Header */}
      <div className="page-header d-print-none">
        <div className="container-xl">
          <div className="row g-2 align-items-center">
            <div className="col">
              <div className="page-pretitle">{t('administration')}</div>
              <h2 className="page-title">
                <IconShield className="icon me-2" size={24} stroke={1.5} />
                {t('auditLog.title')}
              </h2>
            </div>
          </div>
        </div>
      </div>

      {/* Page Body */}
      <div className="page-body">
        <div className="container-xl">

          {/* Filter Bar */}
          <div className="card mb-3">
            <div className="card-body">
              <div className="row g-2 align-items-end">
                <div className="col-12 col-sm-4 col-md-3">
                  <label className="form-label">{t('auditLog.filters.username')}</label>
                  <input
                    type="text"
                    className="form-control"
                    value={usernameInput}
                    onChange={e => setUsernameInput(e.target.value)}
                    placeholder={t('auditLog.filters.username')}
                  />
                </div>
                <div className="col-12 col-sm-4 col-md-2">
                  <label className="form-label">{t('auditLog.columns.category')}</label>
                  <select
                    className="form-select"
                    value={category}
                    onChange={e => { setCategory(e.target.value); setPage(1); }}
                  >
                    <option value="">{t('auditLog.filters.category')}</option>
                    <option value="auth">{t('auditLog.categories.auth')}</option>
                    <option value="validation">{t('auditLog.categories.validation')}</option>
                    <option value="download">{t('auditLog.categories.download')}</option>
                    <option value="admin">{t('auditLog.categories.admin')}</option>
                  </select>
                </div>
                <div className="col-12 col-sm-4 col-md-2">
                  <label className="form-label">{t('auditLog.filters.from')}</label>
                  <input
                    type="date"
                    className="form-control"
                    value={from}
                    onChange={e => { setFrom(e.target.value); setPage(1); }}
                  />
                </div>
                <div className="col-12 col-sm-4 col-md-2">
                  <label className="form-label">{t('auditLog.filters.to')}</label>
                  <input
                    type="date"
                    className="form-control"
                    value={to}
                    min={from || undefined}
                    onChange={e => { setTo(e.target.value); setPage(1); }}
                  />
                </div>
                <div className="col-auto">
                  <button className="btn btn-ghost-secondary" onClick={resetFilters}>
                    {t('auditLog.filters.reset')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">{t('auditLog.title')}</h3>
              <div className="card-actions">
                <span className="text-secondary">{total} {t('auditLog.totalEvents')}</span>
              </div>
            </div>
            <div className="table-responsive">
              {isLoading ? (
                <div className="d-flex justify-content-center align-items-center py-5">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              ) : (
                <table className="table table-vcenter card-table table-hover">
                  <thead>
                    {table.getHeaderGroups().map(headerGroup => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map(header => (
                          <th
                            key={header.id}
                            onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                            className={header.column.getCanSort() ? 'cursor-pointer user-select-none' : ''}
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getCanSort() && (
                              <span className="ms-1 text-muted">
                                {SORT_ICONS[header.column.getIsSorted() as string] ?? ' ↕'}
                              </span>
                            )}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={columns.length} className="text-center text-secondary py-4">
                          {t('auditLog.noLogs')}
                        </td>
                      </tr>
                    ) : (
                      table.getRowModel().rows.map(row => (
                        <tr key={row.id}>
                          {row.getVisibleCells().map(cell => (
                            <td key={cell.id}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Footer */}
            <div className="card-footer d-flex align-items-center">
              <p className="m-0 text-secondary">
                {t('pagination.showing', { ns: 'common' })}{' '}
                <span>{total === 0 ? 0 : (page - 1) * limit + 1}</span>{' '}
                {t('pagination.to', { ns: 'common' })}{' '}
                <span>{Math.min(page * limit, total)}</span>{' '}
                {t('pagination.of', { ns: 'common' })}{' '}
                <span>{total}</span>
              </p>
              <ul className="pagination m-0 ms-auto">
                <li className={`page-item ${page <= 1 ? 'disabled' : ''}`}>
                  <button
                    className="page-link"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <IconChevronLeft className="icon" size={24} stroke={2} />
                    {t('pagination.previous', { ns: 'common' })}
                  </button>
                </li>
                <li className="page-item">
                  <select
                    value={limit}
                    onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                    className="form-select form-select-sm w-auto mx-2"
                  >
                    {PAGE_SIZES.map(size => (
                      <option key={size} value={size}>
                        {t('pagination.perPage', { ns: 'common', count: size })}
                      </option>
                    ))}
                  </select>
                </li>
                <li className={`page-item ${page >= totalPages ? 'disabled' : ''}`}>
                  <button
                    className="page-link"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    {t('pagination.next', { ns: 'common' })}
                    <IconChevronRight className="icon" size={24} stroke={2} />
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AuditLog;
