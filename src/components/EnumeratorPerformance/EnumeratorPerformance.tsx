import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetchEnumeratorStats } from '../../api/api';
import { ChartTabType, DetailTabType, EnumeratorData } from './types';
import { processEnumeratorData, findBestEnumerator, sumCounts, sumAlertCounts, toTrend } from './utils/dataUtils';
import { refreshEnumeratorStats } from './utils/apiUtils';
import { useContextualAlertCodes } from '../../hooks/useContextualAlertCodes';
import { useAuth } from '../Auth/AuthContext';

// Components
import PageHeader from './components/PageHeader';
import SummaryCards from './components/SummaryCards';
import ChartTabs from './components/ChartTabs';
import EnumeratorDetail from './components/EnumeratorDetail';
import AlertGuideModal from '../ValidationTable/AlertGuideModal';

// Add extended Highcharts types to fix TypeScript errors
declare module 'highcharts' {
  interface ChartOptions {
    zoomType?: string;
  }

  interface TooltipOptions {
    crosshairs?: boolean;
  }
}

const EnumeratorPerformance: React.FC = () => {
  const { t } = useTranslation('enumerators');
  const { data: rawData = [], accessibleSurveys, loadedSurvey, selectedSurvey, setSelectedSurvey, isLoading, error, refetch } = useFetchEnumeratorStats();
  const { user } = useAuth();
  // Admin status comes from the authenticated session, the same source Navbar gates on — not
  // from the presence of a locally-stored token.
  const isAdmin = user?.role === 'admin';
  const [selectedEnumerator, setSelectedEnumerator] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ChartTabType>('volume');
  const [detailActiveTab, setDetailActiveTab] = useState<DetailTabType>('overview');

  // Date range filter state
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [minDate, setMinDate] = useState<string>('');
  const [maxDate, setMaxDate] = useState<string>('');

  // Alert Guide modal state
  const [showAlertGuide, setShowAlertGuide] = useState(false);

  // Derive country for the selected survey from metadata.
  // For single-survey users, selectedSurvey may be null on first render — fall back to the only accessible survey.
  const surveyCountry = useMemo(() => {
    const survey = selectedSurvey
      ? accessibleSurveys.find(s => s.asset_id === selectedSurvey)
      : accessibleSurveys[0];
    return survey?.country_id || '';
  }, [selectedSurvey, accessibleSurveys]);

  const { surveyAlertCodes, describeAlert } = useContextualAlertCodes(loadedSurvey);

  // Process raw data from the hook (already filtered to selected survey by backend)
  const processedData = useMemo<EnumeratorData[]>(() => {
    if (!rawData || rawData.length === 0) return [];
    return processEnumeratorData(rawData);
  }, [rawData]);

  // Manage selected enumerator when survey/data changes
  useEffect(() => {
    if (processedData.length > 0 && !selectedEnumerator) {
      setSelectedEnumerator(processedData[0].name);
    } else if (processedData.length > 0 && selectedEnumerator) {
      const exists = processedData.some(e => e.name === selectedEnumerator);
      if (!exists) {
        setSelectedEnumerator(processedData[0].name);
      }
    }
  }, [processedData, selectedEnumerator]);

  // Compute min/max dates from processedData - reset when survey changes.
  // The rollup already carries plain `YYYY-MM-DD` days, so these are string comparisons.
  useEffect(() => {
    if (processedData.length === 0) return;
    let min: string | null = null;
    let max: string | null = null;
    for (const enumerator of processedData) {
      for (const stat of enumerator.dailyStats) {
        if (!stat.date) continue;
        if (min === null || stat.date < min) min = stat.date;
        if (max === null || stat.date > max) max = stat.date;
      }
    }
    if (min && max) {
      setMinDate(min);
      setMaxDate(max);
      setFromDate(min);
      setToDate(max);
    }
  }, [processedData]);

  // Apply date range filtering — derived directly, no intermediate state
  const enumerators = useMemo<EnumeratorData[]>(() => {
    if (processedData.length === 0) return [];
    return processedData.map(enumerator => {
      const filteredStats = enumerator.dailyStats.filter(stat => {
        if (!stat.date) return false;
        return (!fromDate || stat.date >= fromDate) && (!toDate || stat.date <= toDate);
      });
      const filteredTotal = sumCounts(filteredStats);
      const filteredAlertsCount = sumAlertCounts(filteredStats);
      return {
        ...enumerator,
        filteredStats,
        filteredTrend: toTrend(filteredStats),
        filteredTotal,
        filteredAlertsCount,
        filteredErrorRate: filteredTotal > 0 ? (filteredAlertsCount / filteredTotal) * 100 : 0
      };
    });
  }, [processedData, fromDate, toDate]);

  // Calculate dates for submission trend chart — must be above early returns (Rules of Hooks)
  const uniqueDates = useMemo(
    () => [...new Set(enumerators.flatMap(e => (e.filteredTrend || []).map(t => t.date)))].sort(),
    [enumerators]
  );

  // Check for admin token
  // Handle admin refresh
  const handleAdminRefresh = async () => {
    setIsRefreshing(true);
    setRefreshMessage(null);

    try {
      const result = await refreshEnumeratorStats();
      setRefreshMessage(result.success ? result.message : `Error: ${result.message}`);
      if (result.success) {
        await refetch();
      }
    } catch {
      setRefreshMessage(t('refreshError'));
    } finally {
      setIsRefreshing(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="page-body">
        <div className="container-xl">
          <div className="d-flex justify-content-center py-5">
            <div className="spinner-border text-primary"></div>
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
          <div className="alert alert-danger" role="alert">
            <div className="d-flex">
              <div>
                <svg xmlns="http://www.w3.org/2000/svg" className="icon icon-tabler icon-tabler-alert-circle" width="24" height="24" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                  <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"></path>
                  <path d="M12 8v4"></path>
                  <path d="M12 16h.01"></path>
                </svg>
              </div>
              <div className="ms-2">{error}</div>
            </div>
            <div className="mt-3">
              <button className="btn btn-outline-primary" onClick={() => refetch()}>
                {t('buttons.tryAgain', { ns: 'common' })}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No data state
  if (enumerators.length === 0) {
    return (
      <div className="page-body">
        <div className="container-xl">
          <div className="alert alert-info" role="alert">
            <div className="d-flex">
              <div>
                <svg xmlns="http://www.w3.org/2000/svg" className="icon icon-tabler icon-tabler-info-circle" width="24" height="24" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                  <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"></path>
                  <path d="M12 8l.01 0"></path>
                  <path d="M11 12h1v4h1"></path>
                </svg>
              </div>
              <div className="ms-2">{t('noData')}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const selectedEnumeratorData = enumerators.find(e => e.name === selectedEnumerator);

  // Calculate summary statistics based on filtered data
  const totalSubmissions = enumerators.reduce((sum, e) => sum + (e.filteredTotal ?? e.totalSubmissions), 0);
  const totalAlerts = enumerators.reduce((sum, e) => sum + (e.filteredAlertsCount ?? e.submissionsWithAlerts), 0);
  const avgErrorRate = totalSubmissions > 0 ? (totalAlerts / totalSubmissions) * 100 : 0;

  // Find the best enumerator using a weighted quality score
  const bestEnumerator = findBestEnumerator(enumerators);

  return (
    <>
      {/* Page Header */}
      <PageHeader
        isRefreshing={isRefreshing}
        isAdmin={isAdmin}
        handleAdminRefresh={handleAdminRefresh}
        fromDate={fromDate}
        toDate={toDate}
        setFromDate={setFromDate}
        setToDate={setToDate}
        minDate={minDate}
        maxDate={maxDate}
        selectedSurvey={selectedSurvey}
        setSelectedSurvey={(assetId) => { setSelectedSurvey(assetId); refetch(assetId); }}
        accessibleSurveys={accessibleSurveys}
        surveyCountry={surveyCountry}
        onShowAlertGuide={() => setShowAlertGuide(true)}
      />

      {/* Page Body */}
      <div className="page-body">
        <div className="container-xl">
          {refreshMessage && (
            <div className={`alert ${refreshMessage.includes('Error') ? 'alert-danger' : 'alert-success'} mb-3`}>
              {refreshMessage}
            </div>
          )}

          {/* Summary statistics cards */}
          <SummaryCards
            totalSubmissions={totalSubmissions}
            enumerators={enumerators}
            avgErrorRate={avgErrorRate}
            bestEnumerator={bestEnumerator}
          />

          {/* Main content section with tabs */}
          <ChartTabs
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            enumerators={enumerators}
            onEnumeratorSelect={setSelectedEnumerator}
            uniqueDates={uniqueDates}
            describeAlert={describeAlert}
          />

          {/* Detailed enumerator analysis section */}
          {selectedEnumeratorData && (
            <EnumeratorDetail
              selectedEnumeratorData={selectedEnumeratorData}
              selectedEnumerator={selectedEnumerator}
              setSelectedEnumerator={setSelectedEnumerator}
              enumerators={enumerators}
              detailActiveTab={detailActiveTab}
              setDetailActiveTab={setDetailActiveTab}
              describeAlert={describeAlert}
            />
          )}

          {/* Alert Guide Modal */}
          {showAlertGuide && (
            <AlertGuideModal
              onClose={() => setShowAlertGuide(false)}
              surveyAlertCodes={surveyAlertCodes}
            />
          )}
        </div>
      </div>
    </>
  );
};

export default EnumeratorPerformance;
