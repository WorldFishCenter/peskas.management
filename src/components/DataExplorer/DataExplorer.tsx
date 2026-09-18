import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconSchool,
  IconExternalLink,
  IconLock,
  IconClock,
  IconChecklist,
} from '@tabler/icons-react';
import { lessons, LESSON_BASE_PATH, LESSON_COUNT, lessonNumber } from './lessons';

/**
 * Data Academy catalog page.
 *
 * Mirrors the "data snacks" landing page: a short intro plus a grid of lesson cards.
 * Each available lesson links to a full-page, static quarto-live page (in-browser R via
 * webR) served from public/data-explorer/lessons/. These are plain anchors — they leave
 * the SPA on purpose so the lesson page can be cross-origin isolated (SharedArrayBuffer);
 * the lesson provides a "Back to Data Academy" link to return.
 *
 * Lessons run against the user's own permission-filtered landings data (same data/access
 * as Data Download) via /api/data-download/explorer-data.
 */
const DataExplorer: React.FC = () => {
  const { t } = useTranslation('dataExplorer');

  return (
    <>
      {/* Page Header */}
      <div className="page-header d-print-none">
        <div className="container-xl">
          <div className="row g-2 align-items-center">
            <div className="col">
              <h2 className="page-title">
                <IconSchool className="icon me-2" size={28} stroke={2} />
                {t('title')}
              </h2>
              <div className="text-muted mt-1">{t('description')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Page Body */}
      <div className="page-body">
        <div className="container-xl">
          {/* Intro / how-it-works note */}
          <div className="alert alert-info" role="alert">
            <div className="d-flex">
              <div>
                <IconSchool className="icon alert-icon" />
              </div>
              <div>
                <h4 className="alert-title">{t('intro.title')}</h4>
                <div className="text-secondary">{t('intro.body')}</div>
                {/* Points at WorldFish's fuller R course so the deliberately narrow scope of these
                    five lessons reads as a choice, not a gap. */}
                <div className="text-secondary mt-2">
                  {t('intro.deeper')}{' '}
                  <a
                    href="https://worldfishcenter.github.io/ssf.training/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    R for SSF
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Lessons grid */}
          <h3 className="mb-3">{t('lessonsHeading')}</h3>
          <div className="row row-cards">
            {lessons.map((lesson) => {
              const href = `${LESSON_BASE_PATH}/${lesson.slug}.html`;
              const number = lessonNumber(lesson.slug);
              // A reference page's three call-to-action differences (button style, icon, label)
              // always travel together, so they are chosen once rather than branched three times.
              const cta =
                lesson.kind === 'reference'
                  ? { variant: 'btn-outline-primary', Icon: IconChecklist, label: t('openCard') }
                  : { variant: 'btn-primary', Icon: IconExternalLink, label: t('startLesson') };
              return (
                <div className="col-sm-6 col-lg-4" key={lesson.slug}>
                  <div className="card h-100">
                    <div className="card-body d-flex flex-column">
                      <div className="mb-2 d-flex flex-wrap align-items-center gap-1">
                        {number !== null && (
                          <span className="badge bg-primary-lt">
                            {t('lessonNumber', { number, total: LESSON_COUNT })}
                          </span>
                        )}
                        {lesson.categories.map((cat) => (
                          <span className="badge bg-blue-lt" key={cat}>
                            {t(`categories.${cat}`)}
                          </span>
                        ))}
                        <span className="text-secondary ms-1 d-inline-flex align-items-center">
                          <IconClock className="icon me-1" size={15} stroke={2} />
                          <small>{t('minutes', { count: lesson.minutes })}</small>
                        </span>
                        {!lesson.available && (
                          <span className="badge bg-secondary-lt">{t('comingSoon')}</span>
                        )}
                      </div>
                      <h3 className="card-title mb-1">{t(`lessons.${lesson.slug}.title`)}</h3>
                      <p className="text-secondary flex-fill">
                        {t(`lessons.${lesson.slug}.description`)}
                      </p>
                      {lesson.available ? (
                        <a href={href} className={`btn w-100 mt-2 ${cta.variant}`}>
                          <cta.Icon className="icon me-1" size={18} stroke={2} />
                          {cta.label}
                        </a>
                      ) : (
                        <button type="button" className="btn w-100 mt-2" disabled>
                          <IconLock className="icon me-1" size={18} stroke={2} />
                          {t('comingSoon')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};

export default DataExplorer;
