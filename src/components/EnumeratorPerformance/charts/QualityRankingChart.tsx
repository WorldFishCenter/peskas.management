import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { EnumeratorData } from '../types';
import {
  baseTooltipConfig,
  formatTooltipHeader,
  formatTooltipRow,
  formatStatRow,
  wrapTooltip,
  chartColors
} from '../utils/chartConfig';
import { qualityScore as computeQualityScore } from '../utils/dataUtils';

interface QualityRankingChartProps {
  enumerators: EnumeratorData[];
}

// PERFORMANCE FIX: Wrap in React.memo to prevent unnecessary re-renders
const QualityRankingChart: React.FC<QualityRankingChartProps> = React.memo(({
  enumerators
}) => {
  const { t } = useTranslation('enumerators');

  // Filter and sort once
  const sortedEnumerators = enumerators
    .filter(e => {
      const total = e.filteredTotal !== undefined ? e.filteredTotal : e.totalSubmissions;
      return total > 0;
    })
    .sort((a, b) => {
      const aRate = a.filteredErrorRate ?? a.errorRate;
      const bRate = b.filteredErrorRate ?? b.errorRate;
      return aRate - bRate; // Best quality first
    });

  const chartOptions: Highcharts.Options = useMemo(() => ({
    chart: {
      type: 'bar',
      height: Math.max(450, sortedEnumerators.length * 32),
      style: { fontFamily: 'inherit' }
    },
    title: { text: undefined },
    xAxis: {
      categories: sortedEnumerators.map(e => e.name),
      title: { text: null },
      labels: { style: { fontSize: '12px' } }
    },
    yAxis: [{
      title: { text: t('charts.qualityScore') },
      min: 0,
      max: 100,
      labels: { format: '{value}%' }
    }, {
      title: { text: t('charts.submissions') },
      min: 0,
      opposite: true
    }],
    tooltip: {
      ...baseTooltipConfig,
      shared: true,
      formatter: function(this: Highcharts.Point) {
        // Get category name from points array (more reliable than this.x for category axes)
        const categories = this.series.chart.xAxis[0].categories;
        const categoryName = this.points && this.points.length > 0
          ? (this.points[0].key || categories[this.points[0].x])
          : categories[this.x];

        const name = String(categoryName);
        const enumerator = sortedEnumerators.find(e => e.name === name);

        if (!enumerator) return wrapTooltip(formatTooltipHeader(name) + `<span style="color:#888;">${t('charts.noData')}</span>`);

        const total = enumerator.filteredTotal ?? enumerator.totalSubmissions;
        const alerts = enumerator.filteredAlertsCount ?? enumerator.submissionsWithAlerts;
        const cleanCount = Math.max(0, total - alerts);
        const qualityScore = computeQualityScore(enumerator).toFixed(1);

        return wrapTooltip(
          formatTooltipHeader(name) +
          formatTooltipRow(chartColors.success, t('charts.qualityScore'), qualityScore, '%') +
          formatTooltipRow(chartColors.info, t('charts.submissions'), total) +
          `<div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #eee;">` +
          formatStatRow(t('charts.cleanSubmissions'), cleanCount) +
          formatStatRow(t('charts.withAlerts'), alerts) +
          `</div>`
        );
      }
    },
    plotOptions: {
      bar: {
        borderRadius: 3,
        dataLabels: {
          enabled: true,
          style: { fontSize: '10px', fontWeight: '500' }
        },
        grouping: true
      }
    },
    series: [{
      name: t('charts.qualityScore'),
      type: 'bar',
      data: sortedEnumerators.map(e => parseFloat(computeQualityScore(e).toFixed(1))),
      color: chartColors.success,
      dataLabels: { format: '{y}%' }
    }, {
      name: t('charts.submissions'),
      type: 'bar',
      data: sortedEnumerators.map(e => e.filteredTotal ?? e.totalSubmissions),
      color: chartColors.info,
      yAxis: 1,
      opacity: 0.8,
      dataLabels: { format: '{y}' }
    }],
    legend: {
      enabled: true,
      align: 'center',
      verticalAlign: 'top',
      floating: false,
      itemStyle: { fontSize: '12px' }
    },
    credits: { enabled: false }
  }), [sortedEnumerators, t]);

  return <HighchartsReact highcharts={Highcharts} options={chartOptions} />;
}, (prevProps, nextProps) => {
  return JSON.stringify(prevProps.enumerators) === JSON.stringify(nextProps.enumerators);
});

export default QualityRankingChart; 