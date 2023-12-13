import { Context, Logger, Quester, Schema, Service, h, segment } from 'koishi'
import type { } from 'koishi-plugin-puppeteer'
import type { } from '@koishijs/plugin-help'
import { DivingFish } from './source/df';
import { Lxns } from './source/lxns';
import dedent from "dedent";
import { resolve } from 'path';
import { uniq } from 'lodash';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

import koaSend from 'koa-send';
import { DataSource, calcRating, ratingTable } from './source/base';
export const name = 'maimai'
export * from './types'

export interface Config {
  yuzuai_alias: string
  xray_alias: string
  dev: boolean
  divingFish: {
    token?: string
    endpoint: string
  }
  lxns: {
    token: string
    endpoint: string
  }
  preferred: 'lxns' | 'df'
  quester: Quester.Config
}

export const Config: Schema<Config> = Schema.object({
  divingFish: Schema.object({
    token: Schema.string().description('仅"查单曲分数"功能需要此 Token, 请联系水鱼获取'),
    endpoint: Schema.string().role('link').default('https://www.diving-fish.com/').hidden(),
  }),
  lxns: Schema.object({
    token: Schema.string().description('接入落雪咖啡屋查分器时, 使用所有功能都需要此 Token, 请前往 [落雪咖啡屋](https://maimai.lxns.net) 获取'),
    endpoint: Schema.string().role('link').default('https://maimai.lxns.net/api/v0/maimai/').hidden(),
  }),
  preferred: Schema.union([
    Schema.const('lxns').description('落雪咖啡屋 maimai DX 查分器'),
    Schema.const('df').description('水鱼查分器'),
  ]).role('radio').description('首选 API').default('lxns'),
  xray_alias: Schema.string().role('link').default('https://download.fanyu.site/maimai/alias.json').hidden(),
  yuzuai_alias: Schema.string().role('link').default('https://api.yuzuai.xyz/maimaidx/maimaidxalias').hidden(),
  dev: Schema.boolean().default(false).hidden(),
  quester: Quester.Config
})


export const inject = ['puppeteer', 'router']

declare module 'koishi' {
  interface Context {
    maimai: Maimai
  }
}

export class Maimai extends Service {
  static inject = ['puppeteer', 'router']
  logger: Logger
  // zetarakuData: {
  //   songs: Zetaraku.MaimaiDX.Music[]
  // } = { songs: [] }
  music: DataSource.MaimaiDX.Music[] = []
  dfHttp: Quester
  idAlias: Record<string, string[]> = {}
  config: Config
  assetBase: string
  assetPrefix: string

  sources: DataSource[] = []
  get preferred() {
    return this.sources.find(v => v.id === this.config.preferred)
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
    super(ctx, 'maimai')
    this.logger = ctx.logger('maimai')
    this.config = config
    const N = 10

    this.assetPrefix = (Math.random().toString(36) + '00000000000000000').slice(2, N + 2)
    if (this.config.dev) this.assetPrefix = "dev"

    this.assetBase = `http://127.0.0.1:${ctx.router.port}/${this.assetPrefix}/`;
    this.logger.debug(this.assetBase)

    const dfHttp = ctx.http.extend({
      endpoint: config.divingFish.endpoint,
      ...config.quester
    })
    const lxHttp = ctx.http.extend({
      endpoint: config.lxns.endpoint,
      headers: {
        Authorization: config.lxns.token
      },
      ...config.quester
    })
    const df = new DivingFish(ctx, dfHttp)
    const lxns = new Lxns(ctx, lxHttp)
    this.sources.push(df)
    this.sources.push(lxns)
    this.ctx.inject(['maimai'], (ctx) => {
      this.sources.forEach(v => v.ctx = ctx)
    })
  }

  async _updateData() {
    // logger.info('fetching data from zetaraku')
    // this.zetarakuData = await this.ctx.http.get<{
    //   songs: Zetaraku.MaimaiDX.Music[]
    // }>('https://dp4p6x0xfi5o9.cloudfront.net/maimai/data.json')
    this.logger.info('fetching data from peferred data source')
    // this.final = []
    this.music = await this.musicInfo()

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

    let idAlias = {}
    try {
      this.logger.info('fetching data from xray alias')
      const alias = await this.ctx.http.get<{
        [key: string]: string[]
      }>(this.ctx.config.xray_alias)
      for (const key of Object.keys(alias)) {
        if (alias[key].length) idAlias[key] = [...new Set(alias[key])];
      }
    } catch (e) {
      this.logger.error(e)
    }
    // try {
    //   logger.info('fetching data from yuzuai alias')
    //   let tmp = await this.ctx.http.get<{
    //     [key: string]: { Name: string; Alias: string[] }
    //   }>(this.config.yuzuai_alias)
    //   for (const key of Object.keys(tmp)) {
    //     if (tmp[key].Alias.length) {
    //       for (const alias of tmp[key].Alias.filter(al => al !== tmp[key].Name)) {
    //         idAlias[alias] ||= []
    //         idAlias[alias].push(key)
    //       }
    //     }
    //   }
    // } catch (e) {
    //   logger.error(e)
    // }
    this.idAlias = idAlias
    this.logger.info('finished')
  }

  async updateData() {
    let time = 0;
    while (time <= 5) {
      try {
        await this._updateData();
        break;
      } catch (e) {
        this.logger.error(e)
        time++
        await new Promise(r => setTimeout(r, 1000))
      }
    }
  }


  async musicInfo() {
    return this.preferred.list()
  }


  getPotentialSong(name: string) {
    name = name.toString()
    // ! 注意 dx sd
    // 颜色开头去掉匹配? TODO
    // 完整名称匹配
    // 是 number, id 匹配
    // 别名匹配
    // 别名匹配: 有别名, 也有完整的歌包含此关键词(len>=2) TODO
    // 搜索匹配
    const { music, idAlias } = this
    let result: DataSource.MaimaiDX.Music[] = []
    const fullMatch = music.filter(v => v.title === name)
    if (fullMatch.length) {
      result = fullMatch
    }
    if (/^-?\d+$/.test(name) && music.find(v => v.id.toString() === name)) {
      result.push(music.find(v => v.id.toString() === name))
    } else {
      if (idAlias[name]?.length) {
        result = [...result,
        ...idAlias[name].filter(v => /^-?\d+$/.test(v)).map(v => music.find(song => +v === song.id))
        ]
      }
      // if (nameAlias[name]) {
      //   result.push(final.find(v => v.basic_info.title === nameAlias[name]))
      // }
      if (!fullMatch.length) {
        result = result.concat(music.filter(v => v.title.toLowerCase().includes(name.toLowerCase())))
      }
    }
    return uniq(result).filter(Boolean)
  }

  async downloadImage(url: string, dist: string) {
    try {
      const buffer = await this.ctx.http.get<ArrayBuffer>(url, {
        headers: { accept: 'image/*' },
        responseType: 'arraybuffer',
      })
      await writeFile(dist, Buffer.from(buffer))
    } catch (e) {
      this.logger.error('%s %s', url, e.stack)
    }
  }


  async drawBest50(b40: DataSource.MaimaiDX.UserBest50, dataFrom: string = "DIVING FISH") {
    let b35Sugg = this.suggestions(b40.standard[b40.standard.length - 1].dx_rating)
    let b15Sugg = this.suggestions(b40.dx[b40.dx.length - 1].dx_rating)
    // console.log(b35Sugg, b15Sugg)
    const suggestions = [
      [`SSS+ ${b35Sugg[0]}`, `SSS ${b35Sugg[1]}`, `SS+ ${b35Sugg[2]}`],
      [`SSS+ ${b15Sugg[0]}`, `SSS ${b15Sugg[1]}`, `SS+ ${b15Sugg[2]}`]
    ]
    let page = await this.ctx.puppeteer.page();
    await page.goto(`${this.assetBase}maimaidx/assets/b50.html`)
    await page.setViewport({ ...page.viewport(), deviceScaleFactor: 1 })
    await page.evaluate((data, assetBase, dataFrom, suggestions) => {
      // @ts-ignore
      window.app.resp = data
      // @ts-ignore
      window.app.assetBase = assetBase
      // @ts-ignore
      window.app.dataFrom = dataFrom
      // @ts-ignore
      window.app.suggestions = suggestions
    }, b40, this.assetBase, dataFrom, suggestions)
    const body = await page.$('body')
    const clip = await body.boundingBox()

    await page.waitForNetworkIdle({
      idleTime: 10
    })
    let r = await page.screenshot({
      clip,
      type: "png"
    })
    return r
  }

  async ensureCover(_id: string | number) {
    let id = +_id > 10000 ? +_id - 10000 : +_id
    let path1 = resolve(this.ctx.baseDir, `data/maimai/covers-t2d/UI_Jacket_${id.toString().padStart(6, '0')}.png`)
    if (existsSync(path1)) {
      this.logger.debug('use preloaded resource, %s', id)
      return `covers-t2d/UI_Jacket_${id.toString().padStart(6, '0')}.png`
    }

    const { filename, uri } = this.preferred.cover(+_id)
    let path2 = resolve(this.ctx.baseDir, `data/maimai/covers-id/${filename}`)
    if (existsSync(path2)) return `covers-id/${filename}`

    for (const remote of uri) {
      try {
        const buffer = await this.ctx.http.get<ArrayBuffer>(remote, {
          headers: { accept: 'image/*' },
          responseType: 'arraybuffer',
        })
        await writeFile(path2, Buffer.from(buffer))
        return `covers-id/${filename}`
      } catch (e) {
        this.logger.error(`download image failed, %s`, remote)
        this.logger.error(e)
      }
    }

    throw new Error("use default")
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
    await mkdir(resolve(this.ctx.baseDir, 'data/maimai/covers-id'), { recursive: true })

    this.ctx.router.get(`/${this.assetPrefix}/maimaidx/data/(.*)`, async (koaCtx) => {
      const filename = koaCtx.request.url.slice(`/${this.assetPrefix}/maimaidx/data`.length)
      return koaSend(koaCtx, filename, {
        root: resolve(this.ctx.baseDir, './data/maimai/'),
        immutable: true
      })
    })
    this.ctx.router.get(`/${this.assetPrefix}/maimaidx/covers/:id.png`, async (koaCtx) => {
      const { id } = koaCtx.params
      try {
        let localFilename = await this.ensureCover(id)
        return koaSend(koaCtx, localFilename, {
          root: resolve(this.ctx.baseDir, './data/maimai/'),
          immutable: true
        })
      } catch (e) {
        return koaSend(koaCtx, 'UI_Jacket_000000.png', {
          root: resolve(__dirname, '../assets'),
          immutable: true
        })
      }
    })
    this.ctx.router.get(`/${this.assetPrefix}/maimaidx/assets/(.*)`, async (koaCtx) => {
      const filename = koaCtx.request.url.slice(`/${this.assetPrefix}/maimaidx/assets`.length)
      return koaSend(koaCtx, filename, {
        root: resolve(__dirname, '../assets'),
        immutable: true
      })
    })
    await this.updateData()
  }

  suggestions(bottom: number) {
    let result = []
    let flag1 = false, flag2 = false, flag3 = false
    for (let i = 0; i <= 15; i += 0.1) {
      if (Math.floor(calcRating(i, 100.5) / 10) > bottom && !flag1) {
        result.push(i.toFixed(1))
        flag1 = true
      }
      if (Math.floor(calcRating(i, 100) / 10) > bottom && !flag2) {
        result.push(i.toFixed(1))
        flag2 = true
      }
      if (Math.floor(calcRating(i, 99.5) / 10) > bottom && !flag3) {
        result.push(i.toFixed(1))
        flag3 = true
      }
    }
    return result
  }
}

export * from './source/base'

export async function apply(ctx: Context, config: Config) {
  ctx.plugin(Maimai, config)
  ctx.inject(['maimai'], async (ctx) => {
    ctx.command('maimaidx.song-search <name:text>', '搜歌')
      .alias('搜索 <name>')
      .alias('搜歌 <name>')
      .alias('search <name>')
      .shortcut(/^(.*?)是?什么歌$/, { args: ['$1'] })
      .action(async ({ session }, name) => {
        let result = ctx.maimai.getPotentialSong(name.trim())
        if (name.trim().match(/^#\d+/)) {
          const matched = parseInt(name.trim().match(/^#(\d+)/)[1])
          if (matched >= 1 && matched <= 35) {
            let b50: DataSource.MaimaiDX.UserBest50;
            try {
              b50 = await ctx.maimai.preferred.b50(session.userId);
            } catch (e) { }
            if (b50) {
              const song1 = b50.standard[matched - 1], song2 = b50.dx[matched - 1]
              if (song1) {
                // @TODO score to song function
                result.push(ctx.maimai.music.find(v => v.id % 10000 === song1.id && v.type === song1.type))
              }
              if (song2) {
                result.push(ctx.maimai.music.find(v => v.id % 10000 === song2.id && v.type === song2.type))
              }
            }
          }
        }
        if (!result.length) {
          return '妹这样的歌啊';
        }
        if (result.length > 10) {
          result = result.slice(0, 10)
        }
        // console.time('ppt')
        let page = await ctx.puppeteer.page()
        await page.setViewport({ ...page.viewport(), deviceScaleFactor: 1 })
        await page.goto(`file://${resolve(__dirname, '../assets/search.html')}`)
        await page.evaluate(({ list, name, assetBase }) => {
          document.querySelector('#search-result span').textContent = name
          document.querySelector('.search-list').innerHTML = list.map((v, i) => `
        
        <div class="search-card">
      <img class="type-icon" src="../assets/UI_TTR_Infoicon_${v.type === 'dx' ? 'Deluxe' : 'Standard'}Mode.png"></img>
      <slot name="cover">
        <img src="${assetBase}maimaidx/covers/${v.id}.png">
      </slot>
      <span class="id text-shadow">${v.id}</span>
      <main>
        <p class="title">${v.title}</p>
        <p class="content">ARTIST ${v.artist}</p>
        <p class="content">BPM ${v.bpm} | CATEGORY ${v.genre}</p>
        <div class="charts text-shadow">
        ${v.difficulties.map(v => v.level_value).slice(0, 5).map((ds) => `<span>${ds}</span>`).join('')}
        </div>
      </main>
    </div>`
          ).join('')
        }, { list: result, name, assetBase: ctx.maimai.assetBase })
        await page.waitForNetworkIdle()
        const body = await page.$('body')
        const clip = await body.boundingBox()
        let r = await page.screenshot({
          clip,
          type: "png"
        })
        // console.timeEnd('ppt')
        return [result.map(v => v.title).join('\n'), h.image(r, 'image/png')]
      });

    ctx.command('maimaidx.song-probe <name:text>', '什么分')
      .shortcut(/^(.*)(?:什么|多少)分$/, { args: ['$1'] })
      .option('user', '-u [username:string] 用户名/好友码')
      .option('qid', '--qid [qid:string] QQ')
      .action(async ({ options, session }, name) => {
        let result = ctx.maimai.getPotentialSong(name)
        if (!result.length) {
          return '妹这样的歌啊';
        }

        let list: DataSource.MaimaiDX.Score[];
        try {
          // b40 = await ctx.maimai.b40(options?.qid ?? session.userId, options?.user);
          list = await ctx.maimai.preferred.score(options.qid ?? session.userId, result);
        } catch (e) {
          if (e.response?.data?.message) {
            return dedent`
              获取 B50 时出现错误: 
              ${e.response.data.message}
          `;
          }
        }

        const labels = ["Basic", "Advanced", "Expert", "Master", "Re:MASTER"]
        let score = []
        for (const song of result) {
          const record = list.filter(v => v.id === song.id).sort((a, b) => a.level_index - b.level_index)
          if (record.length) {
            score.push(`[${song.type}][${song.title}]\n` + record.map(v => `${labels[v.level_index]} ${v.level}: ${v.achievements}%(${[v.rate, v.fs, v.fc].filter(v => v).map(v => v.toUpperCase()).join(" ")
              }) DX Rating: ${v.dx_rating}`).join('\n'))
          }
        }
        await session.execute('maimaidx.song-search ' + name)
        if (score.length) return score.join('\n')
      });

    // ctx.command('maimaidx.status', { hidden: true })
    //   .action(() => {
    //     return `Diving Fish: ${music.length}\nZT: ${zetarakuData.songs.length}\nFinal: ${final.length}\nIDALIAS: ${Object.keys(idAlias).length}`
    //   })

    ctx.command('maimaidx.b50', '查询B50')
      .alias('b40')
      .alias('逼40')
      .alias('b50')
      .alias('逼50')
      .alias('逼四十')
      .alias('逼五十')
      .alias('我是二次元')
      .option('user', '-u [username:string] 用户名')
      .option('qid', '--qid [qid:string] QQ')
      .action(async ({ options, session }) => {
        await session.send('正在获取B50中, 请坐和放宽');
        let start = new Date();
        let b50: DataSource.MaimaiDX.UserBest50;
        try {
          b50 = await ctx.maimai.preferred.b50(options?.qid ?? session.userId);
        } catch (e) {
          ctx.logger('maimai').error(e)
          if (e.response.data.message) {
            return dedent`
              获取 B50 时出现错误: 
              ${e.response.data.message}
              请检查用户是否在 ${ctx.maimai.preferred.name} 上绑定或用户名是否正确
          `;
          }
        }

        const dataTime = new Date().valueOf() - start.valueOf();
        start = new Date();

        let r = await ctx.maimai.drawBest50(b50);
        const drawTime = new Date().valueOf() - start.valueOf();

        return `数据查询耗时 ${dataTime}ms\n绘图耗时 ${drawTime}ms\n` + h.image(r, 'image/png');
      })

    // ctx.command('maimaidx.ranking', 'Rating 排行')
    //   .option('user', '-u [username:string] 用户名')
    //   .option('qid', '--qid [qid:string] QQ')
    //   .action(async ({ options, session }) => {
    //     let r = await ctx.http.get<{
    //       username: string
    //       ra: number
    //     }[]>(config.diving_fish_api + 'api/maimaidxprober/rating_ranking')

    //     // let globals = r.reduce((obj, val) => {
    //     //   obj[val.ra] ||= 0
    //     //   obj[val.ra]++
    //     //   return obj
    //     // }, {})
    //     // const highchartsInput = r.map(v => v.ra)
    //     // console.log(highchartsInput)
    //     // require('fs').writeFileSync('./data.json', JSON.stringify(highchartsInput))

    //     let b40: DivingFish.MaimaiDX.UserBest40;
    //     try {
    //       b40 = await ctx.maimai.b40(options?.qid ?? session.userId, options?.user);
    //     } catch (e) {
    //       if (e.response.data.message) {
    //         return dedent`
    //         获取 B50 时出现错误: 
    //         ${e.response.data.message}
    //         请检查用户是否在水鱼查分器上绑定或用户名是否正确
    //     `;
    //       }
    //     }
    //     const userRating = r.find(v => v.username === b40.username)
    //     if (!userRating) return `没有找到?`
    //     const sorted = r.sort((a, b) => a.ra - b.ra).reverse()
    //     const index = sorted.map(v => v.ra).indexOf(userRating.ra)
    //     return dedent`你 (${b40.username}) Rating 为 ${userRating.ra}
    //   排名 ${index + 1}/${sorted.length}
    //   玩家平均 Rating ${sorted.reduce((a, b) => a + b.ra, 0) / sorted.length}`
    //   })

    ctx.command('maimaidx.alias-search <name:text>', '查询别名')
      .alias('查询别名 <name>')
      .action(async ({ }, name) => {
        let result = ctx.maimai.getPotentialSong(name)
        if (!result.length) {
          return '妹这样的歌啊';
        }
        const [song] = result
        let aliases = []
        for (const key of Object.keys(ctx.maimai.idAlias)) {
          if (ctx.maimai.idAlias[key].includes(song.id.toString())) {
            aliases.push(key)
          }
        }
        return aliases.join("\n")
      })

    ctx.command('maimaidx.rating-calc <ds:number> <ach:number>', '计算 Rating', { checkArgCount: true })
      .check(({ }, ds, ach) => (ds < 0 || ds > 15 || ach < 0 || ach > 101) ? '?' : null)
      .action(async ({ }, ds, ach) => {
        return (calcRating(ds, ach) / 10).toString()
      })

    ctx.command('maimaidx.rating-list <ds:number>', '由定数列举 Rating', { checkArgCount: true })
      .shortcut(/定数\s*((?:1[0-5]|[1-9])(?:\.\d)?)\s*rating/, { args: ['$1'] })
      .action(async ({ }, ds) => {
        function generateRatings(ds: number, ratingTable: number[][]) {
          let result = [];

          for (let i = 0; i < ratingTable.length; i++) {
            const [score, _] = ratingTable[i];
            const ratingAtJump = calcRating(ds, score);
            result.push([score, ratingAtJump]);

            if (i < ratingTable.length - 1) {
              const nextScore = ratingTable[i + 1][0];
              const step = (score - nextScore) / 4;
              if (step <= 0.001) continue
              for (let j = 1; j <= 3; j++) {
                const intermediateScore = score - step * j;
                const intermediateRating = calcRating(ds, intermediateScore);
                result.push([intermediateScore, intermediateRating]);
              }
            }
          }

          return result.sort((a, b) => b[0] - a[0]);
        }

        // 成绩, 计算后的分数
        const result = generateRatings(ds, ratingTable.slice(0, 13)) // >= 80
          .map(v => [Math.floor(v[0] * 1000) / 1000, Math.floor(v[1] / 10)])

        return ctx.puppeteer.render(`<html>
      <body style="width: 200px">
      <table style="width: 100%">
      ${result.map(v => `<tr><td>${v[0]}</td><td>${v[1]}</td></tr>`).join('')}
      </table>
      </body>
      </html>`)
      })
  })
}
