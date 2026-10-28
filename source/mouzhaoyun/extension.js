// 谋赵云 v0.1.2 测试版。设计：辟境归元；代码与打包：OpenAI Codex协助。
// 原创代码MIT；设计文字与用户提供的GPT原画分别署名，见README与LICENSE。
game.import("extension", function(lib, game, ui, get, ai, _status) {
    "use strict";
    const createCore=function createZhaoyunCore(lib, game, ui, get, ai, _status, api) {
  const KONG = 'bjgy_mzy_kongying';
  const GUJU = 'bjgy_mzy_guju';
  const GROWTH = 'bjgy_mzy_guju_growth';
  const TAIL = 'bjgy_mzy_guju_tail';
  const TRACK = 'bjgy_mzy_guju_track';
  const STORE = 'bjgy_mzy_guju_state';
  const MARK = 'bjgyMzyKongying';
  const BACKUP = KONG + '_backup';
  const WUXIE = KONG + '_wuxie';
  const activeUses = new WeakMap();
  const victims = new WeakMap();

  function state(player) {
    if (!player.storage[STORE]) player.storage[STORE] = { deleted: [], layers: 0 };
    return player.storage[STORE];
  }
  function alive(player) {
    return !!player && (typeof player.isIn !== 'function' || player.isIn());
  }
  function nameOf(card) {
    return typeof get.name === 'function' ? get.name(card) : card.name;
  }
  function virtual(info, marker) {
    const data = { name: info[2], isCard: true };
    if (info[3]) data.nature = info[3];
    if (marker) data.storage = { [marker]: true };
    return typeof get.autoViewAs === 'function' ? get.autoViewAs(data) : data;
  }
  // Delay cards such as 闪电/浮雷 have a probabilistic AI damage tag but
  // are not immediate damage cards under the author's confirmed definition.
  // Keep fractional tags on ordinary damage tricks (e.g. 青蒜) meaningful.
  function isDamage(card) {
    if (!card || nameOf(card) === 'shandian') return false;
    const type = get.type(card);
    return (type === 'basic' || type === 'trick') && !!get.tag(card, 'damage');
  }
  function isKongying(event) {
    return !!(event && event.name === 'useCard' && [BACKUP,WUXIE].includes(event.skill) && event.card && event.card.storage && event.card.storage[MARK]);
  }
  api.isKongying = isKongying;

  function canNullify(player) {
    return !!get.info({name:'wuxie'}) && !state(player).deleted.includes('wuxie') && !player.getCards('h').some(isDamage);
  }

  function candidates(player, event) {
    if (!event || event.name === 'chooseToRespond' || event.type === 'chooseToRespond') return [];
    if (player.getCards('h').some(isDamage)) return [];
    const deleted = state(player).deleted;
    return get.inpileVCardList(info => {
      if (info[0] !== 'basic' && info[2] !== 'wuxie') return false;
      if (deleted.includes(info[2])) return false;
      const card = virtual(info, MARK);
      return typeof event.filterCard === 'function' && event.filterCard(card, player, event);
    });
  }

  function repeatedBefore(player, use) {
    if (!isKongying(use)) return false;
    const previous = player.getHistory('useCard');
    const index = previous.indexOf(use);
    // The native engine inserts the current use before useCard1. Inspect
    // only earlier entries, not this use itself nor a later nested use.
    const prior = index >= 0 ? previous.slice(0, index) : previous;
    return prior.some(other => other !== use && isKongying(other) && nameOf(other.card) === nameOf(use.card));
  }
  function repeat(player, use) {
    if (typeof player.hasSkill === 'function' && !player.hasSkill(GUJU)) return false;
    if (!isKongying(use) || use._bjgyMzyGujuHandled) return false;
    use._bjgyMzyGujuHandled = true;
    const data = state(player), name = nameOf(use.card);
    if (data.deleted.includes(name) || !repeatedBefore(player, use)) return false;
    data.deleted.push(name);
    data.layers++;
    // The printed instruction grants these changes for the rest of the game.
    // Keep already earned changes independent of subsequent loss/sealing of
    // 孤拒, while deletion and healing prevention still require the main skill.
    player.addSkill(GROWTH);
    player.markSkill(GROWTH);
    return true;
  }

  function discardCount(phase) {
    return Array.isArray(phase && phase.cards) ? phase.cards.length : 0;
  }
  function tailTarget(player, card, target) {
    // Native canUse(false,false) retains enable/target mods and card-specific
    // conditions while ignoring distance and usage quota. Target number is
    // selected by this skill instead of the printed card's usual target count.
    return alive(target) && player.canUse(card, target, false, false);
  }
  function tailCards(player) {
    return get.inpileVCardList(info => {
      const card = virtual(info);
      return isDamage(card) && game.hasPlayer(target => tailTarget(player, card, target));
    });
  }
  function trackUse(player, use) {
    if (!activeUses.has(player)) activeUses.set(player, new Set());
    activeUses.get(player).add(use);
    victims.set(use, []);
  }
  function matchingUse(damage, player) {
    if (!damage || !(damage.num > 0) || damage.unreal || !damage.card || typeof damage.getParent !== 'function') return null;
    const use = damage.getParent('useCard', true, true);
    if (!use || damage.card !== use.card || !activeUses.get(player)?.has(use)) return null;
    return use;
  }
  function recordDamage(damage, player) {
    const use = matchingUse(damage, player);
    if (!use) return false;
    const list = victims.get(use);
    if (!list.includes(damage.player)) list.push(damage.player);
    return true;
  }
  function damaged(use) {
    return (victims.get(use) || []).slice();
  }
  async function resolveTail(player, count) {
    if (!(count > 0) || !alive(player)) return;
    const cards = tailCards(player);
    if (!cards.length) return;
    const picked = await player.chooseButton(['孤拒：是否视为使用一张伤害牌？', [cards, 'vcard']])
      .set('ai', button => {
        const card = virtual(button.link);
        return typeof player.getUseValue === 'function' ? player.getUseValue(card, false) : 1;
      }).forResult();
    if (!picked.bool || !picked.links?.length || !alive(player)) return;
    const info = picked.links[0];
    if (!tailCards(player).some(item => item[2] === info[2] && item[3] === info[3])) return;
    const card = virtual(info);
    const chosen = await player.chooseTarget(`孤拒：为${get.translation(card)}选择至多${count}名合法目标（无距离和次数限制）`, [1, count],
      (ignored, source, target) => tailTarget(source, card, target))
      .set('card', card)
      .set('ai', target => get.effect(target, card, player, player)).forResult();
    if (!chosen.bool || !chosen.targets?.length || !alive(player)) return;
    const targets = chosen.targets.filter((target, index, all) => all.indexOf(target) === index && tailTarget(player, card, target)).slice(0, count);
    if (!targets.length) return;
    player.logSkill(GUJU, targets);
    const use = player.useCard(card, targets, false);
    use.addCount = false;
    use._bjgyMzyGujuTail = true;
    trackUse(player, use);
    player.addSkill(TRACK);
    try {
      await use;
      if (!alive(player)) return;
      for (const target of damaged(use)) {
        if (!alive(player)) break;
        if (!alive(target)) continue;
        const can = target.countDiscardableCards(player, 'hej') > 0;
        if (can) await player.discardPlayerCard(target, 'hej', true);
      }
    } finally {
      activeUses.get(player)?.delete(use);
      // Nested uses retain their own tracker until their own resolution ends.
      if (!activeUses.get(player)?.size) player.removeSkill(TRACK);
    }
  }

  api.core = { state, candidates, isDamage, repeatedBefore, repeat, discardCount, tailTarget, tailCards, trackUse, recordDamage, damaged, resolveTail };

  const skills = {
    [KONG]: {
      enable: 'chooseToUse',
      group: [WUXIE],
      filter(event, player) { return event.type !== 'wuxie' && candidates(player, event).length > 0; },
      chooseButton: {
        dialog(event, player) { return ui.create.dialog('空营', [candidates(player, event), 'vcard']); },
        filter(button, player) {
          const event = typeof get.event === 'function' ? get.event().getParent() : _status.event.getParent();
          return candidates(player, event).some(info => info[2] === button.link[2] && info[3] === button.link[3]);
        },
        check(button) {
          const player = typeof get.player === 'function' ? get.player() : _status.event.player;
          return typeof player.getUseValue === 'function' ? player.getUseValue(virtual(button.link, MARK)) : 1;
        },
        backup(links) {
          return {
            selectCard: -1,
            filterCard: () => false,
            viewAs: { name: links[0][2], nature: links[0][3], isCard: true, storage: { [MARK]: true } },
            log: false,
            async precontent(event, trigger, player) { player.logSkill(KONG); },
          };
        },
        prompt(links) { return `视为使用${get.translation(links[0][3]) || ''}${get.translation(links[0][2])}`; },
      },
      hiddenCard(player, name) {
        if(name==='wuxie')return canNullify(player);
        return !state(player).deleted.includes(name) && !player.getCards('h').some(isDamage) && lib.inpile.includes(name) && (get.type(name) === 'basic' || name === 'wuxie');
      },
      ai: {
        order: 10,
        respondSha: true,
        respondShan: true,
        save: true,
        skillTagFilter(player, tag, arg) {
          if (arg === 'respond') return false;
          if (tag === 'save') return skills[KONG].hiddenCard(player, 'tao') || arg === player && skills[KONG].hiddenCard(player, 'jiu');
          const names = { respondSha: 'sha', respondShan: 'shan' };
          const name = names[tag];
          if (name) return skills[KONG].hiddenCard(player, name);
        },
        result: { player: 1 },
      },
    },
    [BACKUP]: {},
    // Follow the stock twyingji_wuxie route: a static viewAs lets hasWuxie
    // discover a material-free response before opening chooseToUse. It is a
    // grouped part of 空营, not an independently granted permanent skill.
    [WUXIE]: {
      enable:'chooseToUse',sourceSkill:KONG,
      viewAs:{name:'wuxie',isCard:true,storage:{[MARK]:true}},
      viewAsFilter(player){return player.hasSkill(KONG)&&canNullify(player);},
      filter(event,player){
        return event.type==='wuxie' && player.hasSkill(KONG) && canNullify(player)
          && typeof event.filterCard==='function' && event.filterCard(virtual(['trick','','wuxie'],MARK),player,event);
      },
      selectCard:-1,filterCard:()=>false,log:false,
      prompt:'空营：视为使用一张【无懈可击】',
      async precontent(event,trigger,player){player.logSkill(KONG);},
      ai:{order:4,result:{player:1}},
    },
    [GUJU]: {
      locked: true,
      forced: true,
      popup: false,
      trigger: { player: ['useCard1', 'recoverBefore'] },
      group: [TAIL],
      filter(event, player) {
        if (event.name === 'recover') return event.num > 0 && !!event.source && event.source !== player;
        return isKongying(event) && !event._bjgyMzyGujuHandled;
      },
      async content(event, trigger, player) {
        if (trigger.name === 'recover') {
          if (trigger.num > 0 && trigger.source && trigger.source !== player) trigger.cancel();
        } else repeat(player, trigger);
      },
    },
    [GROWTH]: {
      charlotte: true,
      forced: true,
      popup: false,
      trigger: { player: 'drawBefore' },
      filter(event, player) { return event.num > 0 && state(player).layers > 0; },
      async content(event, trigger, player) { if (trigger.num > 0) trigger.num += state(player).layers; },
      mod: {
        cardUsable(card, player, num) { if (nameOf(card) === 'sha' && typeof num === 'number') return num + state(player).layers; },
        maxHandcard(player, num) { return num - state(player).layers; },
      },
      mark: true,
      marktext: '拒',
      intro: {
        content(storage, player) {
          const data = state(player);
          return `已删除空营牌名：${data.deleted.length ? get.translation(data.deleted) : '无'}；永久增益${data.layers}层（摸牌数与出牌阶段杀次数各+${data.layers}，手牌上限-${data.layers}）。`;
        },
      },
    },
    [TAIL]: {
      charlotte: true,
      trigger: { player: 'phaseDiscardEnd' },
      forced: true,
      popup: false,
      filter(event, player) { return discardCount(event) > 0 && tailCards(player).length > 0; },
      async content(event, trigger, player) { await resolveTail(player, discardCount(trigger)); },
    },
    [TRACK]: {
      charlotte: true,
      forced: true,
      popup: false,
      forceDie: true,
      includeOut: true,
      trigger: { global: 'damageEnd' },
      filter(event, player) { return !!matchingUse(event, player); },
      async content(event, trigger, player) { recordDamage(trigger, player); },
    },
  };
  return {
    skills,
    translate: {
      [KONG]: '空营',
      [KONG + '_info']: '你手中没有伤害牌时，你可以视为使用一张基本牌或【无懈可击】（仅使用，不含打出；可选择属性杀）。',
      [BACKUP]: '空营',
      [WUXIE]: '空营·无懈',
      [WUXIE + '_info']: '空营的无懈可击响应入口；手中没有伤害牌且无懈牌名尚未被删除时，视为使用无懈可击。使用后正常结算智慑与孤拒。',
      [GUJU]: '孤拒',
      [GUJU + '_info']: '锁定技，其他角色无法令你回复体力。你发动“空营”时，若本次使用的牌名本回合已以此法使用过，则从“空营”中永久删除该牌名，然后本局游戏你每次摸牌的数量+1、出牌阶段使用【杀】的次数+1、手牌上限-1（可叠加，属性杀均按“杀”计）。弃牌阶段结束时，你可以视为对至多本次因手牌上限规则弃置的牌数名角色使用一张伤害牌（无距离和次数限制且不计次），此牌结算完成后，你弃置每名因此受到伤害的角色各一张牌（每名角色限一次，包括你自己及铁索传导的角色）。',
      [TAIL]: '孤拒',
      [TRACK]: '孤拒',
      [GROWTH]: '孤拒·余势',
      [GROWTH + '_info']: '由孤拒删除牌名后获得的本局游戏永久效果：每层令摸牌数+1、出牌阶段使用杀的次数+1、手牌上限-1。已获得的层数不因失去或封印孤拒而消失。',
    },
  };
};
    const createZhishe=function createZhishe(lib,game,ui,get,ai,_status,api){
 const MAIN='bjgy_mzy_zhishe',DYING='bjgy_mzy_zs_dying';
 const completed=new WeakSet(),pending=new WeakMap();
 const labels=['弃牌','摸牌','分配伤害'];
 const turn=()=>Number(game.phaseNumber)||0,round=()=>Number(game.roundNumber)||0;
 function state(player){
  if(!player.storage[MAIN])player.storage[MAIN]={values:[1,1,1],used:[-1,-1,-1],banRound:null};
  return player.storage[MAIN];
 }
 function living(){return game.filterPlayer(p=>p.isIn());}
 function canDiscard(player,target){return target.isIn()&&target.countDiscardableCards(player,'hej')>0;}
 function available(player){
  const s=state(player);if(!player.isIn())return [];
  return [0,1,2].filter(i=>s.used[i]!==turn()&&(i!==2||s.banRound!==round())&&(i!==0||game.hasPlayer(p=>canDiscard(player,p))));
 }
 function update(player){player.markSkill(MAIN);}
 async function discardTotal(player,n){
  for(let i=0;i<n&&player.isIn();i++){
   if(!game.hasPlayer(p=>canDiscard(player,p)))break;
   const result=await player.chooseTarget(true,`智慑：选择一名角色，弃置其区域内一张牌（${i+1}/${n}）`,(card,owner,target)=>canDiscard(owner,target))
    .set('ai',target=>get.effect?.(target,{name:'guohe'},player,player)||0).forResult();
   const target=result.targets?.[0];if(!target)break;
   await player.discardPlayerCard(target,'hej',true);
  }
 }
 async function drawEach(player,n){
  if(!living().length)return;
  const result=await player.chooseTarget(true,[1,Infinity],`智慑：令任意名角色各摸${n}张牌`,(card,owner,target)=>target.isIn())
   .set('ai',target=>get.attitude?.(player,target)||0).forResult();
  for(const target of [...new Set(result.targets||[])])if(target.isIn())await target.draw(n);
 }
 async function damageAllocated(player,n,s){
  await player.loseHp(n);
  if(!player.isIn())return;
  // All points are assigned before any damage resolves. Repeated selections
  // are merged into one damage event per recipient, as in the native template.
  const distribution=new Map();
  for(let i=0;i<n;i++){
   const result=await player.chooseTarget(true,`智慑：分配第${i+1}/${n}点伤害（可重复选择角色）`,(card,owner,target)=>target.isIn())
    .set('ai',target=>get.effect?.(target,{name:'damage'},player,player)||0).forResult();
   const target=result.targets?.[0];if(!target)break;
   distribution.set(target,(distribution.get(target)||0)+1);
  }
  const frame={entered:false};
  for(const [target,count]of distribution){
   if(!target.isIn())continue;
   const damage=target.damage(count,player),record={frame,target};
   pending.set(damage,record);
   try{await damage;}finally{pending.delete(damage);}
  }
  if(!frame.entered){
   // Seal before the penalty discard: nested effects must see the round ban.
   s.banRound=round();update(player);
   if(player.isIn()){
    const discard=player.chooseToDiscard(n,'he',true);
    discard.set?.('prompt',`智慑：没有目标因此进入过濒死，弃置${n}张牌`);
    await discard;
   }
  }
 }
 async function execute(player,index){
  const s=state(player),n=s.values[index];
  s.used[index]=turn();update(player);
  try{
   if(index===0)await discardTotal(player,n);
   else if(index===1)await drawEach(player,n);
   else await damageAllocated(player,n,s);
  }finally{
   for(let i=0;i<3;i++)s.values[i]=i===index?1:Math.min(3,s.values[i]+1);
   update(player);
  }
 }
 api.zhishe={state,available};
 const description='每回合每项限一次，每项数值初始为1，执行后改为1，其余项目数值+1且至多为3。你通过“空营”使用的牌结算完成后，选择一项：①弃置任意名角色区域内共计N张牌；②令任意名角色各摸N张牌；③失去N点体力，然后分配共N点伤害，若没有目标因此进入过濒死状态，你弃置N张牌且该项本轮失效（N为所选项目当前数值）。';
 return {skills:{
  [MAIN]:{
   trigger:{player:'useCardAfter'},forced:true,popup:false,group:[DYING],
   init(player){state(player);},
   filter(event,player){return api.isKongying(event)&&!completed.has(event)&&available(player).length>0;},
   async content(event,trigger,player){
    if(completed.has(trigger))return;
    const choices=available(player);if(!choices.length)return;
    const s=state(player),choiceList=[`弃置任意名角色区域内共计${s.values[0]}张牌`,`令任意名角色各摸${s.values[1]}张牌`,`失去${s.values[2]}点体力并分配等量伤害；若无人因此进入过濒死，弃等量牌并令此项本轮失效`];
    const result=await player.chooseControl(choices.map(i=>labels[i]))
     .set('prompt','智慑：选择一项执行').set('choiceList',choices.map(i=>choiceList[i]))
     .set('ai',()=>choices.includes(1)?'摸牌':labels[choices[0]]).forResult();
    const index=labels.indexOf(result.control);
    if(!choices.includes(index))return;
    completed.add(trigger);player.logSkill(MAIN);
    await execute(player,index);
   },
   mark:true,
   intro:{markcount(storage){return storage?.values?.join('')||'111';},content(storage,player){const s=state(player);return `当前数值：${s.values.join(' / ')}；本回合已用：${labels.filter((_,i)=>s.used[i]===turn()).join('、')||'无'}${s.banRound===round()?'；第三项本轮失效':''}`;}},
  },
  [DYING]:{
   charlotte:true,trigger:{global:'dying'},forced:true,popup:false,firstDo:true,priority:100,
   filter(event){const record=pending.get(event.reason);return !!record&&record.target===event.player;},
   async content(event,trigger){const record=pending.get(trigger.reason);if(record&&record.target===trigger.player)record.frame.entered=true;},
  },
 },translate:{[MAIN]:'智慑',[MAIN+'_info']:description,[DYING]:'智慑'},
 dynamicTranslate:{[MAIN](player){const s=state(player);return description+`<br>当前三项数值：${s.values.join('、')}。`;}}};
};
    const api={};
    const modules=[createCore(lib,game,ui,get,ai,_status,api),createZhishe(lib,game,ui,get,ai,_status,api)];
    const skills=Object.assign({},...modules.map(item=>item.skills));
    const translate=Object.assign({},...modules.map(item=>item.translate));
    const dynamicTranslate=Object.assign({},...modules.map(item=>item.dynamicTranslate || {}));
    return {
        name:"谋赵云",editable:true,connect:false,
        content:async function(){},precontent:async function(){},help:{},config:{},
        package:{
            character:{
                character:{bjgy_mouzhaoyun:["male","shu",4,["bjgy_mzy_kongying","bjgy_mzy_zhishe","bjgy_mzy_guju"],["die:false","ext:谋赵云/bjgy_mouzhaoyun.jpg"]]},
                translate:{bjgy_mouzhaoyun:"谋赵云"},
                characterIntro:{bjgy_mouzhaoyun:"原创谋赵云。技能设计：辟境归元。蜀势力，男性，体力及体力上限4/4。技能：空营、智慑、孤拒。"},
                dynamicTranslate:dynamicTranslate
            },
            card:{card:{},translate:{},list:[]},
            skill:{skill:skills,translate:translate},
            intro:"谋赵云：蜀、男、4/4。空营、智慑、孤拒，按设计者确认的结算制作，适配无名杀1.11.6供实测。",
            author:"辟境归元",diskURL:"",forumURL:"",version:"0.1.2"
        },
        files:{character:["bjgy_mouzhaoyun.jpg"],card:[],skill:[],audio:[]}
    };
});
