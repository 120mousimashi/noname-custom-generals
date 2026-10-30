// 武邓艾 v0.1.0 测试版。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助。
// 原创代码MIT；设计文字和GPT原画分别署名，见README与LICENSE。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function(lib,game,ui,get,ai,_status,api){
 const ID='bjgy_wudengai_kaichou',RECORD=ID+'_record',IGNORE=ID+'_ignored',HAND=ID+'_hand',DIST=ID+'_distance';
 const uses=new WeakMap(),handledLosses=new WeakSet(),handledGains=new WeakSet();
 let recipients=new Set(),locked=false,installed=false;
 function inPlay(player){return Boolean(player&&(typeof player.isIn!=='function'||player.isIn()));}
 function living(){return game.players.filter(inPlay);}
 function owns(player){return inPlay(player)&&player.hasSkill(ID);}
 function parent(event){return event?.getParent?event.getParent():event?.parent;}
 function useOf(event){const seen=new Set();for(let at=event;at&&!seen.has(at);at=parent(at)){if(at.name==='useCard')return at;seen.add(at);}return null;}
 function cards(player){return player.getExpansions(ID).slice();}
 function isFieldLoss(event,card){return Boolean(event.gaintag_map?.[card.cardid]?.includes(ID));}
 function basicLoss(event){return (event.cards||[]).some(card=>!isFieldLoss(event,card)&&get.type(card,null,false)==='basic');}
 function directGain(event){
  const effect=parent(event);if(effect?.name!=='wugu'||effect.type!=='card')return null;
  const use=useOf(effect);if(!use||use.card?.name!=='wugu')return null;
  const gained=(event.cards||[]).filter(card=>use.wuguShownCards?.includes(card));
  return gained.length?{use,gained}:null;
 }
 function checkCoverage(){const alive=living();if(alive.length&&alive.every(player=>recipients.has(player)))locked=true;}
 function snapshot(use){
  if(!use)return null;
  checkCoverage();
  if(!uses.has(use))uses.set(use,{collect:locked,owner:locked?living().find(owns):null});
  return uses.get(use);
 }
 async function discard(player,selected){
  const current=cards(player),list=[...new Set(selected||current)].filter(card=>current.includes(card));
  if(!list.length)return;
  // The native lose event snapshots this non-eternal expansion tag in
  // gaintag_map before clearing it. basicLoss therefore excludes the cost.
  await player.loseToDiscardpile(list);
 }
 function reset(){
  recipients=new Set();locked=false;
  for(const player of game.players.concat(game.dead||[])){delete player.storage[DIST];if(player.hasSkill?.(ID))player.markSkill(ID);}
 }
 async function collect(event){
  const use=useOf(event),state=snapshot(use);if(!state?.collect)return;
  const owner=owns(state.owner)?state.owner:living().find(owns);if(!owner)return;
  // Native contentBefore owns the actual count, fixedShownCards, ordering
  // move and dialog. Never recreate or guess the revealed cards here.
  const shown=(use.wuguShownCards||[]).filter(card=>get.position(card,true)==='o');
  const dialog=ui.dialogs.find(dialog=>dialog.videoId===use.preResult);
  if(dialog){dialog.buttons.length=0;dialog.close();_status.dieClose.remove(dialog);}
  game.broadcast(function(id){const dialog=ui.dialogs.find(dialog=>dialog.videoId===id);if(dialog){dialog.buttons.length=0;dialog.close();_status.dieClose.remove(dialog);}},use.preResult);
  use.excluded.addArray(use.targets);
  if(shown.length){const next=owner.addToExpansion(shown,'gain2');next.gaintag.add(ID);await next;owner.markSkill(ID);}
 }
 async function afterGain(event){
  const info=directGain(event);if(!info||handledGains.has(event))return;handledGains.add(event);
  const gained=typeof event.getg==='function'?event.getg(event.player):event.cards||[];
  if(!info.gained.some(card=>gained.includes(card)))return;
  recipients.add(event.player);
  checkCoverage();
  const owner=info.use.player,recipient=event.player;
  if(recipient===owner||!owns(owner)||!inPlay(recipient)||!recipient.countCards('he'))return;
  const result=await recipient.chooseCard('he',true,'开畴：交给'+get.translation(owner)+'一张牌').set('ai',card=>6-get.value(card)).forResult();
  const selected=result?.cards?.filter(card=>recipient.getCards('he').includes(card)).slice(0,1)||[];
  if(selected.length&&inPlay(owner))await recipient.give(selected,owner);
 }
 function install(){if(installed)return;installed=true;game.addGlobalSkill(RECORD);game.addGlobalSkill(IGNORE);}
 api.kaichou={cards,discard,install};
 return {skills:{
  [ID]:{
   locked:true,forced:true,mark:true,marktext:'畴',intro:{content:'expansion',markcount:'expansion'},
   trigger:{player:'loseAfter'},
   filter(event,player){return !handledLosses.has(event)&&basicLoss(event);},
   async content(event,trigger,player){
    if(handledLosses.has(trigger))return;handledLosses.add(trigger);
    player.storage[DIST]=(player.storage[DIST]||0)+1;player.markSkill(ID);
    const targets=living().filter(target=>target===player||get.distance(player,target)<=1);
    if(targets.length)await player.useCard({name:'wugu',isCard:true},targets);
   },
   mod:{globalFrom(from,to,distance){return distance-(from.storage[DIST]||0);}},
   onremove(player){const list=cards(player);if(list.length)player.loseToDiscardpile(list);},
  },
  [RECORD]:{
   charlotte:true,silent:true,forced:true,popup:false,firstDo:true,priority:10000000,forceDie:true,forceOut:true,
   trigger:{global:['roundStart','dieAfter','gainBefore','gainAfter','wuguContentBeforeBefore','wuguContentBeforeAfter']},
   filter(event,player,name){
    if(player!==living()[0])return false;
    if(name==='roundStart'||name==='dieAfter'||name==='wuguContentBeforeBefore'||name==='wuguContentBeforeAfter')return true;
    return Boolean(directGain(event));
   },
   async content(event,trigger){
    if(event.triggername==='roundStart'){reset();return;}
    if(event.triggername==='dieAfter'){checkCoverage();return;}
    if(event.triggername==='wuguContentBeforeBefore'){snapshot(useOf(trigger));return;}
    if(event.triggername==='wuguContentBeforeAfter'){await collect(trigger);return;}
    if(event.triggername==='gainBefore'){
     if(owns(trigger.player)){trigger.gaintag??=[];trigger.gaintag.add(HAND);}
     return;
    }
    await afterGain(trigger);
   },
  },
  [IGNORE]:{charlotte:true,mod:{ignoredHandcard(card,player){if(card.hasGaintag(HAND))return true;}}},
 },translate:{
  [ID]:'开畴',
  [ID+'_info']:'锁定技。当你于一次失牌事件中失去基本牌后（失去“畴”除外），本轮你计算与其他角色的距离-1，然后视为对你及与你距离不大于1的所有角色使用一张【五谷丰登】。其他角色直接因你使用的【五谷丰登】获得牌后，其交给你一张手牌或装备牌。你直接因任意【五谷丰登】获得的牌不计入手牌上限，直至离手。本轮内，任意【五谷丰登】的直接得牌者覆盖当前所有存活角色后，当前【五谷丰登】正常结算完毕，此后本轮所有【五谷丰登】实际亮出的牌均置于你的武将牌上，称为“畴”，不再分配。',
  [HAND]:'开畴',
 }};
},
function(lib,game,ui,get,ai,_status,api){
 const MAIN='bjgy_wudengai_yuxian',RECORD=MAIN+'_record';
 const frames=new WeakMap(),finished=new WeakSet(),checking=new WeakMap();let installed=false;
 const inPlay=p=>!!p&&p.isIn();
 function handCard(card,player){return get.itemtype(card)==='card'&&player.getCards('h').includes(card)&&get.owner(card)===player;}
 function nine(card,player){
  const material=get.itemtype(card)==='card'?card:card?.cards?.length===1?card.cards[0]:null;
  if(!material||!handCard(material,player))return;
  let owners=checking.get(material);if(!owners){owners=new Set();checking.set(material,owners);}if(owners.has(player))return;
  owners.add(player);
  try{if(lib.filter.ignoredHandcard(material,player))return 9;}finally{owners.delete(player);}
 }
 function capture(use){
  if(frames.has(use)||!use.player)return;
  const materials=Array.from(new Set(use.cards||[]));
  const fromHand=materials.length>0&&materials.every(c=>handCard(c,use.player));
  frames.set(use,{fromHand,number:get.number(use.card,use.player)});
 }
 function eligible(use,player){return !finished.has(use)&&inPlay(player)&&frames.get(use)?.fromHand&&frames.get(use)?.number===9&&api.kaichou.cards(player).length>0;}
 function legal(player){return ['sha','shunshou'].filter(name=>player.hasUseTarget({name,isCard:true},null,false));}
 async function resolve(event,use,player){
  if(!eligible(use,player))return;finished.add(use);
  const stored=api.kaichou.cards(player);let selected=stored[0];
  if(stored.length>1){
   const result=await player.chooseButton(['逾险：弃置一张“畴”',stored],1,true).set('ai',button=>6-get.value(button.link,player)).forResult();
   if(result?.links?.some(c=>stored.includes(c)))selected=result.links.find(c=>stored.includes(c));
  }
  if(!api.kaichou.cards(player).includes(selected))return;
  await api.kaichou.discard(player,[selected]);
  if(!inPlay(player))return;
  const names=legal(player);if(!names.length)return;let name=names[0];
  if(names.length>1){
   const labels=names.map(n=>n==='sha'?'杀':'顺手牵羊');
   const result=await player.chooseControl(...labels).set('prompt','逾险：选择视为使用的牌（不计次，仍受距离限制）').set('ai',()=>0).forResult();
   const index=labels.indexOf(result?.control);if(index>=0)name=names[index];
  }
  if(!player.hasUseTarget({name,isCard:true},null,false))return;
  // The native false argument bypasses usage count only. No nodistance flag.
  await player.chooseUseTarget({name,isCard:true},true,false);
 }
 function install(){if(installed)return;installed=true;game.addGlobalSkill(RECORD);}
 api.yuxian={capture,eligible,nine,resolve,install};
 return {skills:{
  [MAIN]:{forced:true,locked:true,trigger:{player:'useCardAfter'},filter:eligible,
   async content(event,trigger,player){await resolve(event,trigger,player);},
   mod:{cardnumber:nine},ai:{threaten:1.8}},
  [RECORD]:{charlotte:true,silent:true,forced:true,popup:false,forceDie:true,forceOut:true,firstDo:true,priority:1e9,
   trigger:{global:'useCardBefore'},filter(event,player){return event.player===player;},
   async content(event,trigger){capture(trigger);}},
 },translate:{
  [MAIN]:'逾险',
  [MAIN+'_info']:'锁定技，你使用点数为9的手牌结算完成后弃置一张“畴”，然后视为使用一张不计次的【杀】或【顺手牵羊】；你手中不计入手牌上限的牌点数视为9。',
  [RECORD]:'逾险·用牌记录',
 }};
},
function createEnhance(lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wudengai_enhance';
  const MARK = 'bjgy_wudengai_enhancements';
  const VIDEO = 'bjgy_wudengai_enhance_card';
  const KINDS = ['repeat', 'direct', 'unlimited'];
  const TAGS = {
    repeat: 'eternal_bjgy_wudengai_repeat',
    direct: 'eternal_bjgy_wudengai_direct',
    unlimited: 'eternal_bjgy_wudengai_unlimited',
  };
  const uses = new WeakMap();
  let installed = false;

  function effects(card) {
    const found = new Set();
    const visited = new Set();
    function visit(value) {
      if (!value || typeof value !== 'object' || visited.has(value)) return;
      visited.add(value);
      if (get.itemtype(value) === 'card') {
        const marks = value.storage?.[MARK];
        if (Array.isArray(marks)) for (const mark of marks) if (KINDS.includes(mark)) found.add(mark);
        return;
      }
      // VCard copies storage, but only real material cards convey an upgrade.
      // A material-free printed card must not gain one from copied metadata.
      if (Array.isArray(value.cards)) value.cards.forEach(visit);
    }
    visit(card);
    return KINDS.filter(kind => found.has(kind));
  }

  // broadcastAll serializes this function: keep every dependency in arguments.
  function writeMarks(card, key, marks, tags) {
    if (!card || typeof card !== 'object') return;
    card.storage ??= {};
    card.storage[key] = marks.slice();
    // Display is a mirror only. Native lose retains eternal_ tags, while the
    // authoritative effects always come from this physical card's storage.
    // Add strings individually: native addGaintag(array) replaces all tags.
    for (const tag of tags) {
      if (typeof card.addGaintag === 'function') card.addGaintag(tag);
      else {
        card.gaintag ??= [];
        if (!card.gaintag.includes(tag)) card.gaintag.push(tag);
      }
    }
  }

  function grant(card, effect) {
    if (get.itemtype(card) !== 'card' || !KINDS.includes(effect)) return false;
    const current = effects(card);
    if (current.includes(effect)) return false;
    const marks = KINDS.filter(kind => kind === effect || current.includes(kind));
    game.broadcastAll(writeMarks, card, MARK, marks, marks.map(kind => TAGS[kind]));
    game.addVideo(VIDEO, null, [get.cardsInfo([card]), marks]);
    return true;
  }

  function useEffects(use) {
    const result = new Set(effects(use.card));
    // Native useCard normally places these in VCard.cards as well; the event
    // materials also cover other skills that supply the two arguments apart.
    for (const card of use.cards || []) for (const effect of effects(card)) result.add(effect);
    return KINDS.filter(kind => result.has(kind));
  }

  function install() {
    if (installed) return;
    installed = true;
    game.addGlobalSkill(ID);
    game.videoContent[VIDEO] = function (record) {
      const card = get.infoCards(record[0])[0];
      if (card) writeMarks(card, MARK, record[1], record[1].map(kind => TAGS[kind]));
    };
  }

  api.enhance = { effects, grant, install };

  const skills = {
    [ID]: {
      charlotte: true,
      forced: true,
      silent: true,
      popup: false,
      forceDie: true,
      firstDo: true,
      priority: 1e8,
      trigger: { global: ['useCardBefore', 'useCard1'] },
      filter(event, player) {
        return event.player === player && (uses.has(event) || useEffects(event).length > 0);
      },
      async content(event, trigger, player) {
        let state = uses.get(trigger);
        if (!state) {
          state = { effects: useEffects(trigger), applied: false };
          uses.set(trigger, state);
        }
        const before = event.triggername === 'useCardBefore';
        if (state.effects.includes('unlimited')) {
          // useCardBefore precedes native statistics. The useCard1 fallback
          // refunds only a still-counting use, once, preserving prior uses.
          if (!before && !state.applied && trigger.addCount !== false) {
            const counts = trigger.player.getStat().card;
            const name = trigger.card?.name;
            if (typeof counts[name] === 'number' && counts[name] > 0) counts[name]--;
          }
          trigger.addCount = false;
        }
        if (state.effects.includes('direct')) {
          if (!Array.isArray(trigger.directHit)) trigger.directHit = [];
          for (const current of game.players) if (!trigger.directHit.includes(current)) trigger.directHit.push(current);
        }
        if (before || state.applied) return;
        state.applied = true;
        const type = get.type(trigger.card, false);
        if (state.effects.includes('repeat') && (type === 'basic' || type === 'trick')) {
          const initial = typeof trigger.effectCount === 'number' ? trigger.effectCount : (get.info(trigger.card, false).effectCount || 1);
          // The engine repeats the entire contentBefore/targets/contentAfter
          // loop, retaining every initial target, without a second use event.
          trigger.effectCount = initial + 1;
        }
      },
      mod: {
        cardUsable(card, player) {
          if (effects(card).includes('unlimited')) return Infinity;
        },
        targetInRange(card, player) {
          if (effects(card).includes('unlimited')) return true;
        },
      },
    },
  };

  const translate = {
    [ID]: '辟贤·强化',
    [ID + '_info']: '实体牌的永久强化随牌保留，所有使用者均可享有。转化牌取实体素材的不同强化，同种强化不叠加。',
    [MARK]: '辟贤强化',
    [ID + '_repeat']: '额外结算一次',
    [ID + '_direct']: '不能被响应',
    [ID + '_unlimited']: '无距离次数限制且不计次',
    [TAGS.repeat]: '辟贤·复结',
    [TAGS.direct]: '辟贤·直击',
    [TAGS.unlimited]: '辟贤·畅用',
  };

  return { skills, translate, content: install };
},
function createBixian(lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wudengai_bixian';
  const REWARD = ID + '_reward';
  const windows = new Set();
  const effects = ['repeat', 'direct', 'unlimited'];
  const effectText = { repeat: '额外结算一次', direct: '不可被响应', unlimited: '无距离和次数限制且不计次' };

  function living(player) {
    return !!player && (typeof player.isIn !== 'function' || player.isIn());
  }

  function allPlayers() {
    return Array.from(new Set([...(game.players || []), ...(game.dead || [])]));
  }

  function allLosses() {
    const moves = typeof game.getAllGlobalHistory === 'function'
      ? game.getAllGlobalHistory('cardMove')
      : game.getGlobalHistory('cardMove');
    return (moves || []).filter(event => event.name === 'lose');
  }

  // gain/equip/addJudge/addToExpansion/loseAsync.getl each aggregate only their
  // immediate native lose children. Preserve those children as the identity:
  // getl.cards2 excludes j/s/x and adding aggregate counts duplicates loseAfter.
  function lossesOf(event) {
    if (event.name === 'lose') return [event];
    return allLosses().filter(lose => (lose.getParent?.() || lose.parent) === event);
  }

  function openWindow(player) {
    const frame = { player, losses: new WeakMap(), oldLosses: new WeakSet(allLosses()), damages: new WeakSet() };
    for (const current of allPlayers()) {
      for (const event of current.getAllHistory?.('damage') || []) frame.damages.add(event);
    }
    windows.add(frame);
    return frame;
  }

  function rewards(frame, trigger, consume) {
    if (trigger.name === 'damage') {
      if (trigger.unreal || trigger.num <= 0 || frame.damages.has(trigger)) return 0;
      if (consume) frame.damages.add(trigger);
      return Math.max(0, Math.floor(trigger.num || 0));
    }
    let count = 0;
    for (const lose of lossesOf(trigger)) {
      if (frame.oldLosses.has(lose)) continue;
      let seen = frame.losses.get(lose);
      // Native lose replaces virtual equipment/judgment wrappers with the
      // material cards in cards before writing its history and firing After.
      const actual = Array.from(new Set(lose.cards || []))
        .filter(card => card && !card.isViewAsCard && (card.cardid || get.itemtype(card) === 'card'));
      for (const card of actual) if (!seen?.has(card)) count++;
      if (consume && actual.length) {
        if (!seen) frame.losses.set(lose, seen = new Set());
        for (const card of actual) seen.add(card);
      }
    }
    return count;
  }

  function missing(card) {
    const owned = api.enhance.effects(card);
    return effects.filter(effect => !owned.includes(effect));
  }

  async function rewardOnce(player) {
    const canEnhance = player.getCards('h').some(card => missing(card).length);
    const controls = ['摸一张牌'];
    if (canEnhance) controls.push('强化一张手牌');
    controls.push('cancel2');
    const result = await player.chooseControl(controls)
      .set('prompt', '辟贤：选择本次奖励，或取消')
      .set('ai', () => 0).forResult();
    if (result.control === '摸一张牌') {
      if (living(player)) await player.draw(1);
      return;
    }
    if (result.control !== '强化一张手牌' || !living(player)) return;
    const picked = await player.chooseCard('h', '辟贤：选择一张手牌，永久强化一种尚未拥有的效果',
      card => missing(card).length > 0)
      .set('ai', card => get.value(card)).forResult();
    const card = picked.cards?.[0];
    if (!picked.bool || !card || !player.getCards('h').includes(card)) return;
    const available = missing(card);
    if (!available.length) return;
    const labels = available.map(effect => effectText[effect]);
    const selected = await player.chooseControl([...labels, 'cancel2'])
      .set('prompt', '辟贤：为此牌选择一种永久强化')
      .set('ai', () => 0).forResult();
    const effect = available[labels.indexOf(selected.control)];
    if (effect && living(player) && player.getCards('h').includes(card) && missing(card).includes(effect)) {
      api.enhance.grant(card, effect);
      game.log(player, '令', card, '永久获得', '#g' + effectText[effect]);
    }
  }

  function copies(cards) {
    const names = new Map();
    for (const card of cards) {
      const name = get.name(card, false), type = get.type(card, null, false);
      if (type !== 'basic' && type !== 'trick') continue;
      if (!names.has(name)) names.set(name, []);
      const nature = name === 'sha' ? get.nature(card, false) : undefined;
      if (!names.get(name).some(entry => entry[3] === nature)) names.get(name).push([type, '', name, nature]);
    }
    return names;
  }

  function virtual(link) {
    return { name: link[2], ...(link[3] ? { nature: link[3] } : {}), isCard: true };
  }

  function legalCopy(player, link) {
    const card = virtual(link), info = get.info(card);
    if (!info || !lib.filter.cardEnabled(card, player)) return false;
    return !!info.notarget || player.hasUseTarget(card, false, false);
  }

  const skills = {
    [ID]: {
      enable: 'phaseUse', limited: true, skillAnimation: true, animationColor: 'thunder',
      mark: true, marktext: '辟', intro: { content: 'limited' },
      filter(event, player) {
        if (player.storage?.[ID] || player.awakenedSkills?.includes(ID)) return false;
        const players = (game.players || []).filter(living);
        return living(player) && api.kaichou.cards(player).length >= 2 * players.length &&
          players.every(target => target === player || get.distance(player, target) <= 1);
      },
      async content(event, trigger, player) {
        event.forceDie = true;
        player.awakenSkill(ID);
        const cards = api.kaichou.cards(player).slice(), pending = copies(cards);
        // Opening only after this awaited child includes all nested cost
        // triggers and deferred after-events in the excluded fee interval.
        await api.kaichou.discard(player, cards);
        const frame = openWindow(player);
        try {
          while (pending.size && living(player)) {
            const available = Array.from(pending.values()).flat().filter(link => legalCopy(player, link));
            if (!available.length) break;
            const result = await player.chooseButton(['辟贤：选择下一张使用的牌（同名牌仅一次）', [available, 'vcard']], true)
              .set('ai', button => get.useValue?.(virtual(button.link), player) || 1).forResult();
            const selected = result.links?.[0];
            // The native chooser is forced. Validate the returned identity
            // before constructing a card, including remote-client results.
            const link = available.find(item => item[2] === selected?.[2] && item[3] === selected?.[3]) || available[0];
            pending.delete(link[2]);
            if (living(player) && legalCopy(player, link)) {
              await player.chooseUseTarget(virtual(link), true, 'nodistance', false);
            }
          }
        } finally {
          windows.delete(frame);
        }
      },
      ai: { order: 10, result: { player: 1 } },
    },
    [REWARD]: {
      charlotte: true, forced: true, popup: false, forceDie: true,
      trigger: { global: ['damageEnd', 'loseAfter', 'gainAfter', 'loseAsyncAfter', 'equipAfter', 'addJudgeAfter', 'addToExpansionAfter'] },
      filter(event, player) {
        if (!living(player)) return false;
        return Array.from(windows).some(frame => frame.player === player && rewards(frame, event, false) > 0);
      },
      async content(event, trigger, player) {
        for (const frame of Array.from(windows)) {
          if (frame.player !== player) continue;
          // Claim all tokens before the first reward can cause more events.
          const count = rewards(frame, trigger, true);
          for (let index = 0; index < count && windows.has(frame) && living(player); index++) await rewardOnce(player);
        }
      },
    },
  };

  api.bixian = {
    install() { game.addGlobalSkill(REWARD); },
  };
  return { skills, translate: {
    [ID]: '辟贤',
    [ID + '_info']: '限定技，出牌阶段，若你与所有其他角色的距离均不大于1，且“畴”数至少为存活角色数的两倍，你可弃置所有“畴”，然后以任意顺序视为使用其中每种牌名的基本牌或普通锦囊牌各一张，无距离和次数限制且不计入使用次数，没有合法使用条件的牌跳过。杀的属性从弃置的同名牌中选择。弃畴完全结算后，至本次印牌及其嵌套结算全部结束期间，全场每造成1点实际伤害或每失去1张实体牌，你均可摸一张牌，或令一张手牌永久获得一种尚未拥有的强化：额外结算一次、不可被响应、无距离和次数限制且不计次。强化跟随实体牌，后续持有者同样生效，转化牌取全部素材的效果并集，同种效果不叠加。装备牌和延时锦囊无法重复结算时，不产生额外结算。',
    [REWARD]: '辟贤',
  } };
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills));
 const translate=Object.assign({},...modules.map(module=>module.translate));
 let scheduled=false;
 return {
  name:'武邓艾',editable:true,connect:false,
  async content(){
   if(scheduled)return;scheduled=true;
   // Native loadExtension registers package skills after this callback;
   // native arenaReady is synchronous, so every helper installs in one pass.
   (lib.arenaReady??=[]).push(function installWudengai(){
    api.kaichou.install();api.yuxian.install();api.enhance.install();api.bixian.install();
   });
  },
  async precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_wudengai:['male','wei',4,['bjgy_wudengai_kaichou','bjgy_wudengai_yuxian','bjgy_wudengai_bixian'],['die:false','ext:武邓艾/bjgy_wudengai.jpg']]},
    translate:{bjgy_wudengai:'武邓艾'},characterIntro:{bjgy_wudengai:'武邓艾，魏、男性、初始体力4，体力上限4。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画：设计者提供的GPT生成图。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'武邓艾：魏、男、4/4。开畴、逾险、辟贤，包含五谷丰登转畴、九点手牌与永久实体牌强化。面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_wudengai.jpg'],card:[],skill:[],audio:[]}
 };
});
