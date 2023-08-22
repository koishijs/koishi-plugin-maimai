import { Context, Logger, Schema, h, segment } from 'koishi'
import type { } from 'koishi-plugin-puppeteer'
import type { } from '@koishijs/plugin-help'
import { DivingFish, Zetaraku } from './api';
// import { MaimaiImageDrawer } from './drawing';
import dedent from "dedent";
import { resolve } from 'path';
import { uniq, sortBy } from 'lodash';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

import koaSend from 'koa-send';
import { OnebotMap } from './types';
export const name = 'maimai'

export interface Config {
  developer_token?: string
  diving_fish_api: string
  yuzuai_alias: string
  xray_alias: string
  dev: boolean
}

export const Config: Schema<Config> = Schema.object({
  developer_token: Schema.string(),
  diving_fish_api: Schema.string().role('link').default('https://www.diving-fish.com/').hidden(),
  xray_alias: Schema.string().role('link').default('https://download.fanyu.site/maimai/alias_uc.json').hidden(),
  yuzuai_alias: Schema.string().role('link').default('https://api.yuzuai.xyz/maimaidx/maimaidxalias').hidden(),
  dev: Schema.boolean().default(false).hidden()
})

const logger = new Logger(name)

export const using = ['puppeteer']

export async function apply(ctx: Context, config: Config) {
  let zetarakuData: {
    songs: Zetaraku.MaimaiDX.Music[]
  } = { songs: [] }
  let music: DivingFish.MaimaiDX.Music[] = []
  let final: DivingFish.MaimaiDX.Music[] = []
  const dfHttp = ctx.http.extend({
    endpoint: config.diving_fish_api
  })
  // https://stackoverflow.com/a/19964557/8308032
  const N = 10

  let assetPrefix = (Math.random().toString(36) + '00000000000000000').slice(2, N + 2)
  if (config.dev) assetPrefix = "dev"

  let assetBase = `http://127.0.0.1:${ctx.router.port}/${assetPrefix}/`;
  logger.debug(assetBase)
  // let nameAlias: Record<string, string> = {}
  let idAlias: Record<string, string[]> = {}
  await mkdir(resolve(ctx.baseDir, 'data/maimai/covers-zt'), { recursive: true })
  await mkdir(resolve(ctx.baseDir, 'data/maimai/covers-df'), { recursive: true })


  const downloadImage = async (url: string, dist: string) => {
    try {
      const buffer = await ctx.http.get<ArrayBuffer>(url, {
        headers: { accept: 'image/*' },
        responseType: 'arraybuffer',
      })
      await writeFile(dist, Buffer.from(buffer))
    } catch (e) {
      logger.error('%s %s', url, e.stack)
    }
  }

  const toDivingFishData = (input: Zetaraku.MaimaiDX.Music): DivingFish.MaimaiDX.Music => {
    const dfData = music.find(dfMusic => dfMusic.basic_info.title === input.title && dfMusic.type.toLowerCase()[0] === input.sheets[0].type.toLowerCase()[0])
    // @ts-ignore
    let output: DivingFish.MaimaiDX.Music = {
      // @ts-ignore
      _zetaraku: input,
      id: dfData?.id ?? "-1",
      type: input.sheets[0].type === "dx" ? DivingFish.MaimaiDX.Type.DX : (
        input.sheets[0].type === 'std' ? DivingFish.MaimaiDX.Type.SD : DivingFish.MaimaiDX.Type.UTage
      ),
      basic_info: {
        title: input.songId,
        artist: input.artist,
        genre: input.category,
        release_date: input.releaseDate,
        is_new: dfData?.basic_info.is_new ?? true,
        from: input.category,
        bpm: input.bpm
      },
      level: dfData ? dfData.ds.map(v => v.toString()) : input.sheets.map(v => (v.internalLevel ?? v.level)),
      charts: input.sheets.map(v => ({
        charter: v.noteDesigner,
        notes: []
      }))
    }
    return output
  }

  async function updateData() {
    logger.info('fetching data from zetaraku')
    zetarakuData = await ctx.http.get<{
      songs: Zetaraku.MaimaiDX.Music[]
    }>('https://dp4p6x0xfi5o9.cloudfront.net/maimai/data.json')
    logger.info('fetching data from diving fish')
    music = await DivingFish.MaimaiDX.musicInfo(dfHttp)

    final = []


    for (const ztMusic of zetarakuData.songs) {
      if (ztMusic.sheets.length > 5) { // dx and std
        let objStd = { ...ztMusic, sheets: ztMusic.sheets.filter(v => v.type === "std") }
        let objDx = { ...ztMusic, sheets: ztMusic.sheets.filter(v => v.type === "dx") }
        final.push(toDivingFishData(objStd))
        final.push(toDivingFishData(objDx))
      } else {
        final.push(toDivingFishData(ztMusic))
      }
    }

    final = final.filter(v => v.type !== 'utage')

    // const aliasTmp = await neatCsv(readFile(resolve(__dirname, '../assets/alias-ffbt.csv')).toString(), {
    //   headers: false
    // })
    // nameAlias = {}
    // for (const aliasLine of aliasTmp) {
    //   let data = Object.values(aliasLine) as string[] // id, songName, alias...
    //   let aliases = data.slice(2).filter(v => v)
    //   for (const alias of aliases) {
    //     nameAlias[alias] = data[1]
    //   }
    // }
    idAlias = {}
    try {
      logger.info('fetching data from xray alias')
      const alias = await ctx.http.get<{
        [key: string]: string[]
      }>(config.xray_alias)
      for (const key of Object.keys(alias)) {
        if (alias[key].length) idAlias[key] = [...new Set(alias[key])];
      }
    } catch (e) {
      logger.error(e)
    }
    try {
      logger.info('fetching data from yuzuai alias')
      let tmp = await ctx.http.get<{
        [key: string]: { Name: string; Alias: string[] }
      }>(config.yuzuai_alias)
      for (const key of Object.keys(tmp)) {
        if (tmp[key].Alias.length) {
          for (const alias of tmp[key].Alias.filter(al => al !== tmp[key].Name)) {
            idAlias[alias] ||= []
            idAlias[alias].push(key)
          }
        }
      }
    } catch (e) {
      logger.error(e)
    }
    logger.info('finished')
  }

  await updateData()

  ctx.setInterval(updateData, 1000 * 60 * 60 * 24)

  async function ensureCover(songItem: DivingFish.MaimaiDX.Music) {
    let dfError = false
    if (songItem.id !== "-1") {
      const dfPath = resolve(ctx.baseDir, `data/maimai/covers-df/${DivingFish.MaimaiDX.getCoverPathById(~~songItem.id)}`)
      if (!existsSync(dfPath)) {
        try {
          await downloadImage(`https://www.diving-fish.com/covers/${DivingFish.MaimaiDX.getCoverPathById(~~songItem.id)}`, dfPath)
        } catch (e) {
          dfError = true
          logger.error(e)
        }
      }
    }
    if (songItem.id === "-1" || dfError) {
      const imageName = songItem._zetaraku.imageName
      const ztPath = resolve(ctx.baseDir, `data/maimai/covers-zt/${imageName}`)
      if (!existsSync(ztPath)) {
        await downloadImage(`https://dp4p6x0xfi5o9.cloudfront.net/maimai/img/cover/${imageName}`, ztPath)
      }
    }
  }
  await downloadImage(`https://www.diving-fish.com/covers/00000.png`, resolve(ctx.baseDir, `data/maimai/covers-df/00000.png`))

  const getPotentialSong = (name: string) => {
    name = name.toString()
    // ! 注意 dx sd
    // 颜色开头去掉匹配? TODO
    // 完整名称匹配
    // 是 number, id 匹配
    // 别名匹配
    // 别名匹配: 有别名, 也有完整的歌包含此关键词(len>=2) TODO
    // 搜索匹配
    let result: DivingFish.MaimaiDX.Music[] = []
    const fullMatch = final.filter(v => v.basic_info.title === name)
    if (fullMatch.length) {
      result = fullMatch
    }
    if (/^-?\d+$/.test(name) && final.find(v => v.id === name)) {
      result.push(final.find(v => v.id === name))
    } else {
      if (idAlias[name]?.length) {
        result = result.concat(idAlias[name].filter(v => /^-?\d+$/.test(v)).map(v => final.find(song => song.id === v)))
      }
      // if (nameAlias[name]) {
      //   result.push(final.find(v => v.basic_info.title === nameAlias[name]))
      // }
      if (!fullMatch.length) {
        result = result.concat(final.filter(v => v.basic_info.title.toLowerCase().includes(name.toLowerCase())))
      }
    }
    return uniq(result)
  }
  ctx.on('ready', () => {
    ctx.router.get(`/${assetPrefix}/maimaidx/data/(.*)`, async (koaCtx) => {
      const filename = koaCtx.request.url.slice(`/${assetPrefix}/maimaidx/data`.length)
      return koaSend(koaCtx, filename, {
        root: resolve(ctx.baseDir, './data/maimai/'),
        immutable: true
      })
    })
    ctx.router.get(`/${assetPrefix}/maimaidx/assets/(.*)`, async (koaCtx) => {
      const filename = koaCtx.request.url.slice(`/${assetPrefix}/maimaidx/assets`.length)
      return koaSend(koaCtx, filename, {
        root: resolve(__dirname, '../assets'),
        immutable: true
      })
    })
  })

  ctx.command('maimaidx.song-search <name:text>', '搜歌')
    .alias('搜索 <name>')
    .alias('搜歌 <name>')
    .alias('search <name>')
    .shortcut(/^(.*?)是?什么歌$/, { args: ['$1'] })
    .action(async ({ }, name) => {
      let result = getPotentialSong(name)
      if (!result.length) {
        return '妹这样的歌啊';
      }
      if (result.length > 10) {
        result = result.slice(0, 10)
      }
      for (const songItem of result) {
        try {
          await ensureCover(songItem)
        } catch (e) {
          logger.error(e)
        }
      }
      // console.time('ppt')
      let page = await ctx.puppeteer.page()
      await page.setViewport({ ...page.viewport(), deviceScaleFactor: 1 })
      await page.goto(`file://${resolve(__dirname, '../assets/tmp.html')}`)
      let files = []
      for (const [idx, song] of result.entries()) {
        const dfPath = resolve(ctx.baseDir, `data/maimai/covers-df/`, DivingFish.MaimaiDX.getCoverPathById(~~song.id))
        try {
          files[idx] = (await readFile(
            (song.id === "-1" || !existsSync(dfPath)) ?
              resolve(ctx.baseDir, `data/maimai/covers-zt/`, song._zetaraku.imageName)
              : dfPath
          )).toString('base64')
        } catch (e) {
          files[idx] = (await readFile(
            resolve(ctx.baseDir, `data/maimai/covers-df/00000.png`)
          )).toString('base64')
        }
      }
      await page.evaluate(({ list, covers, name }) => {
        document.querySelector('#search-result span').textContent = name
        document.querySelector('.search-list').innerHTML = list.map((v, i) => `
        
        <div class="search-card">
      <img class="type-icon" src="../assets/UI_TTR_Infoicon_${v.type === 'DX' ? 'Deluxe' : 'Standard'}Mode.png"></img>
      <slot name="cover">
        <img src="data:image/png;base64,${covers[i]}">
      </slot>
      <span class="id text-shadow">${v.id}</span>
      <main>
        <p class="title">${v.basic_info.title}</p>
        <p class="content">ARTIST ${v.basic_info.artist}</p>
        <p class="content">BPM ${v.basic_info.bpm} | CATEGORY ${v.basic_info.genre}</p>
        <div class="charts text-shadow">
        ${v.level.slice(0, 5).map((ds) => `<span>${ds}</span>`).join('')}
        </div>
      </main>
    </div>`
        ).join('')
      }, { list: result, covers: files, name })
      await page.waitForNetworkIdle()
      const body = await page.$('body')
      const clip = await body.boundingBox()
      let r = await page.screenshot({
        clip,
        type: "png"
      })
      // console.timeEnd('ppt')
      return [result.map(v => v.basic_info.title).join('\n'), h.image(r, 'image/png')]
    });

  ctx.command('maimaidx.song-probe <name:text>', '什么分')
    .shortcut(/^(.*)(?:什么|多少)分$/, { args: ['$1'] })
    .option('user', '-u [username:string] 用户名')
    .option('qid', '--qid [qid:string] QQ')
    .action(async ({ options, session }, name) => {
      let result = getPotentialSong(name)
      if (!result.length) {
        return '妹这样的歌啊';
      }

      let list: DivingFish.MaimaiDX.Chart[];
      let b40: DivingFish.MaimaiDX.UserBest40;
      try {
        b40 = await DivingFish.MaimaiDX.b40(dfHttp, options?.qid ?? session.userId, options?.user);
        let b50 = await DivingFish.MaimaiDX.dev(dfHttp, config.developer_token, b40.username);
        list = b50.records
      } catch (e) {
        if (e.response.data.message) {
          return dedent`
              获取 B50 时出现错误: 
              ${e.response.data.message}
              请检查用户是否在水鱼查分器上绑定或用户名是否正确
          `;
        }
      }

      await session.execute('maimaidx.song-search ' + name)

      let score = []
      for (const song of result) {
        const record = list.filter(v => v.song_id.toString() === song.id.toString()).sort((a, b) => a.level_index - b.level_index)
        if (record.length) {
          score.push(`[${song.type}][${song.basic_info.title}]\n` + record.map(v => `${v.level_label} ${v.level}: ${v.achievements}%(${[v.rate, v.fs, v.fc].filter(v => v).map(v => v.toUpperCase()).join(" ")
            }) DX Rating: ${v.ra}`).join('\n'))
        }
      }
      if (score.length) return score.join('\n')
    });

  ctx.command('maimaidx.status', { hidden: true })
    .action(() => {
      return `Diving Fish: ${music.length}\nZT: ${zetarakuData.songs.length}\nFinal: ${final.length}\nIDALIAS: ${Object.keys(idAlias).length}`
    })

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
      let b40: DivingFish.MaimaiDX.UserBest40;
      try {
        b40 = await DivingFish.MaimaiDX.b40(dfHttp, options?.qid ?? session.userId, options?.user);
      } catch (e) {
        if (e.response.data.message) {
          return dedent`
              获取 B50 时出现错误: 
              ${e.response.data.message}
              请检查用户是否在水鱼查分器上绑定或用户名是否正确
          `;
        }
      }

      const dataTime = new Date().valueOf() - start.valueOf();
      start = new Date();

      // const drawer = new MaimaiImageDrawer();
      // drawer.setCoversBase(resolve(ctx.baseDir, 'data/maimai/'))
      for (const chart of [...b40.charts.dx, ...b40.charts.sd]) {
        const dfPath = resolve(ctx.baseDir, `data/maimai/covers-df/${DivingFish.MaimaiDX.getCoverPathById(chart.song_id)}`)
        if (!existsSync(dfPath)) {
          await downloadImage(`https://www.diving-fish.com/covers/${DivingFish.MaimaiDX.getCoverPathById(chart.song_id)}`, dfPath)
        }
      }
      // const img = await drawer.drawBest40(dfHttp, b40);
      // drawer.free();
      let page = await ctx.puppeteer.page();
      await page.goto(`${assetBase}maimaidx/assets/b50.html`)
      await page.setViewport({ ...page.viewport(), deviceScaleFactor: 1 })
      await page.evaluate((data, assetBase) => {
        // @ts-ignore
        window.app.resp = data
        // @ts-ignore
        window.app.assetBase = assetBase
      }, b40, assetBase)
      const body = await page.$('body')
      const clip = await body.boundingBox()

      await page.waitForNetworkIdle({
        idleTime: 10
      })
      let r = await page.screenshot({
        clip,
        type: "png"
      })
      const drawTime = new Date().valueOf() - start.valueOf();

      return `数据查询耗时 ${dataTime}ms\n绘图耗时 ${drawTime}ms\n` + h.image(r, 'image/png');
    })

  ctx.command('maimaidx.ranking', 'Rating 排行')
    .option('user', '-u [username:string] 用户名')
    .option('qid', '--qid [qid:string] QQ')
    .action(async ({ options, session }) => {
      let r = await ctx.http.get<{
        username: string
        ra: number
      }[]>(config.diving_fish_api + 'api/maimaidxprober/rating_ranking')

      // let globals = r.reduce((obj, val) => {
      //   obj[val.ra] ||= 0
      //   obj[val.ra]++
      //   return obj
      // }, {})
      // const highchartsInput = r.map(v => v.ra)
      // console.log(highchartsInput)
      // require('fs').writeFileSync('./data.json', JSON.stringify(highchartsInput))

      let b40: DivingFish.MaimaiDX.UserBest40;
      try {
        b40 = await DivingFish.MaimaiDX.b40(dfHttp, options?.qid ?? session.userId, options?.user);
      } catch (e) {
        if (e.response.data.message) {
          return dedent`
            获取 B50 时出现错误: 
            ${e.response.data.message}
            请检查用户是否在水鱼查分器上绑定或用户名是否正确
        `;
        }
      }
      const userRating = r.find(v => v.username === b40.username)
      if (!userRating) return `没有找到?`
      const sorted = r.sort((a, b) => a.ra - b.ra).reverse()
      const index = sorted.map(v => v.ra).indexOf(userRating.ra)
      return dedent`你 (${b40.username}) Rating 为 ${userRating.ra}
      排名 ${index + 1}/${sorted.length}
      玩家平均 Rating ${sorted.reduce((a, b) => a + b.ra, 0) / sorted.length}`
    })


  // Function to convert degree to radian



  function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    var radius = 6371; // km     

    //convert latitude and longitude to radians
    const deltaLatitude = (lat2 - lat1) * Math.PI / 180;
    const deltaLongitude = (lon2 - lon1) * Math.PI / 180;

    const halfChordLength = Math.cos(
      lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
      * Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2)
      + Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2);

    const angularDistance = 2 * Math.atan2(Math.sqrt(halfChordLength), Math.sqrt(1 - halfChordLength));

    return radius * angularDistance;
  }

  ctx.platform('onebot').command('maimaidx.nearby')
    .shortcut('附近mai')
    .action(async ({ session }) => {
      const input = await session.prompt(30000)
      const parsed = h.parse(input)
      if (!parsed?.[0]?.attrs?.data) return
      const userLoc = JSON.parse(parsed[0].attrs.data) as OnebotMap
      const remote = await ctx.http.get('https://map.bemanicn.com/dxmap', {
        headers: {
          'X-Inertia': 'true'
        }
      })
      type DxMapItem = {
        shop_id: number
        longitude: string
        latitude: string
        arcadeName: string
        machineCount: number
        tempLnglat: string
        address: string
      }
      const list: DxMapItem[] = remote.props.dxlist
      const lat = parseFloat(userLoc.meta["Location.Search"].lat);
      const lng = parseFloat(userLoc.meta["Location.Search"].lng);
      const calc = (shop: DxMapItem) => {
        let { latitude, longitude } = shop
        if (shop.tempLnglat) {
          [longitude, latitude] = shop.tempLnglat.split(',')
        }


        return haversineDistance(
          lat,
          lng,
          parseFloat(latitude),
          parseFloat(longitude)
        )
      }
      let tmp = list.map(v => ({ ...v, distance: calc(v) }))
      let sorted = sortBy(tmp, ['distance'])
      let mcdInfo = ""
      try {
        const mcd = await ctx.http.post('https://www.mcdonalds.com.cn/ajaxs/search_by_point', `point=${lat},${lng}`)
        mcdInfo = mcd.data.slice(0, 2)?.map(v => `${v.title} ${v._distance / 1000}km`).join("\n")
      } catch (e) {
        logger.error(e)
      }


      return [sorted.slice(0, 5).map(v => `${v.arcadeName} ${v.distance.toFixed(2)}km ${v.machineCount} 台`).join('\n'), mcdInfo].join("\n")
    })

  ctx.command('maimaidx.alias-search <name:text>', '查询别名')
    .alias('查询别名 <name>')
    .action(async ({ }, name) => {
      let result = getPotentialSong(name)
      if (!result.length) {
        return '妹这样的歌啊';
      }
      const [song] = result
      let aliases = []
      for (const key of Object.keys(idAlias)) {
        if (idAlias[key].includes(song.id)) {
          aliases.push(key)
        }
      }
      return aliases.join("\n")
    })

  // ctx.command('maimaidx.statistics')
  //   .option('user', '-u [username:string] 用户名')
  //   .option('qid', '--qid [qid:string] QQ')
  //   .action(async ({ session, options }) => {
  //     let list: DivingFish.MaimaiDX.Chart[];
  //     let b40: DivingFish.MaimaiDX.UserBest40;
  //     try {
  //       b40 = await DivingFish.MaimaiDX.b40(dfHttp, options?.qid ?? session.userId, options?.user);
  //       let b50 = await DivingFish.MaimaiDX.dev(dfHttp, config.developer_token, b40.username);
  //       list = b50.records
  //     } catch (e) {
  //       if (e.response.data.message) {
  //         return dedent`
  //             获取 B50 时出现错误: 
  //             ${e.response.data.message}
  //             请检查用户是否在水鱼查分器上绑定或用户名是否正确
  //         `;
  //       }
  //     }
  //     let fcCount = list.filter(v => v.fc).length
  //     return `FC: ${fcCount}`
  //   })
}
