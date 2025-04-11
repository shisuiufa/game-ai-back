import {UserWs} from "./user";

export interface Answer {
    userId: number,
    answer: string,
    time: string,
    hidden?: boolean,
}

export interface ScoredAnswer {
    userId: number;
    answer: string;
    score: number;
    time: string;
}

export interface ScoredAnswerWithUser {
    user: UserWs,
    answer: string,
    score: number;
    time: string;
}