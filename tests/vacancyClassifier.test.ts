import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyVacancy } from '../src/scraper/vacancyClassifier.js';

describe('classifyVacancy', () => {
  it('accepts junior React developer', () => {
    const result = classifyVacancy(
      'Junior Frontend Developer (m/w/d)',
      'React, TypeScript, Node.js',
      'Codewerk GmbH',
    );
    assert.equal(result.isFit, true);
    assert.equal(result.type, 'junior');
    assert.equal(result.statsKey, 'accepted_junior');
  });

  it('accepts praktikum with IT signal in title', () => {
    const result = classifyVacancy(
      'Praktikum Softwareentwicklung Informatik',
      'Wir bieten ein Praktikum',
      'Muster AG',
    );
    assert.equal(result.isFit, true);
    assert.equal(result.type, 'praktikum');
  });

  it('rejects praktikum without IT signal in title', () => {
    const result = classifyVacancy(
      'Praktikant Verwaltung',
      'React und TypeScript im Team',
      'Firma GmbH',
    );
    assert.equal(result.isFit, false);
    assert.equal(result.statsKey, 'praktikum_no_it');
  });

  it('rejects werkstudent and working student titles', () => {
    const werkstudent = classifyVacancy(
      'Werkstudent Softwareentwicklung (m/w/d)',
      'TypeScript, React, Node.js',
      'Mercedes-Benz AG',
    );
    assert.equal(werkstudent.isFit, false);
    assert.equal(werkstudent.statsKey, 'title_blacklist');

    const workingStudent = classifyVacancy(
      'Working Student Frontend Engineer (m/f/d)',
      'React, TypeScript',
      'Raisin',
    );
    assert.equal(workingStudent.isFit, false);
    assert.equal(workingStudent.statsKey, 'title_blacklist');
  });

  it('classifies CHECK24-style junior fullstack as junior, not praktikum from description', () => {
    const result = classifyVacancy(
      'Junior Fullstack Developer',
      'Wir suchen Verstärkung. Praktikum möglich.',
      'CHECK24 GmbH',
    );
    assert.equal(result.isFit, true);
    assert.equal(result.type, 'junior');
  });

  it('rejects senior in title', () => {
    const result = classifyVacancy('Senior React Developer', 'TypeScript', 'Tech GmbH');
    assert.equal(result.isFit, false);
    assert.equal(result.statsKey, 'title_blacklist');
  });

  it('rejects lead engineer', () => {
    const result = classifyVacancy('Lead Software Engineer', 'Node.js', 'Startup GmbH');
    assert.equal(result.isFit, false);
    assert.equal(result.statsKey, 'title_blacklist');
  });

  it('rejects Java in title', () => {
    const result = classifyVacancy('Java Developer', 'Spring Boot', 'Bank AG');
    assert.equal(result.isFit, false);
    assert.equal(result.statsKey, 'title_blacklist');
  });

  it('rejects C# / .NET in description', () => {
    const result = classifyVacancy(
      'Software Developer',
      'Erfahrung mit C#.NET und ASP.NET',
      'Firma GmbH',
    );
    assert.equal(result.isFit, false);
    assert.equal(result.statsKey, 'foreign_stack_blacklist');
  });

  it('rejects embedded firmware role', () => {
    const result = classifyVacancy('Embedded Software Engineer', 'C++ Firmware', 'Auto GmbH');
    assert.equal(result.isFit, false);
    assert.equal(result.statsKey, 'title_blacklist');
  });

  it('rejects business analyst', () => {
    const result = classifyVacancy('Business Analyst IT', 'Anforderungen', 'Consulting AG');
    assert.equal(result.isFit, false);
    assert.equal(result.statsKey, 'title_blacklist');
  });

  it('rejects non-IT mechanic role', () => {
    const result = classifyVacancy('Kfz-Mechatroniker', 'Werkstatt', 'Garage GmbH');
    assert.equal(result.isFit, false);
    assert.equal(result.statsKey, 'non_it_blacklist');
  });

  it('rejects sub-tech only without core stack', () => {
    const result = classifyVacancy('IT Support', 'Docker und Linux', 'Hosting GmbH');
    assert.equal(result.isFit, false);
    assert.equal(result.statsKey, 'sub_tech_only');
  });

  it('rejects vacancy with no tech signals', () => {
    const result = classifyVacancy('Office Assistant', 'Büroorganisation', 'Büro GmbH');
    assert.equal(result.isFit, false);
    assert.equal(result.statsKey, 'no_tech');
  });

  it('rejects Crossing Hurdles recruiter', () => {
    const result = classifyVacancy(
      'Frontend Engineer | Remote',
      'React remote job',
      'Crossing Hurdles',
    );
    assert.equal(result.isFit, false);
    assert.equal(result.statsKey, 'recruiter_blacklist');
  });

  it('rejects Hire Feed recruiter', () => {
    const result = classifyVacancy(
      'Frontend Developer (Remote)',
      'React',
      'Hire Feed',
    );
    assert.equal(result.isFit, false);
    assert.equal(result.statsKey, 'recruiter_blacklist');
  });

  it('rejects remote US style title for non-German company', () => {
    const result = classifyVacancy(
      'JavaScript Developer | $55/hr Remote',
      'US only',
      'Remote Jobs Inc',
    );
    assert.equal(result.isFit, false);
    assert.equal(result.statsKey, 'recruiter_blacklist');
  });

  it('does not reject remote marker for German GmbH', () => {
    const result = classifyVacancy(
      'Junior Developer | Remote',
      'React TypeScript',
      'Leipzig Digital GmbH',
    );
    assert.equal(result.isFit, true);
    assert.equal(result.type, 'junior');
  });

  it('accepts testautomatisierer role', () => {
    const result = classifyVacancy(
      'Junior Testautomatisierer',
      'Playwright, QA',
      'SachsenEnergie AG',
    );
    assert.equal(result.isFit, true);
    assert.equal(result.type, 'junior');
  });

  it('rejects experience blacklist senior in description when title is generic', () => {
    const result = classifyVacancy(
      'Software Engineer',
      'Mindestens 5 Jahre als Senior Developer',
      'Corp GmbH',
    );
    assert.equal(result.isFit, false);
    assert.equal(result.statsKey, 'experience_blacklist');
  });
});
