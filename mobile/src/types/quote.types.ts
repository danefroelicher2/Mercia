export interface Quote {
  id: number;
  text: string;
  author: string;
}

export interface QuoteRatingsStorage {
  [quoteId: number]: number; // rating from 1-5
}
