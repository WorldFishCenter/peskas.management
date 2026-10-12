import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { EnumeratorData } from '../types';
import {
  baseTooltipConfig,
  formatTooltipHeader,
  formatStatRow,
  wrapTooltip,
  chartColors
} from '../utils/chartConfig';
import { qualityScore as computeQualityScore } from '../utils/dataUtils';

interface SubmissionVolumeChartProps {
  enumerators: EnumeratorData[];
  onEnumeratorSelect: (name: string) => void;
}

// PERFORMANCE FIX: Wrap in React.memo to prevent unnecessary re-renders
const SubmissionVolumeChart: React.FC<SubmissionVolumeChartProps> = React.memo(({
  enumerators,
  onEnumeratorSelect
}) => {
  const { t } = useTranslation('enumerators');

  const chartOptions: Highcharts.Options = useMemo(() => {
    const sortedEnumerators = [...enumerators].sort(
      (a, b) => (b.filteredTotal ?? b.totalSubmissions) - (a.filteredTotal ?? a.totalSubmissions)
    );
    return {
      chart: {
        type: 'bar',
        height: Math.max(400, sortedEnumerators.length * 28),
        style: { fontFamily: 'inherit' }
      },
      title: { text: undefined },
      xAxis: {
        categories: sortedEnumerators.map(e => e.name),
        title: { text: null },
        labels: {
          style: { fontSize: '12px' }
        }
      },
      yAxis: {
        title: { text: t('charts.submissions') },
        min: 0
      },
      tooltip: {
        ...baseTooltipConfig,
        formatter: function(this: Highcharts.Point) {
          // Get enumerator name from category axis
          const categoryName = this.key || this.series.chart.xAxis[0].categories[this.x];
          const name = String(categoryName);
          const enumerator = sortedEnumerators.find(e => e.name === name);
          const qualityScore = computeQualityScore(enumerator).toFixed(1);

          return wrapTooltip(
            formatTooltipHeader(name) +
            formatStatRow(t('charts.submissions'), this.y || 0) +
            formatStatRow(t('charts.qualityScore'), qualityScore, '%') +
            `<div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #eee; font-size: 11px; color: #888;">
              ${t('charts.clickForDetails')}
            </div>`
          );
        }
      },
      plotOptions: {
        bar: {
          cursor: 'pointer',
          borderRadius: 3,
          point: {
            events: {
              click: function(this: Highcharts.Point) {
                const category = this.category as string;
                onEnumeratorSelect(category);
                setTimeout(() => {
                  const detailSection = document.getElementById('enumerator-detail');
                  if (detailSection) {
                    detailSection.scrollIntoView({ behavior: 'smooth' });
                  }
                }, 100);
              }
            }
          },
          dataLabels: {
            enabled: true,
            format: '{y}',
            style: { fontSize: '11px', fontWeight: '500' }
          },
          color: chartColors.primary
        }
      },
      series: [{
        name: t('charts.submissions'),
        type: 'bar',
        data: sortedEnumerators.map(e => e.filteredTotal ?? e.totalSubmissions)
      }],
      legend: { enabled: false },
      credits: { enabled: false }
    };
  }, [enumerators, t, onEnumeratorSelect]);

  return <HighchartsReact highcharts={Highcharts} options={chartOptions} />;
});

export default SubmissionVolumeChart; 