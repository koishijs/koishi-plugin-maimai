import { Quester } from "koishi";

export namespace DivingFish.MaimaiDX {
    // const BASE = 'https://www.diving-fish.com/api';

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
        _dxScoreNew?: number;
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
        _zetaraku?: Zetaraku.MaimaiDX.Music
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

    let _musicDataCache: Music[] | undefined = undefined;

    export async function musicInfo(http: Quester): Promise<Music[]> {
        while (!_musicDataCache) {
            const response = await http.get(`/api/maimaidxprober/music_data`);
            _musicDataCache = response;
        }

        return _musicDataCache;
    }

    export async function b40(http: Quester, qq: string, username?: string): Promise<UserBest40> {
        const response = await http.post(`/api/maimaidxprober/query/player`, username ? { username, b50: true } : { qq, b50: true }, {
            headers: {
                'content-type': 'application/json'
            },
        });

        return response;
    }

    export async function dev(http: Quester, developer_token: string, username?: string): Promise<{
        username: string
        records: Chart[]
        additional_rating: number
    }> {
        const response = await http.get(`/api/maimaidxprober/dev/player/records`, {
            params: {
                username
            },
            headers: {
                'content-type': 'application/json',
                'developer-token': developer_token
            },
        });

        return response;
    }

    export function getCoverPathById(i: number) {
        if (i > 10000 && i <= 11000) i -= 10000;
        return (i + "").padStart(5, '0') + ".png";
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
}

export namespace Zetaraku.MaimaiDX {
    export interface Sheet {
        type: string;
        internalLevel: any;
        internalLevelValue: any;
        level: string;
        difficulty: string;
        levelValue: number;
        regions: {
            jp: boolean;
            intl: boolean;
            cn: boolean;
        }
        version: string;
        noteDesigner: string;
    }
    export interface Music {
        artist: string;
        bpm: number;
        category: string;
        imageName: string;
        isLocked: boolean;
        isNew: boolean;
        releaseDate: string;
        songId: string;
        title: string;
        version: string;
        sheets: Sheet[]
    }
}