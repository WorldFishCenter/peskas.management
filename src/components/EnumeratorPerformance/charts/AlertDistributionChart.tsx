import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { IconMoodSmile } from '@tabler/icons-react';
import { EnumeratorData } from '../types';
import { baseTooltipConfig, wrapTooltip, formatTooltipHeader, formatTooltipNote } from '../utils/chartConfig';
import { tallyAlertFlags } from '../utils/dataUtils';

interface AlertDistributionChartProps {
  enumerators: EnumeratorData[];
  /** What an alert code means, shown in its tooltip. */
  describeAlert: (code: string) => string | undefined;
}

// PERFORMANCE FIX: Wrap in React.memo to prevent unnecessary re-renders
const AlertDistributionChart: React.FC<AlertDistributionChartProps> = React.memo(({
  enumerators,
  describeAlert
}) => {
  const { t } = useTranslation('enumerators');

  const { alertData, totalAlerts } = useMemo(() => {
    const data = tallyAlertFlags(enumerators);
    return { alertData: data, totalAlerts: data.reduce((sum, item) => sum + item.y, 0) };
  }, [enumerators]);

  const chartOptions: Highcharts.Options = useMemo(() => ({
    chart: {
      type: 'pie',
      height: 480,
      style: { fontFamily: 'inherit' }
    },
    title: { text: undefined },
    subtitle: {
      text: totalAlerts === 1 ? t('charts.alertCount', { count: totalAlerts }) : t('charts.alertCountPlural', { count: totalAlerts }),
      style: { fontSize: '13px', color: '#666' }
    },
    tooltip: {
      ...baseTooltipConfig,
      formatter: function(this: Highcharts.Point) {
        return wrapTooltip(
          formatTooltipHeader(`${t('charts.alert')}${this.name}`) +
          formatTooltipNote(describeAlert(String(this.name))) +
          `<div style="display: flex; justify-content: space-between; margin: 4px 0;">
            <span style="color: #666;">${t('charts.count')}</span>
            <span style="font-weight: 600;">${this.y}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin: 4px 0;">
            <span style="color: #666;">${t('charts.share')}</span>
            <span style="font-weight: 600;">${(this.percentage ?? 0).toFixed(1)}%</span>
          </div>`
        );
      }
    },
    accessibility: {
      point: { valueSuffix: '%' }
    },
    plotOptions: {
      pie: {
        allowPointSelect: true,
        cursor: 'pointer',
        borderRadius: 4,
        dataLabels: {
          enabled: true,
          format: '<b>{point.name}</b>: {point.percentage:.1f}%',
          distance: 25,
          style: { fontSize: '11px', fontWeight: '500' },
          filter: {
            property: 'percentage',
            operator: '>',
            value: 4
          }
        },
        showInLegend: true,
        size: '75%'
      }
    },
    legend: {
      enabled: true,
      layout: 'vertical',
      align: 'right',
      verticalAlign: 'middle',
      itemMarginTop: 4,
      itemMarginBottom: 4,
      maxHeight: 350,
      itemStyle: { fontSize: '12px' }
    },
    series: [{
      name: t('charts.alerts'),
      type: 'pie',
      data: alertData
    }],
    credits: { enabled: false }
  }), [alertData, totalAlerts, t, describeAlert]);

  // Empty state with friendly message
  if (alertData.length === 0) {
    return (
      <div className="empty py-5">
        <div className="empty-icon">
          <IconMoodSmile size={48} stroke={1.5} className="text-green" />
        </div>
        <p className="empty-title">{t('charts.noAlerts')}</p>
        <p className="empty-subtitle text-secondary">
          {t('charts.noAlertsDescription')}
        </p>
      </div>
    );
  }

  return <HighchartsReact highcharts={Highcharts} options={chartOptions} />;
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if enumerators data actually changed
  // Deep comparison on enumerators array to prevent unnecessary chart re-renders
  return JSON.stringify(prevProps.enumerators) === JSON.stringify(nextProps.enumerators) &&
    prevProps.describeAlert === nextProps.describeAlert;
});

export default AlertDistributionChart; 