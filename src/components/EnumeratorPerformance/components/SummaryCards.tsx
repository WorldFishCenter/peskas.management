import React from 'react';
import {
  IconFileAnalytics,
  IconUsers,
  IconAlertTriangle,
  IconTrophy
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { EnumeratorData } from '../types';
import { qualityScore } from '../utils/dataUtils';

interface SummaryCardsProps {
  totalSubmissions: number;
  enumerators: EnumeratorData[];
  avgErrorRate: number;
  bestEnumerator: EnumeratorData;
}

const SummaryCards: React.FC<SummaryCardsProps> = ({
  totalSubmissions,
  enumerators,
  avgErrorRate,
  bestEnumerator
}) => {
  const { t } = useTranslation('enumerators');

  // Determine error rate indicator color
  const getErrorRateColor = (rate: number) => {
    if (rate <= 10) return 'green';
    if (rate <= 25) return 'yellow';
    return 'red';
  };

  const errorRateColor = getErrorRateColor(avgErrorRate);
  const bestEnumeratorQuality = qualityScore(bestEnumerator);

  return (
    <div className="row row-deck row-cards mb-4">
      {/* Total Submissions */}
      <div className="col-sm-6 col-lg-3">
        <div className="card">
          <div className="card-body">
            <div className="d-flex align-items-center mb-2">
              <span className="avatar avatar-sm bg-primary-lt me-2">
                <IconFileAnalytics size={18} stroke={1.5} />
              </span>
              <div className="subheader">{t('summaryCards.totalSubmissions')}</div>
            </div>
            <div className="h1 mb-0">{totalSubmissions.toLocaleString()}</div>
            <div className="text-muted small">{t('summaryCards.inDateRange')}</div>
          </div>
        </div>
      </div>

      {/* Total Enumerators */}
      <div className="col-sm-6 col-lg-3">
        <div className="card">
          <div className="card-body">
            <div className="d-flex align-items-center mb-2">
              <span className="avatar avatar-sm bg-purple-lt me-2">
                <IconUsers size={18} stroke={1.5} />
              </span>
              <div className="subheader">{t('summaryCards.enumeratorsCount')}</div>
            </div>
            <div className="h1 mb-0">{enumerators.filter(e => (e.filteredTotal ?? 0) > 0).length}</div>
            <div className="text-muted small">{t('summaryCards.withActivityInPeriod')}</div>
          </div>
        </div>
      </div>

      {/* Average Error Rate */}
      <div className="col-sm-6 col-lg-3">
        <div className="card">
          <div className="card-body">
            <div className="d-flex align-items-center mb-2">
              <span className={`avatar avatar-sm bg-${errorRateColor}-lt me-2`}>
                <IconAlertTriangle size={18} stroke={1.5} />
              </span>
              <div className="subheader">{t('summaryCards.avgAlertRate')}</div>
            </div>
            <div className={`h1 mb-0 text-${errorRateColor}`}>{avgErrorRate.toFixed(1)}%</div>
            <div className="text-muted small">
              {avgErrorRate <= 10 ? t('summaryCards.qualityExcellent') : avgErrorRate <= 25 ? t('summaryCards.qualityModerate') : t('summaryCards.qualityNeedsAttention')}
            </div>
          </div>
        </div>
      </div>

      {/* Best Performer */}
      <div className="col-sm-6 col-lg-3">
        <div className="card">
          <div className="card-body">
            <div className="d-flex align-items-center mb-2">
              <span className="avatar avatar-sm bg-green-lt me-2">
                <IconTrophy size={18} stroke={1.5} />
              </span>
              <div className="subheader">{t('summaryCards.topPerformer')}</div>
            </div>
            <div className="h4 mb-0 text-truncate" title={bestEnumerator.name}>
              {bestEnumerator.name}
            </div>
            <div className="text-muted small">
              {bestEnumeratorQuality.toFixed(0)}% {t('quality.qualityScore', { ns: 'common' })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SummaryCards; 