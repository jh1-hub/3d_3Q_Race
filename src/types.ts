export type Rarity = 'C' | 'R' | 'SR' | 'UR';

export interface TermData {
  id: number;
  name: string;
  descriptions: string[];
  rarity: Rarity;
  flavorTexts: string[];
}

export interface Subcategory {
  id: string;
  title: string;
  terms: TermData[];
}

export interface Category {
  id: string;
  title: string;
  subcategories: Subcategory[];
}

export interface UnitStats {
  correct: number;
  attempts: number;
}

export interface GameStats {
  totalCorrect: number;
  totalAttempts: number;
}

export interface TermStat {
  correct: number;
  attempts: number;
}

export type TermStats = Record<number, TermStat>;

export interface FlatTerm {
  categoryId: string;
  categoryTitle: string;
  subcategoryId: string;
  subcategoryTitle: string;
  term: TermData;
}

export interface CollectedCardEntry {
  termId: number;
  count: number;
  firstCollectedAt: number;
  lastCollectedAt: number;
}

export type CardCollectionMap = Record<number, CollectedCardEntry>;
