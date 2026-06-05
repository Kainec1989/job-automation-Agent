import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emailMatchesCompanyDomain } from '../src/enrichment/tavily/companyMatch.js';
import {
  buildHrEmailSearchQueries,
  compactCompanyName,
} from '../src/enrichment/tavily/queries.js';

describe('compactCompanyName', () => {
  it('strips legal suffixes', () => {
    assert.equal(compactCompanyName('SachsenEnergie AG'), 'SachsenEnergie');
    assert.equal(compactCompanyName('Codewerk GmbH'), 'Codewerk');
  });
});

describe('buildHrEmailSearchQueries', () => {
  it('adds domain-impressum strategy for German GmbH', () => {
    const strategies = buildHrEmailSearchQueries({
      company: 'SachsenEnergie AG',
      title: 'Junior Developer',
      jobUrl: 'https://example.com/job',
    });

    assert.equal(strategies[0]?.name, 'domain-impressum');
    assert.match(strategies[0]!.query, /SachsenEnergie AG/);
    assert.match(strategies[0]!.query, /impressum/i);
  });

  it('includes karriere-impressum for all companies', () => {
    const strategies = buildHrEmailSearchQueries({
      company: 'Remote Jobs Inc',
      title: 'Developer',
      jobUrl: 'https://example.com/job',
    });

    assert.ok(strategies.some((strategy) => strategy.name === 'karriere-impressum'));
    assert.ok(strategies.some((strategy) => strategy.name === 'bewerbung-kontakt'));
  });
});

describe('emailMatchesCompanyDomain', () => {
  it('matches company slug in domain', () => {
    assert.equal(
      emailMatchesCompanyDomain('karriere@sachsenenergie.de', 'SachsenEnergie AG'),
      true,
    );
  });

  it('rejects unrelated domain', () => {
    assert.equal(
      emailMatchesCompanyDomain('jobs@totally-unrelated.io', 'SachsenEnergie AG'),
      false,
    );
  });
});
