import { DataSource } from "./base";

export class Lxns extends DataSource {
  id = "lxns"
  name = "maimai.lxns.net"
  async list() {
    let { songs } = await this.http.get<{
      songs: Lxns.MaimaiDX.Music[]
    }>(`/song/list`)

    let result: Lxns.MaimaiDX.FlattenedMusic[] = []
    for (let music of songs) {
      const { difficulties, ...rest } = music
      if (difficulties.dx?.length) {

        result = result.concat({
          type: "dx",
          ...rest,
          id: rest.id + 10000,
          difficulties: difficulties.dx
        })
      }
      if (difficulties.standard?.length) {

        result = result.concat({
          type: "standard",
          ...rest,
          difficulties: difficulties.standard
        })
      }
    }
    return result;

  }

  async b50(userId: string) {
    const { data: player } = await this.http.get<Response<Lxns.MaimaiDX.UserInfo>>(`/player/qq/${userId}`)
    let { data } = await this.http.get<Response<Lxns.MaimaiDX.UserBest50>>(`/player/${player.friend_code}/bests`)
    data.dx = data.dx.map(score => {
      const song = this.ctx.maimai.music.find(music => music.id % 10000 === score.id && music.type === score.type)
      return {
        ...score,
        level: song.difficulties[score.level_index].level_value.toString()
      }
    })
    data.standard = data.standard.map(score => {
      const song = this.ctx.maimai.music.find(music => music.id % 10000 === score.id && music.type === score.type)
      return {
        ...score,
        level: song.difficulties[score.level_index].level_value.toString()
      }
        })
    return { ...data, ...player }
  }
  async score(qq: string, songs: Partial<DataSource.MaimaiDX.Music>[]) {
    const { data: player } = await this.http.get<Response<Lxns.MaimaiDX.UserInfo>>(`/player/qq/${qq}`)
    let result: DataSource.MaimaiDX.Score[] = []
    for (const song of songs) {
      let { data } = await this.http.get<Response<DataSource.MaimaiDX.Score[]>>(`/player/${player.friend_code}/bests`, {
        params: {
          song_id: song.id % 10000,
          song_type: song.type
        }
      })
      result = [...result, ...data]
    }
    result = result.map(score => ({
      ...score,

      id: score.type === 'dx' ? score.id + 10000 : score.id,
    }))
    return result
  }
  cover(id: number) {
    let _ = id % 10000
    return {
      filename: `${_.toString()}.png`,
      uri: [
        `https://lxns.org/maimai/jacket/${_.toString()}.png`,
        // `https://lxns.org/maimai/jacket/0.png`,
      ]
    }
  }
}

type Response<T> = {
  success: boolean;
  code: number;
  data: T
}

export namespace Lxns.MaimaiDX {
  export interface UserInfo {
    name: string
    rating: number
    friend_code: number
  }
  export interface UserBest50 {
    standard_total: number
    dx_total: number
    standard: Score[]
    dx: Score[]
  }
  export interface Score {
    id: number
    song_name: string
    level: string
    level_index: number
    achievements: number // max 101
    fc: string | null
    fs: string | null
    dx_score: number
    dx_rating: number
    rate: string
    type: string
  }
  export interface Difficulty {
    type?: string
    difficulty: number
    level: string
    level_value: number
    note_designer: string
    version?: number
  }
  export interface Music {
    id: number;
    title: string;
    artist: string;
    genre: string;
    bpm: number;
    version: number;
    difficulties: {
      standard: Difficulty[]
      dx: Difficulty[]
    }
  }
  export interface FlattenedMusic {
    id: number;
    type: string;
    title: string;
    artist: string;
    genre: string;
    bpm: number;
    version?: number;
    difficulties: Difficulty[]
  }
}