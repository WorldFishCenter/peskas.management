/**
 * GET /api/data-download/workbook
 *
 * The Excel report: the trips of a download written into the analysis workbook (lib/workbook.js),
 * with every figure worked out one trip at a time by the workbook's own formulas.
 *
 * Takes the same query as /api/data-download/export, for `dataset=landings` only. It always
 * reads every column and every species: trip figures need whole trips, so `scope` and
 * `catch_taxon` are not applied.
 *
 * @access Protected - Requires JWT authentication
 * @permission Filtered by the user's form and district permissions, as the CSV export
 *
 * Response: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, attachment
 * `peskas-report-{country}-{status}-{date}.xlsx`. 400 for another dataset or a download over
 * MAX_WORKBOOK_ROWS rows; 404 when nothing matches (from fetchDownloadCSV).
 *
 * @module api/data-download/workbook
 */

const { withMiddleware, authenticateUser } = require('../../lib/middleware');
const {
  datasetOf,
  resolveDownload,
  fetchDownloadCSV,
  servedScope,
  downloadFileName,
  logDownload,
  sendDownloadError
} = require('../../lib/download');
const { buildWorkbook, rowsFromCSV } = require('../../lib/workbook');
const { setCorsHeaders, sendAttachment, sendBadRequest, sendMethodNotAllowed } = require('../../lib/response');
const { getDb } = require('../../lib/db');

// Past this a spreadsheet takes minutes to recalculate on an ordinary laptop.
const MAX_WORKBOOK_ROWS = 200000;

async function handler(req, res) {
  setCorsHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return sendMethodNotAllowed(res, ['GET']);

  try {
    if (datasetOf(req.query) !== 'landings') {
      return sendBadRequest(res, 'The Excel report is made from trips: choose the Trips data level.');
    }
    const database = await getDb();
    const download = await resolveDownload(req.user, { ...req.query, scope: undefined, catch_taxon: undefined });
    // The CSV route, not JSON: peskas-api sends JSON in one piece, which fails past about 70,000 rows.
    const data = rowsFromCSV(await fetchDownloadCSV(download, MAX_WORKBOOK_ROWS + 1));
    if (data.length > MAX_WORKBOOK_ROWS) {
      return sendBadRequest(res, `This download has more than ${MAX_WORKBOOK_ROWS.toLocaleString('en')} rows, too `
        + 'many for one Excel report. Choose one Administrative Area.');
    }

    const { countries } = servedScope(download);
    const file = buildWorkbook(data, {
      country: countries.length === 1 ? countries[0] : '',
      status: download.sharedFilters.status
    });

    await logDownload(database, req, download, { format: 'xlsx' });
    return sendAttachment(res, file, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      downloadFileName(download, 'report', 'xlsx'));
  } catch (error) {
    console.error('Workbook export error:', error);
    return sendDownloadError(res, error, 'Failed to make the Excel report. Please try again later.');
  }
}

module.exports = withMiddleware(handler, authenticateUser);
