#!/usr/bin/env node

/**
 * Master Sync Script
 * Syncs all entities from Airtable in correct dependency order
 *
 * Dependency Order:
 * 1. Countries - No dependencies
 * 2. Districts (GAUL codes) - No dependencies
 * 3. Taxa (FAO ASFIS codes) - No dependencies
 * 4. Surveys (forms) - No dependencies
 * 5. Users - Depends on districts + surveys
 *
 * Usage: node scripts/sync_all_from_airtable.js
 */

import { spawn } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Run a sync script and wait for completion
 *
 * @param {string} scriptPath - Path to script to run
 * @param {string} description - Human-readable description
 * @returns {Promise<void>}
 */
async function runScript(scriptPath, description) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📦 ${description}`);
  console.log('='.repeat(70));

  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath], { stdio: 'inherit' });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${scriptPath} exited with code ${code}`));
      } else {
        resolve();
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting full Airtable sync (all entities)...\n');
  console.log('⏰ Started at:', new Date().toISOString());

  const startTime = Date.now();

  try {
    // Step 1: Countries. Previously absent from this sync entirely, which left the
    // `countries` collection frozen at whatever a one-off script wrote long ago.
    await runScript(
      'scripts/sync_countries_from_airtable.cjs',
      'Step 1/4: Syncing countries'
    );

    // Step 2: Districts (no dependencies)
    await runScript(
      'scripts/sync_districts_from_airtable.cjs',
      'Step 2/5: Syncing districts (GAUL codes)'
    );

    // Step 3: Taxa (no dependencies) — species-code reference data for the download filter
    await runScript(
      'scripts/sync_taxa_from_airtable.cjs',
      'Step 3/5: Syncing taxa (FAO species codes)'
    );

    // Step 4: Surveys (no dependencies)
    await runScript(
      'scripts/sync_surveys_from_airtable.js',
      'Step 4/5: Syncing surveys (forms)'
    );

    // Step 5: Users (depends on districts + surveys)
    await runScript(
      'scripts/sync_users_from_airtable.js',
      'Step 5/5: Syncing users (depends on districts + surveys)'
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'='.repeat(70)}`);
    console.log('✅ Full sync completed successfully!');
    console.log(`⏱️  Total duration: ${duration}s`);
    console.log(`⏰ Completed at: ${new Date().toISOString()}`);
    console.log('='.repeat(70));

    process.exit(0);
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n${'='.repeat(70)}`);
    console.error('❌ Sync failed:', error.message);
    console.error(`⏱️  Duration before failure: ${duration}s`);
    console.error('='.repeat(70));
    console.error('\n💡 Tip: Check the error above and fix before retrying.');
    console.error('   Individual syncs can be run separately if needed.');
    process.exit(1);
  }
}

main();
