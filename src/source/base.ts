import { Context, Quester } from "koishi";
import { Lxns } from "./lxns";

export abstract class DataSource {
  superior = false
  name: string
  constructor(public ctx: Context, public http: Quester) {

  }
  async prepare() {

  }

  abstract list(): Promise<DataSource.MaimaiDX.Music[]>

  abstract score(userId: string, songs: Partial<DataSource.MaimaiDX.Music>[]): Promise<DataSource.MaimaiDX.Score[]>
  abstract b50(userId: string): Promise<DataSource.MaimaiDX.UserBest50>
  abstract cover(id: number): {
    filename: string
    uri: string[]
  }
}

const ratingTable = [
  [0.0000, 0],
  [10.0000, 16],
  [20.0000, 32],
  [30.0000, 48],
  [40.0000, 64],
  [50.0000, 80],
  [60.0000, 96],
  [70.0000, 112],
  [75.0000, 120],
  [79.9999, 128],
  [80.0000, 136],
  [90.0000, 152],
  [94.0000, 168],
  [96.9999, 176],
  [97.0000, 200],
  [98.0000, 203],
  [98.9999, 206],
  [99.0000, 208],
  [99.5000, 211],
  [99.9999, 214],
  [100.0000, 216],
  [100.4999, 222],
  [100.5000, 224]
].reverse();

export function calcRating(level: number, score: number) {
  score = Math.min(100.5, score);
  let baseRt = ratingTable.find(v => v[0] <= score)![1];
  return level * (Math.min(100.5, score) / 100) * baseRt;
}

export namespace DataSource.MaimaiDX {
  export type UserBest50 = Lxns.MaimaiDX.UserBest50 & Lxns.MaimaiDX.UserInfo
  export type Difficulty = Lxns.MaimaiDX.Difficulty
  export type Music = Lxns.MaimaiDX.FlattenedMusic
  export type Score = Lxns.MaimaiDX.Score
}