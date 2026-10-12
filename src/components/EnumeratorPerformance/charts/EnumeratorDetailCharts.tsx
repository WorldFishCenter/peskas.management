import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { IconMoodSmile } from '@tabler/icons-react';
import { EnumeratorData } from '../types';
import {
  pieTooltipConfig,
  columnTooltipConfig,
  wrapTooltip,
  formatTooltipHeader,
  formatTooltipNote,
  formatTooltipRow,
  formatStatRow,
  chartColors
} from '../utils/chartConfig';
import { tallyAlertFlags } from '../utils/dataUtils';

interface AlertDistributionChartProps {
  selectedEnumeratorData: EnumeratorData;
  /** What an alert code means, shown in its tooltip. */
  describeAlert: (code: string) => string | undefined;
}

// PERFORMANCE FIX: Wrap in React.memo to prevent unnecessary re-renders
export const AlertDistributionChart: React.FC<AlertDistributionChartProps> = React.memo(({
  selectedEnumeratorData,
  describeAlert
}) => {
  const { t } = useTranslation('enumerators');

  const { alertData, totalAlerts } = useMemo(() => {
    const data = tallyAlertFlags([selectedEnumeratorData]);
    return { alertData: data, totalAlerts: data.reduce((sum, item) => sum + item.y, 0) };
  }, [selectedEnumeratorData]);

  const chartOptions: Highcharts.Options = useMemo(() => ({
    chart: {
      type: 'pie',
      height: 320,
      style: { fontFamily: 'inherit' }
    },
    title: { text: undefined },
    subtitle: {
      text: totalAlerts === 1 ? t('charts.alertCount', { count: totalAlerts }) : t('charts.alertCountPlural', { count: totalAlerts }),
      style: { fontSize: '12px', color: '#666' }
    },
    tooltip: {
      ...pieTooltipConfig,
      formatter: function(this: Highcharts.Point) {
        const totalAlerts = this.series.data.reduce((sum, p) => sum + (p.y || 0), 0);
        const alertText = totalAlerts === 1 ? t('charts.alertCount', { count: totalAlerts }) : t('charts.alertCountPlural', { count: totalAlerts });

        return wrapTooltip(
          formatTooltipHeader(`${t('charts.alertType')}${this.name}`) +
          formatTooltipNote(describeAlert(String(this.name))) +
          formatTooltipRow(this.color, t('charts.count'), this.y ?? 0, '') +
          formatStatRow(t('charts.percentage'), `${(this.percentage ?? 0).toFixed(1)}%`) +
          formatStatRow(t('charts.outOfTotal'), alertText)
        );
      }
    },
    accessibility: { point: { valueSuffix: '%' } },
    plotOptions: {
      pie: {
        allowPointSelect: true,
        cursor: 'pointer',
        borderRadius: 3,
        dataLabels: {
          enabled: true,
          format: '<b>{point.name}</b>: {point.percentage:.1f}%',
          style: { fontSize: '10px' }
        },
        size: '85%'
      }
    },
    series: [{
      name: t('charts.tabs.alerts'),
      type: 'pie',
      data: alertData
    }],
    legend: { enabled: false },
    credits: { enabled: false }
  }), [alertData, totalAlerts, t, describeAlert]);

  // Empty state
  if (alertData.length === 0) {
    return (
      <div className="empty py-4">
        <div className="empty-icon">
          <IconMoodSmile size={36} stroke={1.5} className="text-green" />
        </div>
        <p className="empty-title h4">{t('charts.noAlertsTitle')}</p>
        <p className="empty-subtitle text-secondary">
          {t('charts.noAlertsEnumerator')}
        </p>
      </div>
    );
  }

  return <HighchartsReact highcharts={Highcharts} options={chartOptions} />;
}, (prevProps, nextProps) => {
  return JSON.stringify(prevProps.selectedEnumeratorData) === JSON.stringify(nextProps.selectedEnumeratorData) &&
    prevProps.describeAlert === nextProps.describeAlert;
});

interface EnumeratorTrendChartProps {
  selectedEnumeratorData: EnumeratorData;
}

// PERFORMANCE FIX: Wrap in React.memo to prevent unnecessary re-renders
export const EnumeratorTrendChart: React.FC<EnumeratorTrendChartProps> = React.memo(({
  selectedEnumeratorData
}) => {
  const { t } = useTranslation('enumerators');

  const { categories, data, tickInterval, totalSubmissions } = useMemo(() => {
    // `filteredTrend` is the date-filtered series, already summed and sorted. This used to
    // intersect the full trend against the filtered submissions with a nested `some()` — one pass
    // over every submission for every date the enumerator ever worked.
    // `?? []` only satisfies the optional field on `EnumeratorData`; the caller always passes an
    // enumerator from the date-filtered list, so the series is there. Falling back to the
    // unfiltered `submissionTrend` would have drawn dates outside the selected range.
    const filteredDates = selectedEnumeratorData.filteredTrend ?? [];

    const cats = filteredDates.map(item => {
      const d = new Date(item.date);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
      });
    });

    const counts = filteredDates.map(item => item.count);
    return {
      categories: cats,
      data: counts,
      tickInterval: Math.max(1, Math.floor(cats.length / 8)),
      totalSubmissions: counts.reduce((sum, val) => sum + val, 0)
    };
  }, [selectedEnumeratorData]);

  const chartOptions: Highcharts.Options = useMemo(() => ({
    chart: {
      type: 'column',
      height: 320,
      zoomType: 'x',
      style: { fontFamily: 'inherit' }
    },
    title: { text: undefined },
    subtitle: {
      text: totalSubmissions === 1 && data.length === 1
        ? t('charts.submissionsOverDays', { count: totalSubmissions, days: data.length })
        : t('charts.submissionsOverDaysPlural', { count: totalSubmissions, days: data.length }),
      style: { fontSize: '12px', color: '#666' }
    },
    xAxis: {
      categories,
      title: { text: null },
      labels: {
        rotation: -45,
        style: { fontSize: '10px' },
        step: tickInterval
      },
      crosshair: {
        width: 1,
        color: '#dee2e6'
      }
    },
    yAxis: {
      title: { text: t('charts.submissions') },
      min: 0,
      allowDecimals: false
    },
    tooltip: {
      ...columnTooltipConfig,
      formatter: function(this: Highcharts.Point) {
        // Get formatted date from category axis
        const dateLabel = this.key || this.series.chart.xAxis[0].categories[this.x];
        const value = this.y || 0;

        // Calculate stats for context
        const allData = this.series.data.map(p => p.y || 0);
        const maxValue = Math.max(...allData);
        const avgValue = (allData.reduce((sum, v) => sum + v, 0) / allData.length).toFixed(1);
        const isPeak = value === maxValue && value > 0;

        let content = formatTooltipHeader(String(dateLabel)) +
          formatTooltipRow(chartColors.primary, t('charts.submissions'), value, '');

        if (isPeak) {
          content += `<div style="margin-top: 6px; padding: 4px 8px; background: rgba(47, 179, 68, 0.1); border-radius: 4px; font-size: 11px; color: ${chartColors.success};">
            ${t('charts.peakDay')}
          </div>`;
        }

        content += `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #eee; font-size: 11px;">
          ${formatStatRow(t('charts.dailyAverage'), avgValue)}
        </div>`;
        
        return wrapTooltip(content);
      }
    },
    plotOptions: {
      column: {
        borderRadius: 3,
        dataLabels: {
          enabled: data.length <= 20,
          format: '{y}',
          style: { fontSize: '10px', fontWeight: '500' }
        },
        color: chartColors.primary
      }
    },
    series: [{
      name: t('charts.submissions'),
      type: 'column',
      data
    }],
    legend: { enabled: false },
    credits: { enabled: false }
  }), [categories, data, tickInterval, totalSubmissions, t]);

  return <HighchartsReact highcharts={Highcharts} options={chartOptions} />;
}, (prevProps, nextProps) => {
  return JSON.stringify(prevProps.selectedEnumeratorData) === JSON.stringify(nextProps.selectedEnumeratorData);
}); 