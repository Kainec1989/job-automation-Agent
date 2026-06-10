import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rankVacanciesByFit, scoreVacancyFit } from '../src/dispatcher/vacancyFitScore.js';

describe('vacancyFitScore', () => {
  it('prefers junior TypeScript roles over senior mismatches', () => {
    const junior = scoreVacancyFit({
      title: 'Junior TypeScript Developer',
      company: 'Acme',
      type: 'junior',
      description: 'React, Node.js, QA automation',
      email: 'bewerbung@acme.de',
    });

    const senior = scoreVacancyFit({
      title: 'Senior Java Architect',
      company: 'Other',
      type: 'junior',
      description: 'Lead architect role',
      email: 'hr@other.de',
    });

    assert.ok(junior > senior);
  });

  it('ranks higher-fit vacancies first', () => {
    const ranked = rankVacanciesByFit([
      {
        id: 1,
        title: 'Senior Manager',
        company: 'A',
        type: 'junior',
        description: 'senior lead architect',
        email: 'hr@a.de',
        dispatch_retry_count: 0,
      },
      {
        id: 2,
        title: 'Junior QA Engineer',
        company: 'B',
        type: 'junior',
        description: 'typescript react test automation',
        email: 'bewerbung@b.de',
        dispatch_retry_count: 0,
      },
    ]);

    assert.equal(ranked[0]?.id, 2);
    assert.ok((ranked[0]?.fitScore ?? 0) > (ranked[1]?.fitScore ?? 0));
  });
});
