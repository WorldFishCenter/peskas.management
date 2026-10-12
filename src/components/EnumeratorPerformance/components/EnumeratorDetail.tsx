import React from 'react';
import { useTranslation } from 'react-i18next';
import { EnumeratorData, DetailTabType } from '../types';
import { AlertDistributionChart, EnumeratorTrendChart } from '../charts/EnumeratorDetailCharts';
import { qualityScore } from '../utils/dataUtils';

interface EnumeratorDetailProps {
  selectedEnumeratorData: EnumeratorData;
  selectedEnumerator: string | null;
  setSelectedEnumerator: (name: string) => void;
  enumerators: EnumeratorData[];
  detailActiveTab: DetailTabType;
  setDetailActiveTab: (tab: DetailTabType) => void;
  describeAlert: (code: string) => string | undefined;
}

const EnumeratorDetail: React.FC<EnumeratorDetailProps> = ({
  selectedEnumeratorData,
  selectedEnumerator,
  setSelectedEnumerator,
  enumerators,
  detailActiveTab,
  setDetailActiveTab,
  describeAlert
}) => {
  const { t } = useTranslation('enumerators');

  return (
    <div className="card" id="enumerator-detail">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <div className="d-flex align-items-center">
            <span className="avatar avatar-md bg-azure-lt me-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="icon icon-tabler icon-tabler-user" width="24" height="24" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"></path>
                <path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"></path>
              </svg>
            </span>
            <h3 className="card-title m-0">{t('detailedAnalysis')}{selectedEnumeratorData.name}</h3>
          </div>
          <div style={{ width: '200px' }}>
            <select
              className="form-select"
              value={selectedEnumerator || ''}
              onChange={(e) => setSelectedEnumerator(e.target.value)}
            >
              <option value="" disabled>{t('selectEnumerator')}</option>
              {enumerators
                .filter(e => e.name !== t('table.unknownEnumerator', { ns: 'validation' }))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(enumerator => (
                  <option key={enumerator.name} value={enumerator.name}>
                    {enumerator.name}
                  </option>
                ))
              }
            </select>
          </div>
        </div>
        
        <div className="card-tabs">
          <ul className="nav nav-tabs nav-tabs-bottom">
            <li className="nav-item">
              <a
                className={`nav-link ${detailActiveTab === 'overview' ? 'active' : ''}`}
                href="#"
                onClick={(e) => { e.preventDefault(); setDetailActiveTab('overview'); }}
              >
                {t('overviewTab')}
              </a>
            </li>
            <li className="nav-item">
              <a
                className={`nav-link ${detailActiveTab === 'trends' ? 'active' : ''}`}
                href="#"
                onClick={(e) => { e.preventDefault(); setDetailActiveTab('trends'); }}
              >
                {t('submissionTrendTab')}
              </a>
            </li>
            <li className="nav-item">
              <a
                className={`nav-link ${detailActiveTab === 'alerts' ? 'active' : ''}`}
                href="#"
                onClick={(e) => { e.preventDefault(); setDetailActiveTab('alerts'); }}
              >
                {t('alertDistributionTab')}
              </a>
            </li>
          </ul>
        </div>
        
        <div className="tab-content mt-3">
          {/* Overview Tab */}
          <div className={`tab-pane ${detailActiveTab === 'overview' ? 'active show' : ''}`}>
            <div className="row row-cards">
              <div className="col-md-6">
                <div className="card">
                  <div className="card-body p-4">
                    <div className="d-flex justify-content-between">
                      <div>
                        <div className="subheader">{t('totalSubmissionsLabel')}</div>
                        <div className="h1 mt-2">{selectedEnumeratorData.filteredTotal ?? selectedEnumeratorData.totalSubmissions}</div>
                      </div>
                      <div>
                        <span className="badge bg-primary text-white p-2">
                          {t('selectedDateRange')}
                        </span>
                      </div>
                    </div>
                    <div className="d-flex mt-3">
                      <div>{t('submissionRate')}</div>
                      <div className="ms-auto text-green">
                        {Math.round((selectedEnumeratorData.filteredTotal ?? selectedEnumeratorData.totalSubmissions) / (enumerators.reduce((sum, e) => sum + (e.filteredTotal ?? e.totalSubmissions), 0) / enumerators.length) * 100)}%
                        <svg xmlns="http://www.w3.org/2000/svg" className="icon ms-1" width="24" height="24" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                          <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                          <path d="M3 17l6 -6l4 4l8 -8"></path>
                          <path d="M14 7l7 0l0 7"></path>
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="col-md-6">
                <div className="card">
                  <div className="card-body p-4">
                    <div className="d-flex justify-content-between">
                      <div>
                        <div className="subheader">{t('qualityScoreLabel')}</div>
                        <div className="h1 mt-2">{qualityScore(selectedEnumeratorData).toFixed(1)}%</div>
                      </div>
                      <div>
                        <span className="badge bg-success text-white p-2">
                          {t('performance')}
                        </span>
                      </div>
                    </div>
                    <div className="d-flex mt-3">
                      <div>{t('cleanSubmissions')}</div>
                      <div className="ms-auto text-green">
                        {(selectedEnumeratorData.filteredTotal ?? selectedEnumeratorData.totalSubmissions) -
                         (selectedEnumeratorData.filteredAlertsCount ?? selectedEnumeratorData.submissionsWithAlerts)}
                        <span className="text-muted ms-2">
                          {t('pagination.of', { ns: 'common' })} {selectedEnumeratorData.filteredTotal ?? selectedEnumeratorData.totalSubmissions}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Trends Tab */}
          <div className={`tab-pane ${detailActiveTab === 'trends' ? 'active show' : ''}`}>
            <h4 className="mb-3">
              {t('submissionTrendFor')}{selectedEnumeratorData.name}{t('selectedDateRangeSuffix')}
            </h4>
            <EnumeratorTrendChart
              selectedEnumeratorData={selectedEnumeratorData}
            />
          </div>

          {/* Alerts Tab */}
          <div className={`tab-pane ${detailActiveTab === 'alerts' ? 'active show' : ''}`}>
            <h4 className="mb-3">{t('alertTypesFor')}{selectedEnumeratorData.name}</h4>
            <AlertDistributionChart
              selectedEnumeratorData={selectedEnumeratorData}
              describeAlert={describeAlert}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnumeratorDetail; 