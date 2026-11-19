import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { asQuestion, checkPrint, PRINTS, printIdOf, type PrintFile } from '../src/lib/prints.ts';
import type { Question } from '../src/lib/types.ts';

const qids = new Set<string>(
  readdirSync('public/data')
    .filter((f) => /^exam-\d+\.json$/.test(f))
    .flatMap((f) => (JSON.parse(readFileSync(`public/data/${f}`, 'utf8')) as { questions: Question[] }).questions.map((q) => q.id)),
);

describe('類題プリントのデータ', () => {
  for (const p of PRINTS) {
    it(`${p.id}：決まりどおり（ID・選択肢・答え・解説・関連する過去問）`, () => {
      const file = JSON.parse(readFileSync(`public/data/prints/${p.id}.json`, 'utf8')) as PrintFile;
      expect(checkPrint(file, qids)).toEqual([]);
    });
  }

  it('決まりに合わないデータを見つける', () => {
    const file = JSON.parse(readFileSync('public/data/prints/law-1.json', 'utf8')) as PrintFile;
    const q = file.questions[0]!;
    const bad: PrintFile = {
      ...file,
      questions: [{ ...q, answer: 5, related: ['99-01'], explanation: { ...q.explanation, perChoice: ['x'] } }, ...file.questions.slice(1)],
    };
    const errors = checkPrint(bad, qids).join('\n');
    expect(errors).toContain('answer が不正');
    expect(errors).toContain('99-01');
    expect(errors).toContain('perChoice');
  });

  it('問題IDからプリントIDを取り出し、解説の部品に渡せる形にする', () => {
    expect(printIdOf('law-1-03')).toBe('law-1');
    const file = JSON.parse(readFileSync('public/data/prints/law-1.json', 'utf8')) as PrintFile;
    const q = asQuestion(file, file.questions[4]!);
    expect(q).toMatchObject({ id: 'law-1-05', fieldId: 'law', answer: 3, altAnswers: [4], images: [] });
  });
});
