import { DataSource } from "./base";

// @ts-ignore
export class DivingFish extends DataSource {
  name = "水鱼查分器"
  async list() {
    let r = await this.http.get<DivingFish.MaimaiDX.Music[]>(`/api/maimaidxprober/music_data`)
    return r.map(this.convertToNewMusicFormat);
  }

  convertToNewMusicFormat(old: DivingFish.MaimaiDX.Music): DataSource.MaimaiDX.Music {
    return {
      artist: old.basic_info.artist,
      bpm: old.basic_info.bpm,
      genre: old.basic_info.genre,
      type: old.type === 'DX' ? 'dx' : 'standard',
      title: old.basic_info.title,
      id: +old.id,
      difficulties: old.charts.map((v, i) => ({
        difficulty: i,
        level: old.level[i],
        level_value: old.ds[i],
        note_designer: v.charter
      }))
    }
  }

  chartToStandard(old: DivingFish.MaimaiDX.Chart): DataSource.MaimaiDX.Score {
    const { song_id } = old
    return {
      id: song_id,
      song_name: old.title,
      level: old.level_label,
      level_index: old.level_index,
      achievements: old.achievements,
      fc: old.fc,
      fs: old.fs,
      dx_rating: old.dxScore,
      dx_score: old.dxScore,
      rate: old.rate,
      type: old.type === 'DX' ? 'dx' : 'standard'
    }
  }

  async b50(userId: string): Promise<DataSource.MaimaiDX.UserBest50> {
    const r = await this.http.post<DivingFish.MaimaiDX.UserBest40>(`/api/maimaidxprober/query/player`, {
      username: userId,
      qq: userId
    });
    return {
      friend_code: -1,
      standard_total: -1,
      dx_total: -1,
      dx: r.charts.dx.map(this.chartToStandard),
      standard: r.charts.sd.map(this.chartToStandard),
      name: r.nickname,
      rating: r.rating
    }
  }
}

export namespace DivingFish.MaimaiDX {
  export interface ApiMessage {
    message?: string;
  }

  export interface UserBest40 extends ApiMessage {
    additional_rating: number;
    charts: Charts;
    nickname: string;
    plate: string;
    rating: number;
    user_data: null;
    user_id: null;
    username: string;
  }

  export interface UserDev extends ApiMessage {
    additional_rating: number;
    username: string;
    records: Chart[]
  }

  export interface Charts {
    dx: Chart[];
    sd: Chart[];
  }

  export interface Chart {
    achievements: number;
    ds: number;
    dxScore: number;
    fc: FC;
    fs: FS;
    level: string;
    level_index: number;
    level_label: LevelLabel;
    ra: number;
    rate: Rate;
    song_id: number;
    title: string;
    type: Type;
  }

  export enum FC {
    None = "",
    FC = "fc",
    FCP = "fcp",
    AP = "AP",
    APP = "app",
  }

  export enum FS {
    None = "",
    FS = "fs",
    FSP = "fsp",
    FDX = "fdx",
  }

  export enum LevelLabel {
    Basic = "Basic",
    Advanced = "Advanced",
    Expert = "Expert",
    Master = "Master",
    ReMASTER = "Re:MASTER",
  }

  export enum Rate {
    S = "s",
    SP = "sp",
    SSP = "ssp",
    SSSP = "sssp",
    Ss = "ss",
    Sss = "sss",
  }

  export enum Type {
    DX = "DX",
    SD = "SD",
    UTage = "utage"
  }

  export interface Music {
    // _zetaraku?: Zetaraku.MaimaiDX.Music
    id: string;
    title: string;
    type: Type;
    ds: number[];
    level: string[];
    cids: number[];
    charts: {
      notes: number[];
      charter: string;
    }[];
    basic_info: {
      title: string;
      artist: string;
      genre: string;
      bpm: number;
      release_date: string;
      from: string;
      is_new: boolean;
    };
  }

  export function getCoverPathById(i: number) {
    if (i > 10000 && i <= 11000) i -= 10000;
    return (i + "").padStart(5, '0') + ".png";
  }


}