export type Evidence = {
  url: string;
  title: string;
  excerpt: string;
  weight: number;
};

export type RankInput = {
  evidence: Evidence[];
  maxResults: number;
};

export type SolveSig = (input: RankInput) => Evidence[];
