import React, { useState, useMemo, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from '@tanstack/react-table';
import { IconKey, IconTrash, IconRefresh, IconUsers } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useFetchUsers, useFetchSurveys, deleteUser, User } from '../../api/admin';
import ResetPasswordModal from './ResetPasswordModal';
import { getApiBaseUrl } from '../../utils/apiConfig';
import axios from '../../utils/axiosConfig';
import { extractErrorMessage } from '../../utils/errors';
import { getCountryFlag, getCountryName } from '../../utils/countryMetadata';

const AdminUsers: React.FC = () => {
  const { t } = useTranslation('admin');
  const { data: users, isLoading, error, refetch } = useFetchUsers();
  const { data: surveys } = useFetchSurveys();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Declared above `columns` because the column definitions close over them and list them as
  // dependencies — a later `const` would be in the temporal dead zone when the memo evaluates.
  const handleResetPassword = useCallback((user: User) => {
    setSelectedUser(user);
    setShowResetPasswordModal(true);
  }, []);

  const handleDeleteUser = useCallback(async (user: User) => {
    if (!confirm(t('messages.deleteConfirm', { username: user.username }))) {
      return;
    }

    const result = await deleteUser(user._id);

    if (result.success) {
      alert(result.message);
      refetch();
    } else {
      alert(`Error: ${result.message}`);
    }
  }, [t, refetch]);

  // Column definitions
  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        accessorKey: 'username',
        header: () => t('columns.username'),
        cell: info => (
          <span className="text-reset fw-medium">{info.getValue() as string}</span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'name',
        header: () => t('columns.name'),
        cell: info => info.getValue() as string || <span className="text-secondary">—</span>,
        enableSorting: true,
      },
      {
        accessorKey: 'country',
        header: () => t('columns.country'),
        cell: info => {
          const countries = info.getValue() as string[] | undefined;
          if (!countries || countries.length === 0) {
            return <span className="text-secondary">—</span>;
          }
          return (
            <div>
              {countries.map((code, idx) => (
                <span key={code}>
                  {getCountryFlag(code)} {getCountryName(code)}
                  {idx < countries.length - 1 && ', '}
                </span>
              ))}
            </div>
          );
        },
        enableSorting: true,
      },
      {
        accessorKey: 'role',
        header: () => t('columns.role'),
        cell: info => {
          const role = info.getValue() as string;
          return (
            <span className={`badge ${role === 'admin' ? 'bg-purple-lt' : 'bg-blue-lt'}`}>
              {role === 'admin' ? t('roles.admin') : role === 'manager' ? t('roles.manager') : t('roles.user')}
            </span>
          );
        },
        enableSorting: true,
      },
      {
        id: 'surveys',
        header: () => t('columns.surveys'),
        cell: info => {
          const user = info.row.original;
          const surveyIds = user.permissions?.surveys || [];

          if (user.role === 'admin') {
            return <span className="badge bg-green-lt">{t('allSurveys')}</span>;
          }

          if (surveyIds.length === 0) {
            return <span className="text-secondary">{t('none')}</span>;
          }

          const assignedSurveys = surveys?.filter(s => surveyIds.includes(s.asset_id)) || [];

          if (assignedSurveys.length === 0) {
            return <span className="badge bg-yellow-lt">{surveyIds.length} {t('unknown')}</span>;
          }

          if (assignedSurveys.length === 1) {
            return (
              <span className="badge bg-azure-lt" title={assignedSurveys[0].name}>
                {assignedSurveys[0].name}
              </span>
            );
          }

          return (
            <span
              className="badge bg-azure-lt"
              title={assignedSurveys.map(s => s.name).join(', ')}
            >
              {t('surveysCount', { count: assignedSurveys.length })}
            </span>
          );
        },
      },
      {
        id: 'enumerators',
        header: () => t('columns.enumerators'),
        cell: info => {
          const user = info.row.original;
          const enumerators = user.permissions?.enumerators || [];

          if (user.role === 'admin') {
            return <span className="badge bg-green-lt">{t('all')}</span>;
          }

          if (enumerators.length === 0) {
            return <span className="text-secondary">{t('all')}</span>;
          }

          return (
            <span
              className="badge bg-cyan-lt"
              title={enumerators.join(', ')}
            >
              {t('enumeratorsAssigned', { count: enumerators.length })}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: () => '',
        cell: info => {
          const user = info.row.original;
          return (
            <div className="btn-list flex-nowrap">
              <button
                className="btn btn-ghost-primary btn-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleResetPassword(user);
                }}
                title={t('buttons.resetPassword')}
              >
                <IconKey size={18} stroke={1.5} />
              </button>
              <button
                className="btn btn-ghost-danger btn-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteUser(user);
                }}
                title={t('buttons.deleteUser')}
              >
                <IconTrash size={18} stroke={1.5} />
              </button>
            </div>
          );
        },
      },
    ],
    [surveys, t, handleResetPassword, handleDeleteUser]
  );

  // TanStack Table setup
  const table = useReactTable({
    data: users,
    columns,
    state: {
      sorting,
      pagination: { pageIndex, pageSize },
    },
    onSortingChange: setSorting,
    onPaginationChange: updater => {
      if (typeof updater === 'function') {
        const newState = updater({ pageIndex, pageSize });
        setPageIndex(newState.pageIndex);
        setPageSize(newState.pageSize);
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const handleSyncFromAirtable = async () => {
    if (!confirm(t('messages.syncConfirm'))) {
      return;
    }

    setIsSyncing(true);
    try {
      // Shared axios instance: the interceptor attaches the token and handles 401 expiry.
      const response = await axios.post(`${getApiBaseUrl()}/admin/sync-users`);
      const result = response.data;

      if (result.success) {
        alert(t('messages.syncComplete', {
          created: result.created,
          updated: result.updated,
          deleted: result.deleted || 0
        }));
        refetch();
      } else {
        alert(t('messages.syncFailed', { message: result.message }));
      }
    } catch (err) {
      alert(extractErrorMessage(err, t('messages.syncFailedCheck')));
      console.error('Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="page-body">
        <div className="container-xl">
          <div className="d-flex justify-content-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">{t('loading', { ns: 'common' })}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
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
                <IconUsers className="icon me-2" size={24} stroke={1.5} />
                {t('userManagement')}
              </h2>
            </div>
            <div className="col-auto ms-auto">
              <button
                className="btn btn-primary"
                onClick={handleSyncFromAirtable}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    {t('syncing')}
                  </>
                ) : (
                  <>
                    <IconRefresh className="icon me-1" size={18} stroke={1.5} />
                    {t('buttons.syncFromAirtable')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Page Body */}
      <div className="page-body">
        <div className="container-xl">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">{t('users')}</h3>
              <div className="card-actions">
                <span className="text-secondary">
                  {t('userCount', { count: users.length })} {t('totalUsers')}
                </span>
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-vcenter card-table table-hover">
                <thead>
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => (
                        <th
                          key={header.id}
                          onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                          className={header.column.getCanSort() ? 'cursor-pointer' : ''}
                        >
                          {header.isPlaceholder ? null : (
                            <div className="d-flex align-items-center gap-1">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {header.column.getCanSort() && (
                                <span className="text-secondary">
                                  {{
                                    asc: ' ↑',
                                    desc: ' ↓',
                                  }[header.column.getIsSorted() as string] ?? ''}
                                </span>
                              )}
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className="text-center text-secondary py-4">
                        {t('noUsers')}
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
            </div>

            {/* Pagination Footer */}
            {table.getPageCount() > 1 && (
              <div className="card-footer d-flex align-items-center">
                <p className="m-0 text-secondary">
                  {t('pagination.showing', { ns: 'common' })}{' '}
                  <span>{table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}</span> {t('pagination.to', { ns: 'common' })}{' '}
                  <span>
                    {Math.min(
                      (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                      users.length
                    )}
                  </span>{' '}
                  {t('pagination.of', { ns: 'common' })} <span>{users.length}</span> {t('users')}
                </p>
                <ul className="pagination m-0 ms-auto">
                  <li className={`page-item ${!table.getCanPreviousPage() ? 'disabled' : ''}`}>
                    <button
                      className="page-link"
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="icon" width="24" height="24" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                        <polyline points="15 6 9 12 15 18" />
                      </svg>
                      {t('pagination.previous', { ns: 'common' })}
                    </button>
                  </li>
                  <li className="page-item">
                    <select
                      value={table.getState().pagination.pageSize}
                      onChange={e => table.setPageSize(Number(e.target.value))}
                      className="form-select form-select-sm w-auto mx-2"
                    >
                      {[10, 20, 50].map(size => (
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
                      {t('pagination.next', { ns: 'common' })}
                      <svg xmlns="http://www.w3.org/2000/svg" className="icon" width="24" height="24" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                        <polyline points="9 6 15 12 9 18" />
                      </svg>
                    </button>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reset Password Modal */}
      {showResetPasswordModal && selectedUser && (
        <ResetPasswordModal
          user={selectedUser}
          onClose={() => {
            setShowResetPasswordModal(false);
            setSelectedUser(null);
          }}
          onSuccess={refetch}
        />
      )}
    </>
  );
};

export default AdminUsers;
