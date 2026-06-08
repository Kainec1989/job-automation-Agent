import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VacancyRepository } from '../src/database/vacancyRepository.js';

const repo = new VacancyRepository();

test('canImportStatusFromSheets: never resurrects archived rows from sheet', () => {
  assert.equal(repo.canImportStatusFromSheets('archived', 'contacted'), false);
  assert.equal(repo.canImportStatusFromSheets('archived', 'new'), false);
  assert.equal(repo.canImportStatusFromSheets('archived', 'replied'), false);
});

test('canImportStatusFromSheets: still allows normal status updates', () => {
  assert.equal(repo.canImportStatusFromSheets('new', 'contacted'), true);
  assert.equal(repo.canImportStatusFromSheets('contacted', 'replied'), true);
  assert.equal(repo.canImportStatusFromSheets('contacted', 'new'), false);
});
