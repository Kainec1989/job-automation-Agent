import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildAnschreiben,
  buildEmailBody,
  pickSkillBullets,
  selectTemplateType,
} from '../src/sender/anschreibenTemplates.js';

const juniorVacancy = {
  title: 'Junior Frontend Developer (m/w/d)',
  company: 'Codewerk GmbH',
  type: 'junior' as const,
  description: 'React, TypeScript, Node.js, Playwright',
};

const praktikumVacancy = {
  title: 'Praktikum Softwareentwicklung Informatik',
  company: 'Muster AG',
  type: 'praktikum' as const,
  description: 'Praktikum mit React und Node.js',
};

describe('selectTemplateType', () => {
  it('accepts junior and praktikum', () => {
    assert.equal(selectTemplateType('junior'), 'junior');
    assert.equal(selectTemplateType('praktikum'), 'praktikum');
  });

  it('throws for invalid type', () => {
    assert.throws(() => selectTemplateType('senior' as 'junior'), /Invalid vacancy type/);
  });
});

describe('pickSkillBullets', () => {
  it('includes React bullets when description mentions React', () => {
    const bullets = pickSkillBullets(juniorVacancy.title, juniorVacancy.description);
    assert.ok(bullets.some((bullet) => /React/i.test(bullet)));
  });

  it('includes Playwright when QA stack is mentioned', () => {
    const bullets = pickSkillBullets(juniorVacancy.title, juniorVacancy.description);
    assert.ok(bullets.some((bullet) => /Playwright|Testautomatisierung/i.test(bullet)));
  });
});

describe('buildAnschreiben', () => {
  it('builds subject with role and company', () => {
    const { subject } = buildAnschreiben(juniorVacancy);
    assert.match(subject, /^Bewerbung als /);
    assert.match(subject, /Codewerk GmbH$/);
    assert.match(subject, /Junior Frontend Developer/);
  });

  it('uses Praktikum prefix in subject for praktikum type', () => {
    const { subject } = buildAnschreiben(praktikumVacancy);
    assert.match(subject, /Praktikum/);
    assert.match(subject, /Muster AG$/);
  });

  it('includes German greeting and closing', () => {
    const { text } = buildAnschreiben(juniorVacancy);
    assert.match(text, /Sehr geehrte Damen und Herren/);
    assert.match(text, /Mit freundlichen Grüßen/);
  });
});

describe('buildEmailBody', () => {
  it('mentions company and includes skill section', () => {
    const body = buildEmailBody(juniorVacancy);
    assert.match(body, /Codewerk GmbH/);
    assert.match(body, /Besonders relevant für Ihre Anforderungen:/);
    assert.match(body, /Im Anhang:/);
  });

  it('uses praktikum-specific hook', () => {
    const body = buildEmailBody(praktikumVacancy);
    assert.match(body, /praktische Erfahrung/i);
    assert.doesNotMatch(body, /Fullstack Web Developer\. Ich bringe Node\.js/i);
  });

  it('uses junior-specific hook', () => {
    const body = buildEmailBody(juniorVacancy);
    assert.match(body, /Fullstack Web Developer/);
    assert.match(body, /Node\.js\/TypeScript/i);
  });
});
