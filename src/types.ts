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