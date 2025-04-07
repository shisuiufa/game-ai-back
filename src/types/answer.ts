export interface Answer {
    userId: number,
    answer: string,
    time: string
}

export interface ScoredAnswer {
    userId: number;
    answer: string;
    score: number;
    time: string;
}