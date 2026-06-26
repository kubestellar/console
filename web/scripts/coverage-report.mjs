#!/usr/bin/env node
/**
 * Coverage report generator — replaces `nyc report`.
 * Reads istanbul-format JSON from .nyc_output/ and writes text, HTML, and LCOV reports.
 */
import fs from 'fs';
import path from 'path';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import reports from 'istanbul-reports';

const nycOutputDir = path.resolve('.nyc_output');
const reportDir = path.resolve('coverage');

if (!fs.existsSync(nycOutputDir)) {
  console.error('No .nyc_output directory found. Run tests with coverage first.');
  process.exit(1);
}

const files = fs.readdirSync(nycOutputDir).filter(f => f.endsWith('.json'));
if (files.length === 0) {
  console.error('No coverage JSON files found in .nyc_output/');
  process.exit(1);
}

const coverageMap = libCoverage.createCoverageMap({});
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(nycOutputDir, file), 'utf8'));
  coverageMap.merge(data);
}

const context = libReport.createContext({
  dir: reportDir,
  defaultSummarizer: 'nested',
  coverageMap,
});

for (const reporter of ['text', 'html', 'lcov']) {
  reports.create(reporter).execute(context);
}

console.log(`\nCoverage report generated in ${reportDir}/`);
