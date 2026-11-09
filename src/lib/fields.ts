import type { FieldId } from './types';

export interface FieldDef {
  id: FieldId;
  name: string;
  short: string;
  from: number;
  to: number;
}

// 分野は問題番号から決まる（SPEC §5。新制度は全回共通）
export const FIELDS: readonly FieldDef[] = [
  { id: 'law', name: '関係法規・制度及び運営管理', short: '関係法規', from: 1, to: 10 },
  { id: 'public_health', name: '公衆衛生・環境衛生', short: '公衆衛生', from: 11, to: 15 },
  { id: 'infection', name: '感染症', short: '感染症', from: 16, to: 20 },
  { id: 'hygiene', name: '衛生管理技術', short: '衛生管理', from: 21, to: 25 },
  { id: 'anatomy', name: '人体の構造及び機能', short: '人体', from: 26, to: 30 },
  { id: 'skin', name: '皮膚科学', short: '皮膚科学', from: 31, to: 35 },
  { id: 'cosmetics', name: '香粧品化学', short: '香粧品化学', from: 36, to: 40 },
  { id: 'theory', name: '文化論及び美容技術理論', short: '文化論・技術理論', from: 41, to: 55 },
];

export function fieldOfNo(no: number): FieldDef {
  const f = FIELDS.find((d) => no >= d.from && no <= d.to);
  if (!f) throw new Error(`問題番号が範囲外です: ${no}`);
  return f;
}

export function fieldById(id: FieldId): FieldDef {
  const f = FIELDS.find((d) => d.id === id);
  if (!f) throw new Error(`不明な分野: ${id}`);
  return f;
}

export const QID_PATTERN = /^(4[1-9]|5[0-4])-(0[1-9]|[1-4][0-9]|5[0-5])$/;
