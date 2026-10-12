import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import tabler from '@tabler/core/dist/js/tabler.min.js';
import { splitAlertCodes } from '../../utils/alertCodes';

interface AlertBadgeProps {
  alertFlag: string;
  /** One code's description; the badge lists its codes' descriptions in a popover. */
  describeAlert: (code: string) => string | undefined;
}

/**
 * The popover's body: one line per code. Built as DOM nodes so a description, which can come
 * from the database, is always shown as text and never parsed as markup.
 */
const popoverBody = (
  codes: string[],
  describeAlert: (code: string) => string | undefined,
  noDescription: string
): HTMLElement => {
  const body = document.createElement('div');
  body.className = 'vstack gap-2';
  for (const code of codes) {
    const row = document.createElement('div');
    row.className = 'd-flex align-items-start';
    const badge = document.createElement('span');
    badge.className = 'badge bg-red-lt text-red me-2';
    badge.textContent = code;
    const text = document.createElement('span');
    const description = describeAlert(code);
    text.textContent = description ?? noDescription;
    if (!description) text.className = 'text-secondary';
    row.append(badge, text);
    body.append(row);
  }
  return body;
};

const AlertBadge: React.FC<AlertBadgeProps> = ({ alertFlag, describeAlert }) => {
  const { t } = useTranslation('validation');
  const badgeRef = useRef<HTMLSpanElement>(null);

  // Tabler wires up `data-bs-toggle="popover"` only for elements present when the page first
  // loads, so a badge React renders later creates its own, with Tabler's delays. The body is
  // built when the popover opens, since most badges on a page are never hovered.
  useEffect(() => {
    if (!badgeRef.current) return;
    const popover = new tabler.Popover(badgeRef.current, {
      trigger: 'hover focus',
      placement: 'top',
      html: true,
      content: () => popoverBody(splitAlertCodes(alertFlag), describeAlert, t('table.noAlertDescription')),
      delay: { show: 50, hide: 50 }
    });
    return () => popover.dispose();
  }, [alertFlag, describeAlert, t]);

  if (!alertFlag || alertFlag.trim() === '') {
    return <span className="text-muted">—</span>;
  }

  return (
    <span ref={badgeRef} className="badge bg-red-lt text-red cursor-help" tabIndex={0}>
      {alertFlag}
    </span>
  );
};

export default AlertBadge;
