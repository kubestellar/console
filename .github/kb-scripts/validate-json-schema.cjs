#!/usr/bin/env node

const fs = require('fs');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const [, , schemaPath, dataPath] = process.argv;

if (!schemaPath || !dataPath) {
  console.error('Usage: validate-json-schema.cjs <schema.json> <data.json>');
  process.exit(2);
}

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

try {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const validate = ajv.compile(readJson(schemaPath));
  const valid = validate(readJson(dataPath));

  if (!valid) {
    console.error(ajv.errorsText(validate.errors, { separator: '\n' }));
    process.exit(1);
  }
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
