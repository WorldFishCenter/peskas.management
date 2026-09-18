# PESKAS | Management Platform

A scalable web platform for managing KoboToolbox survey data — validating submissions, tracking enumerator performance, downloading data, and exploring it interactively — with multi-survey support and centralized management.

## Features

- **Data Validation Interface** - Review and validate survey submissions with filtering and status updates
- **Enumerator Performance Dashboard** - Track submission quality, error rates, and trends with interactive charts
- **Data Download** - Preview and export permission-filtered landings data as CSV from the PeSKAS API
- **Data Academy** - Five interactive R lessons that run entirely in the browser (quarto-live + webR), teaching non-coders to filter, summarise and chart their own data
- **Multi-Survey Support** - Manage multiple surveys across different KoboToolbox servers
- **Role-Based Access Control** - Admin and user roles with survey-level permissions
- **Airtable Integration** - Centralized user and survey management with automated GitHub Actions sync
- **MongoDB-First Architecture** - Fast performance with MongoDB as single source of truth

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + React Router v7 + TanStack Table v8
- **Backend**: Express.js + MongoDB + Vercel Serverless Functions
- **UI Framework**: Tabler Core (Bootstrap-based)
- **Charts**: Highcharts
- **Data Pipeline**: R scripts for KoboToolbox data processing

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB instance
- KoboToolbox account(s)
- (Optional) Airtable base for centralized management

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Configure environment variables (see below)
# Edit .env with your MongoDB URI, JWT secret, etc.

# Create first admin user
node scripts/create_first_admin.js

# Start development servers (frontend + backend)
npm run dev
```

### Environment Variables

Required variables in `.env`:

```env
# MongoDB
MONGODB_VALIDATION_URI=mongodb+srv://...
MONGODB_VALIDATION_DB=validation-dev

# JWT Authentication
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
JWT_EXPIRY=7d

# Server
PORT=3001
NODE_ENV=development

# Airtable (optional, for sync scripts)
AIRTABLE_TOKEN=...
AIRTABLE_BASE_ID=...
```

## Development Commands

```bash
# Development (recommended - runs both frontend and backend)
npm run dev

# Frontend only
npm run dev:frontend

# Backend only
npm run dev:backend

# Production build
npm run build

# Start production server
npm run server

# Code quality
npm run lint
npm run format
```

## Management Scripts

All management scripts are in the `scripts/` directory:

```bash
# User Management
node scripts/create_first_admin.js         # Create admin user (interactive)
node scripts/create_admin_simple.js        # Create admin user (CLI args)
node scripts/delete_user.js                # Delete user by username

# Survey Configuration (R scripts)
Rscript scripts/list_surveys.R             # List all surveys
Rscript scripts/update_single_survey.R     # Configure one survey
Rscript scripts/update_all_surveys.R       # Batch configure all surveys

# Performance
node scripts/add_performance_indexes.cjs   # Add MongoDB indexes for optimization
```

### Automated Airtable Sync

User and survey management is automatically synced from Airtable using **GitHub Actions**.

- **📅 Schedule**: Daily at 2:00 AM UTC (automated)
- **🎮 Manual Trigger**: Via GitHub Actions UI, CLI, or npm scripts
- **🔄 Sync Order**: Districts → Surveys → Users
- **✅ Features**: Retry logic, error handling, audit logs, Slack notifications

**Quick Start**:
1. Configure GitHub Secrets: `MONGODB_VALIDATION_URI`, `MONGODB_VALIDATION_DB`,
   `AIRTABLE_BASE_ID`, `AIRTABLE_TOKEN`, and optionally `SLACK_WEBHOOK_URL`
2. Test: Actions → Run workflow → Select sync type
3. View logs and artifacts in GitHub Actions tab

**Manual Sync Options**:
```bash
npm run sync:all        # Sync everything (recommended)
npm run sync:users      # Sync only users
npm run sync:surveys    # Sync only surveys
npm run sync:districts  # Sync only districts
```

The workflow itself is [.github/workflows/sync-airtable.yml](.github/workflows/sync-airtable.yml);
a longer setup walkthrough is kept locally in `.github/AIRTABLE_SYNC_SETUP.md` (not committed).

## Architecture

### Data Flow

```
KoboToolbox → R Pipeline → MongoDB → Portal
                    ↓           ↑
                    └─ Validation Status Updates
```

1. **R Pipeline** fetches submissions from KoboToolbox, calculates alerts, writes to MongoDB
2. **Portal** reads all data from MongoDB (no KoboToolbox API calls during page loads)
3. **Validation Updates** sync to both MongoDB (primary) and KoboToolbox (secondary)

### MongoDB Collections

- `users` - User accounts with roles and permissions
- `surveys` - Survey metadata and KoboToolbox configurations
- `countries` - Country metadata for multi-country support
- `surveys_flags-{asset_id}` - Submission data per survey
- `enumerators_stats-{asset_id}` - Pre-computed statistics per survey

### Project Structure

```
peskas-management-platform/
├── src/                    # Frontend React application
│   ├── components/         # React components
│   ├── api/               # API client hooks
│   └── types/             # TypeScript definitions
├── server/                # Express backend server
├── api/                   # Vercel serverless functions
├── scripts/               # Management and migration scripts
├── docs/                  # Detailed documentation
└── public/                # Static assets
```

## Documentation

- [CLAUDE.md](CLAUDE.md) - Project guide: commands, architecture, conventions
- [NEWS.md](NEWS.md) - Version history and changelog

A local `docs/` folder holds the longer working material — architecture reference, decision log,
lesson authoring guide, data download notes. It is deliberately **not** version-controlled, so it is
only present on a maintainer's machine.

## Deployment

The application is configured for deployment on Vercel:

1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy

Build configuration and function limits are in [vercel.json](vercel.json); required environment
variables are documented in [.env.example](.env.example).

