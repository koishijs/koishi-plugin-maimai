import { existsSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { Service, Quester, Context, Logger, Dict } from 'koishi';
import uniq from 'lodash.uniq'
import { resolve } from 'path';
import { DataSource, calcRating } from './source/base';
import { DivingFish } from './source/df';
import { Lxns } from './source/lxns';
import { Config } from './index';
import koaSend from 'koa-send'
import type { } from '@koishijs/plugin-server'

export class Maimai extends Service {
  static inject = ['puppeteer', 'server'];
  logger: Logger;
  // zetarakuData: {
  //   songs: Zetaraku.MaimaiDX.Music[]
  // } = { songs: [] }
  music: DataSource.MaimaiDX.Music[] = [];
  dfHttp: Quester;
  idAlias: Record<string, string[]> = {};
  config: Config;
  assetBase: string;
  assetPrefix: string;

  sources: DataSource[] = [];
  get preferred() {
    return this.sources.find(v => v.id === this.config.preferred);
  }

  // toDivingFishData(input: Zetaraku.MaimaiDX.Music): DivingFish.MaimaiDX.Music {
  //   const dfData = this.music.find(dfMusic => dfMusic.title === input.title && dfMusic.type.toLowerCase()[0] === input.sheets[0].type.toLowerCase()[0])
  //   // @ts-ignore
  //   let output: DivingFish.MaimaiDX.Music = {
  //     // @ts-ignore
  //     _zetaraku: input,
  //     id: dfData?.id ?? "-1",
  //     type: input.sheets[0].type === "dx" ? DivingFish.MaimaiDX.Type.DX : (
  //       input.sheets[0].type === 'std' ? DivingFish.MaimaiDX.Type.SD : DivingFish.MaimaiDX.Type.UTage
  //     ),
  //     basic_info: {
  //       title: input.songId,
  //       artist: input.artist,
  //       genre: input.category,
  //       release_date: input.releaseDate,
  //       is_new: dfData?.basic_info.is_new ?? true,
  //       from: input.category,
  //       bpm: input.bpm
  //     },
  //     level: dfData ? dfData.ds.map(v => v.toString()) : input.sheets.map(v => (v.internalLevel ?? v.level)),
  //     charts: input.sheets.map(v => ({
  //       charter: v.noteDesigner,
  //       notes: []
  //     }))
  //   }
  //   return output
  // }
  constructor(ctx: Context, config: Config) {
    super(ctx, 'maimai');
    this.logger = ctx.logger('maimai');
    this.config = config;
    const N = 10;

    this.assetPrefix = (Math.random().toString(36) + '00000000000000000').slice(2, N + 2);
    if (this.config.dev) this.assetPrefix = "dev";

    this.assetBase = `http://127.0.0.1:${ctx.server.port}/${this.assetPrefix}/`;
    this.logger.debug(this.assetBase);

    const dfHttp = ctx.http.extend({
      endpoint: config.divingFish.endpoint,
      ...config.quester
    });
    const lxHttp = ctx.http.extend({
      endpoint: config.lxns.endpoint,
      headers: {
        Authorization: config.lxns.token
      },
      ...config.quester
    });
    const df = new DivingFish(ctx, dfHttp);
    const lxns = new Lxns(ctx, lxHttp);
    this.sources.push(df);
    this.sources.push(lxns);
    this.ctx.inject(['maimai'], (ctx) => {
      this.sources.forEach(v => v.ctx = ctx);
    });
  }

  async _updateData() {
    // logger.info('fetching data from zetaraku')
    // this.zetarakuData = await this.ctx.http.get<{
    //   songs: Zetaraku.MaimaiDX.Music[]
    // }>('https://dp4p6x0xfi5o9.cloudfront.net/maimai/data.json')
    this.logger.info('fetching data from peferred data source');
    // this.final = []
    this.music = await this.musicInfo();

    // for (const ztMusic of this.zetarakuData.songs) {
    //   if (ztMusic.sheets.length > 5) { // dx and std
    //     let objStd = { ...ztMusic, sheets: ztMusic.sheets.filter(v => v.type === "std") }
    //     let objDx = { ...ztMusic, sheets: ztMusic.sheets.filter(v => v.type === "dx") }
    //     this.final.push(this.toDivingFishData(objStd))
    //     this.final.push(this.toDivingFishData(objDx))
    //   } else {
    //     this.final.push(this.toDivingFishData(ztMusic))
    //   }
    // }
    // this.final = this.final.filter(v => v.type !== 'utage')
    // alias -> id[]
    let idAlias: Dict<string[]> = {};
    try {
      this.logger.info('fetching data from xray alias');
      const alias = await this.ctx.http.get<{
        [key: string]: string[];
      }>(this.ctx.config.xray_alias);
      for (const key of Object.keys(alias)) {
        for (const songAlias of alias[key]) {
          idAlias[songAlias] ||= []
          idAlias[songAlias].push(key)
        }
      }
    } catch (e) {
      this.logger.error(e);
    }
    try {
      this.logger.info('fetching data from yuzuai alias')
      let tmp = await this.ctx.http.get<{
        [key: string]: { Name: string; Alias: string[] }
      }>(this.config.yuzuai_alias)
      for (const key of Object.keys(tmp)) {
        if (tmp[key].Alias.length) {
          for (const alias of tmp[key].Alias.filter(al => al !== tmp[key].Name)) {
            idAlias[alias] ||= []
            idAlias[alias].push(key)
          }
        }
      }
    } catch (e) {
      this.logger.error(e)
    }
    this.idAlias = idAlias;
    this.logger.info('finished');
  }

  async updateData() {
    let time = 0;
    while (time <= 5) {
      try {
        await this._updateData();
        break;
      } catch (e) {
        this.logger.error(e);
        time++;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }


  async musicInfo() {
    return this.preferred.list();
  }


  getPotentialSong(name: string) {
    name = name.toString();
    // ! 注意 dx sd
    // 颜色开头去掉匹配? TODO
    // 完整名称匹配
    // 是 number, id 匹配
    // 别名匹配
    // 别名匹配: 有别名, 也有完整的歌包含此关键词(len>=2) TODO
    // 搜索匹配
    const { music, idAlias } = this;
    let result: DataSource.MaimaiDX.Music[] = [];
    const fullMatch = music.filter(v => v.title === name);
    if (fullMatch.length) {
      result = fullMatch;
    }
    if (/^-?\d+$/.test(name) && music.find(v => v.id.toString() === name)) {
      result.push(music.find(v => v.id.toString() === name));
    } else {
      if (idAlias[name]?.length) {
        result = [...result,
        ...idAlias[name].filter(v => /^-?\d+$/.test(v)).map(v => music.find(song => +v === song.id))
        ];
      }
      // if (nameAlias[name]) {
      //   result.push(final.find(v => v.basic_info.title === nameAlias[name]))
      // }
      if (!fullMatch.length) {
        result = result.concat(music.filter(v => v.title.toLowerCase().includes(name.toLowerCase())));
      }
    }
    return uniq(result).filter(Boolean);
  }

  async downloadImage(url: string, dist: string) {
    try {
      const buffer = await this.ctx.http.get<ArrayBuffer>(url, {
        headers: { accept: 'image/*' },
        responseType: 'arraybuffer',
      });
      await writeFile(dist, Buffer.from(buffer));
    } catch (e) {
      this.logger.error('%s %s', url, e.stack);
    }
  }


  async drawBest50(b40: DataSource.MaimaiDX.UserBest50, dataFrom: string = "DIVING FISH") {
    let suggestions: Dict<string[]> = {};
    if (b40.standard.length) {
      let b35Sugg = this.suggestions(b40.standard[b40.standard.length - 1].dx_rating);
      suggestions['b35'] = [`SSS+ ${b35Sugg[0]}`, `SSS ${b35Sugg[1]}`, `SS+ ${b35Sugg[2]}`]
    }
    if (b40.dx.length) {
      let b15Sugg = this.suggestions(b40.dx[b40.dx.length - 1].dx_rating);
      suggestions['b15'] = [`SSS+ ${b15Sugg[0]}`, `SSS ${b15Sugg[1]}`, `SS+ ${b15Sugg[2]}`]
    }
    let page = await this.ctx.puppeteer.page();
    await page.goto(`${this.assetBase}maimaidx/assets/b50.html`);
    await page.setViewport({ ...page.viewport(), deviceScaleFactor: 1 });
    await page.evaluate((data, assetBase, dataFrom, suggestions) => {
      // @ts-ignore
      window.app.resp = data;
      // @ts-ignore
      window.app.assetBase = assetBase;
      // @ts-ignore
      window.app.dataFrom = dataFrom;
      // @ts-ignore
      window.app.suggestions = suggestions;
    }, b40, this.assetBase, dataFrom, suggestions);
    const body = await page.$('body');
    const clip = await body.boundingBox();

    await page.waitForNetworkIdle({
      idleTime: 10
    });
    let r = await page.screenshot({
      clip,
      type: "jpeg",
      quality: 90
    });
    await page.close()
    return r;
  }

  async ensureCover(_id: string | number) {
    let id = +_id > 10000 ? +_id - 10000 : +_id;
    let path1 = resolve(this.ctx.baseDir, `data/maimai/covers-t2d/UI_Jacket_${id.toString().padStart(6, '0')}.png`);
    if (existsSync(path1)) {
      this.logger.debug('use preloaded resource, %s', id);
      return `covers-t2d/UI_Jacket_${id.toString().padStart(6, '0')}.png`;
    }

    const { filename, uri } = this.preferred.cover(+_id);
    let path2 = resolve(this.ctx.baseDir, `data/maimai/covers-id/${filename}`);
    if (existsSync(path2)) return `covers-id/${filename}`;

    for (const remote of uri) {
      try {
        const buffer = await this.ctx.http.get<ArrayBuffer>(remote, {
          headers: { accept: 'image/*' },
          responseType: 'arraybuffer',
        });
        await writeFile(path2, Buffer.from(buffer));
        return `covers-id/${filename}`;
      } catch (e) {
        this.logger.error(`download image failed, %s`, remote);
        this.logger.error(e);
      }
    }

    throw new Error("use default");
    // if (songItem.id === "-1" || dfError) {
    //   const imageName = songItem._zetaraku.imageName
    //   const ztPath = resolve(this.ctx.baseDir, `data/maimai/covers-zt/${imageName}`)
    //   if (!existsSync(ztPath)) {
    //     await this.downloadImage(`https://dp4p6x0xfi5o9.cloudfront.net/maimai/img/cover/${imageName}`, ztPath)
    //   }
    // }
  }

  async start() {
    // await mkdir(resolve(this.ctx.baseDir, 'data/maimai/covers-zt'), { recursive: true })
    await mkdir(resolve(this.ctx.baseDir, 'data/maimai/covers-id'), { recursive: true });

    this.ctx.server.get(`/${this.assetPrefix}/maimaidx/data/(.*)`, async (koaCtx) => {
      const filename = koaCtx.request.url.slice(`/${this.assetPrefix}/maimaidx/data`.length);
      return koaSend(koaCtx, filename, {
        root: resolve(this.ctx.baseDir, './data/maimai/'),
        immutable: true
      });
    });
    this.ctx.server.get(`/${this.assetPrefix}/maimaidx/covers/:id.png`, async (koaCtx) => {
      const { id } = koaCtx.params;
      try {
        let localFilename = await this.ensureCover(id);
        return koaSend(koaCtx, localFilename, {
          root: resolve(this.ctx.baseDir, './data/maimai/'),
          immutable: true
        });
      } catch (e) {
        return koaSend(koaCtx, 'UI_Jacket_000000.png', {
          root: resolve(__dirname, '../assets'),
          immutable: true
        });
      }
    });
    this.ctx.server.get(`/${this.assetPrefix}/maimaidx/assets/(.*)`, async (koaCtx) => {
      const filename = koaCtx.request.url.slice(`/${this.assetPrefix}/maimaidx/assets`.length);
      return koaSend(koaCtx, filename, {
        root: resolve(__dirname, '../assets'),
        immutable: true
      });
    });
    await this.updateData();
  }

  suggestions(bottom: number) {
    let result = [];
    let flag1 = false, flag2 = false, flag3 = false;
    for (let i = 0; i <= 15; i += 0.1) {
      if (Math.floor(calcRating(i, 100.5) / 10) > bottom && !flag1) {
        result.push(i.toFixed(1));
        flag1 = true;
      }
      if (Math.floor(calcRating(i, 100) / 10) > bottom && !flag2) {
        result.push(i.toFixed(1));
        flag2 = true;
      }
      if (Math.floor(calcRating(i, 99.5) / 10) > bottom && !flag3) {
        result.push(i.toFixed(1));
        flag3 = true;
      }
    }
    return result;
  }
}
