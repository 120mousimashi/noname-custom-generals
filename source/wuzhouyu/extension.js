// 武周瑜 v0.1.0 测试版。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助。
// 原创代码MIT；设计文字和GPT原画分别署名，见README与LICENSE。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function(lib,game,ui,get,ai,_status,api){
 const RECORD='bjgy_wuzhouyu_record',CLOCK='bjgy_wuzhouyu_clock';
 const turns=new WeakMap(),phases=new WeakMap(),completed=new WeakSet(),queued=new WeakSet();
 const handled=new Map(),turnCallbacks=[],roundCallbacks=[];
 let installed=false,lastRound=null;
 function inPlay(player){return !!player&&typeof player.isIn==='function'&&player.isIn();}
 function ancestor(event,name){
  if(!event||typeof event!=='object')return null;
  if(event.name===name)return event;
  if(typeof event.getParent==='function'){
   const found=event.getParent(name,true,true);if(found?.name===name)return found;
  }
  const seen=new Set();for(let current=event.parent;current&&!seen.has(current);current=current.parent){if(current.name===name)return current;seen.add(current);}
  return null;
 }
 function turnOf(event){return ancestor(event||_status.event,'phase');}
 function phaseUseOf(event){return ancestor(event||_status.event,'phaseUse');}
 function turnData(turn){if(!turn)return null;let data=turns.get(turn);if(!data){data={equipSuits:new Map(),shown:new Set()};turns.set(turn,data);}return data;}
 function phaseData(phase){if(!phase)return {groups:new Set(),fire:false};let data=phases.get(phase);if(!data){data={groups:new Set(),fire:false};phases.set(phase,data);}return data;}
 function factions(){return [...new Set(game.filterPlayer(inPlay).map(player=>player.group).filter(group=>typeof group==='string'&&group.length))];}
 function round(){return Number(game.roundNumber)||0;}
 function hasEquipSuit(player,suit,event){return turnData(turnOf(event))?.equipSuits.get(player)?.has(suit)||false;}
 function shownPlayers(event){return [...(turnData(turnOf(event))?.shown||[])].filter(inPlay);}
 function onTurnEnd(fn){if(!turnCallbacks.includes(fn))turnCallbacks.push(fn);}
 function onRound(fn){if(!roundCallbacks.includes(fn))roundCallbacks.push(fn);}
 async function finishTurn(turn){
  if(!turn||completed.has(turn))return;
  completed.add(turn);for(const fn of turnCallbacks)await fn(turn);
 }
 function queueCleanup(turn){
  if(!turn||!Array.isArray(turn.after)||queued.has(turn)||typeof game.createEvent!=='function')return;
  queued.add(turn);
  const cleanup=game.createEvent('bjgy_wuzhouyu_turn_cleanup',false,turn);
  cleanup.player=turn.player;cleanup.forceDie=true;cleanup.includeOut=true;cleanup._bjgy_wuzhouyu_turn=turn;
  cleanup.setContent(async function(event){await finishTurn(event._bjgy_wuzhouyu_turn);});
  const index=turn.next?.indexOf(cleanup)??-1;if(index>=0)turn.next.splice(index,1);
  turn.after.push(cleanup);
 }
 function once(trigger,timing){let seen=handled.get(timing);if(!seen){seen=new WeakSet();handled.set(timing,seen);}if(seen.has(trigger))return false;seen.add(trigger);return true;}
 function record(trigger,timing){
  if(!once(trigger,timing))return;
  const turn=turnOf(trigger),data=turnData(turn),phase=phaseUseOf(trigger);
  if(timing==='useCard1'&&data&&get.type(trigger.card)==='equip'){
   let suits=data.equipSuits.get(trigger.player);if(!suits){suits=new Set();data.equipSuits.set(trigger.player,suits);}
   const suit=get.suit(trigger.card,trigger.player);if(typeof suit==='string')suits.add(suit);
  }else if(timing==='useCardToPlayer'&&phase){
   const group=trigger.target?.group;if(typeof group==='string'&&group.length)phaseData(phase).groups.add(group);
  }else if(timing==='damageEnd'&&phase&&trigger.num>0&&!trigger.unreal&&trigger.source){
   const natures=typeof get.natureList==='function'?get.natureList(trigger):String(trigger.nature||'').split('|');
   if(natures.includes('fire'))phaseData(phase).fire=true;
  }else if(timing==='showCardsAfter'&&data){
   for(const player of game.filterPlayer(inPlay)){
    const cards=typeof trigger.getShown==='function'?trigger.getShown(player)?.hs:trigger.cards?.filter(card=>get.owner(card)===player&&get.position(card)==='h');
    if(cards?.length)data.shown.add(player);
   }
  }else if(timing==='addShownCardsAfter'&&data&&trigger.cards?.length){
   data.shown.add(trigger.player);
  }
 }
 async function clock(trigger,timing){
  if(timing==='roundStart'){
   const current=round();if(lastRound===current)return;lastRound=current;
   for(const fn of roundCallbacks)await fn(current);return;
  }
  if(timing==='phaseBegin'){turnData(trigger);queueCleanup(trigger);return;}
  await finishTurn(trigger);
 }
 function install(){if(installed)return;installed=true;game.addGlobalSkill(RECORD);game.addGlobalSkill(CLOCK);}
 api.core={inPlay,turnOf,phaseUseOf,round,factions,phaseData,hasEquipSuit,shownPlayers,onTurnEnd,onRound,finishTurn,install};
 return {skills:{
  [RECORD]:{charlotte:true,forced:true,popup:false,silent:true,forceDie:true,forceOut:true,firstDo:true,priority:1000000,
   trigger:{global:['useCard1','useCardToPlayer','damageEnd','showCardsAfter','addShownCardsAfter']},
   async content(event,trigger){record(trigger,event.triggername);}},
  [CLOCK]:{charlotte:true,forced:true,popup:false,silent:true,forceDie:true,forceOut:true,lastDo:true,priority:-1000000,
   trigger:{global:['phaseBegin','phaseAfter','phaseCancelled','phaseSkipped','roundStart']},
   async content(event,trigger){await clock(trigger,event.triggername);}},
 },translate:{},async content(){install();}};
},
function (lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wuzhouyu_guqu';
  const UPGRADED = 'bjgy_wuzhouyu_guqu_upgraded';
  const core = api.core;

  function upgraded(player) {
    return Boolean(player?.storage?.[UPGRADED]);
  }

  function upgrade(player) {
    if (!player || upgraded(player)) return;
    player.storage ??= {};
    player.storage[UPGRADED] = true;
    player.syncStorage?.(UPGRADED);
    player.markSkill?.(ID);
  }

  function normalRange(player, target) {
    return player.inRange(target) || !target.inRange(player);
  }

  function validTarget(player, target, selected = ui.selected?.targets || []) {
    if (!core.inPlay(player) || !core.inPlay(target) || target === player || !target.countCards('h')) return false;
    if (!upgraded(player)) return normalRange(player, target);
    if (target.isLinked()) return true;
    return normalRange(player, target) && !selected.some(other => other !== target && !other.isLinked());
  }

  // Validate the choice once, then preserve the chosen list during settlement:
  // linking/range changes caused by an earlier target do not select new targets.
  function selectTargets(player, targets) {
    const chosen = [];
    for (const target of targets || []) {
      if (chosen.includes(target) || !validTarget(player, target, chosen)) continue;
      chosen.push(target);
      if (!upgraded(player)) break;
    }
    return get.sortSeat(chosen, player);
  }

  function ownsHand(target, card) {
    return core.inPlay(target) && target.getCards('h').includes(card);
  }

  function targetScore(player, target) {
    // Unknown hands stay unknown: the decision estimates outcomes without
    // reading their suits or values. The native chooser renders blank buttons.
    const attitude = get.attitude(player, target);
    return (get.damageEffect(target, player, player, 'fire') - attitude) || -attitude;
  }

  async function settle(player, target, trigger, revised, usedSuit) {
    if (!core.inPlay(player) || !core.inPlay(target) || !target.countCards('h')) return;
    const choice = await player.choosePlayerCard(target, 'h', true)
      .set('prompt', '顾曲：选择' + get.translation(target) + '的一张手牌展示')
      .set('ai', () => 1)
      .forResult();
    const card = choice?.cards?.[0];
    if (!choice?.bool || !card || !core.inPlay(player) || !ownsHand(target, card)) return;
    const suit = get.suit(card, target);
    await target.showCards([card], get.translation(player) + '发动了【顾曲】');
    if (!core.inPlay(player) || !core.inPlay(target)) return;

    const fire = revised ? core.hasEquipSuit(player, suit, trigger) : suit === usedSuit;
    const discard = revised ? fire : !fire;
    if (discard && ownsHand(target, card) && lib.filter.canBeDiscarded(card, player, target, ID)) {
      await target.discard({ cards: [card], discarder: player });
    } else if (revised && !fire && ownsHand(target, card) && lib.filter.canBeGained(card, player, target, ID)) {
      await player.gain([card], target, 'giveAuto');
    }
    // Damage is independent of whether the revealed card was still present,
    // discardable, or actually discarded by the previous child event.
    if (fire && core.inPlay(player) && core.inPlay(target)) {
      await target.damage({ num: 1, nature: 'fire', source: player, nocard: true });
    }
  }

  const skills = {
    [ID]: {
      trigger: { player: 'useCardAfter' },
      direct: true,
      filter(event, player) {
        return core.inPlay(player) && get.type(event.card) === 'equip' && game.hasPlayer(target => validTarget(player, target, []));
      },
      async content(event, trigger, player) {
        if (!core.inPlay(player)) return;
        const revised = upgraded(player);
        // This is the card of the useCard event, including a virtual equipment
        // card. Do not substitute the card now occupying an equipment slot.
        const usedSuit = get.suit(trigger.card, player);
        const prompt = revised
          ? '顾曲：选择任意名有手牌的横置其他角色，并可额外选择至多一名原范围角色'
          : '顾曲：选择一名有手牌的其他角色，展示其一张手牌';
        const choice = await player.chooseTarget(prompt, revised ? [1, Infinity] : 1)
          .set('filterTarget', (card, current, target) => validTarget(current, target))
          .set('ai', target => targetScore(player, target))
          .forResult();
        if (!choice?.bool || !core.inPlay(player)) return;
        const targets = selectTargets(player, choice.targets);
        if (!targets.length) return;
        player.logSkill(ID, targets);
        for (const target of targets) {
          if (!core.inPlay(player)) break;
          await settle(player, target, trigger, revised, usedSuit);
        }
      },
      marktext: '曲',
      intro: {
        content(storage, player) {
          return upgraded(player)
            ? '顾曲已永久修改：可额外选择横置角色；本回合使用过对应花色装备则弃置展示牌并造成火焰伤害，否则获得展示牌。'
            : '顾曲尚未修改。';
        },
      },
      ai: { threaten: 1.5 },
    },
  };
  api.guqu = { upgraded, upgrade, normalRange, validTarget, selectTargets, ownsHand, targetScore, settle };
  return {
    skills,
    translate: {
      [ID]: '顾曲',
      [ID + '_info']: '当你使用装备牌结算完成后，你可以选择一名其他角色（其在你的攻击范围内，或你不在其攻击范围内），由你选择并展示其一张手牌。若此牌与你本次使用的装备牌花色相同，你对其造成1点火焰伤害；否则你弃置此牌。',
      [ID + '_revised_info']: '当你使用装备牌结算完成后，你可以选择任意名横置的其他角色，并额外选择至多一名符合原攻击范围条件的其他角色（至少选择一名且均须有手牌）。按座次由你选择并展示其各一张手牌：若你于本回合使用过此花色的装备牌，则弃置此牌并对其造成1点火焰伤害；否则你获得此牌。',
    },
  };
},
function (lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wuzhouyu_chouju';
  const UPGRADED = ID + '_upgraded';
  const USED = ID + '_round';
  const LEASE = ID + '_lease';
  const RULES = ID + '_rules';
  const REFUND = ID + '_refund';
  const FIRE = ID + '_fire';
  const CLEANUP = ID + '_cleanup';
  const RESET = ID + '_reset';
  const core = api.core;
  const leases = new Map();
  const extras = new Map();
  let installed = false;

  function upgraded(player) {
    return Boolean(player?.storage?.[UPGRADED]);
  }

  function upgrade(player) {
    if (!player || upgraded(player)) return;
    player.storage ??= {};
    player.storage[UPGRADED] = true;
    player.syncStorage?.(UPGRADED);
    player.markSkill?.(ID);
  }

  function used(player) {
    return player?.storage?.[USED] === core.round();
  }

  function reset(player) {
    if (!player?.storage) return;
    delete player.storage[USED];
    player.syncStorage?.(USED);
  }

  function canActivate(phase, player) {
    if (!core.inPlay(player) || !phase || used(player)) return false;
    if (!game.hasPlayer(target => target !== player && core.inPlay(target))) return false;
    if (upgraded(player)) return true;
    const groups = core.phaseData(phase).groups;
    return Array.from(core.factions()).every(group => groups.has(group));
  }

  function hasLease(target) {
    return leases.get(target) === core.round();
  }

  function grant(target) {
    leases.set(target, core.round());
    target.addSkill?.(LEASE);
    target.markSkill?.(LEASE);
  }

  function finishRound() {
    for (const target of leases.keys()) {
      target.removeSkill?.(LEASE);
      target.unmarkSkill?.(LEASE);
    }
    leases.clear();
  }

  function finishPhase(phase) {
    extras.delete(phase);
  }

  function findUse(event, source, card) {
    const visited = new Set();
    for (let cursor = event; cursor && !visited.has(cursor); cursor = cursor.parent || cursor.getParent?.()) {
      visited.add(cursor);
      if (cursor.name === 'useCard' && (!source || cursor.player === source) && (!card || cursor.card === card)) return cursor;
    }
    return null;
  }

  function blocked(player, context, source, card) {
    const event = context && typeof context === 'object' ? context : _status.event;
    const phase = core.phaseUseOf(event), state = extras.get(phase);
    if (!state || !state.victims.has(player)) return false;
    let respondTo;
    const visited = new Set();
    for (let cursor = event; cursor && !visited.has(cursor); cursor = cursor.parent || cursor.getParent?.()) {
      visited.add(cursor);
      if (cursor.respondTo) { respondTo = cursor.respondTo; break; }
      if (cursor === phase) break;
    }
    if (!source) {
      if (respondTo) [source, card] = respondTo;
      else if (event?.name === 'chooseToRespond') {
        const use = findUse(event);
        source = use?.player;
        card = use?.card;
      }
    }
    if (source !== state.owner) return false;
    const currentUse = findUse(event, source, card);
    const initialUse = state.victims.get(player);
    // A damage trigger cannot retroactively prevent responses to the card that
    // caused that first damage; subsequent useCard events are distinct objects.
    if (initialUse && (currentUse === initialUse || !currentUse && card === initialUse.card)) return false;
    return true;
  }

  function randomFives(count) {
    const cards = [];
    for (const pile of [ui.cardPile, ui.discardPile]) {
      const pool = Array.from(pile?.childNodes || []).filter(card => get.number(card, false) === 5);
      while (cards.length < count && pool.length) {
        const index = get.rand(0, pool.length - 1);
        cards.push(pool.splice(index, 1)[0]);
      }
      if (cards.length >= count) break;
    }
    return cards;
  }

  function queuePhase(player) {
    const phase = player.phaseUse();
    extras.set(phase, { owner: player, victims: new Map() });
    // This belongs to the new phase itself. Awaiting the ancestor phase that
    // triggered Chouju would deadlock its own phaseUseAfter trigger chain.
    phase.insertAfter(async function (event) {
      api.chouju.finishPhase(event.choujuPhase);
    }, { choujuPhase: phase });
    return phase;
  }

  function install() {
    if (installed) return;
    installed = true;
    core.onRound(finishRound);
    for (const skill of [RULES, REFUND, FIRE, CLEANUP]) game.addGlobalSkill(skill);
  }

  const skills = {
    [ID]: {
      trigger: { global: 'phaseUseAfter' },
      direct: true,
      group: [RESET],
      filter(event, player) { return canActivate(event, player); },
      async content(event, trigger, player) {
        if (!canActivate(trigger, player)) return;
        const count = Array.from(core.factions()).length;
        const fire = Boolean(core.phaseData(trigger).fire);
        const result = await player.chooseTarget('筹炬：选择一名其他角色，令所有角色本轮对其用牌无距离且不计次数，然后你摸' + count + '张牌并执行一个额外出牌阶段',
          function (card, owner, target) { return target !== owner && core.inPlay(target); })
          .set('ai', target => -get.attitude(player, target)).forResult();
        const target = result.bool && result.targets?.[0];
        if (!target || target === player || !core.inPlay(target) || !core.inPlay(player)) return;
        player.storage ??= {};
        player.storage[USED] = core.round();
        player.syncStorage?.(USED);
        player.logSkill?.(ID, target);
        grant(target);
        if (count > 0) await player.draw(count);
        if (fire && core.inPlay(player)) {
          const cards = randomFives(count);
          if (cards.length) await player.gain(cards, 'gain2');
        }
        if (core.inPlay(player)) queuePhase(player);
      },
      mark: true,
      intro: { content(storage, player) { return upgraded(player) ? '已永久修改：无势力覆盖条件；额外出牌阶段火伤后封锁受伤角色响应后续牌' : '每轮限一次，击杀后刷新本轮次数'; } },
      ai: { threaten: 2.5 },
    },
    [RESET]: {
      trigger: { source: 'dieAfter' },
      forced: true,
      popup: false,
      filter(event, player) { return event.source === player && used(player); },
      async content(event, trigger, player) { reset(player); },
    },
    [LEASE]: {
      charlotte: true,
      mark: true,
      marktext: '炬',
      intro: { content: '本轮在所有其他角色的攻击范围内；所有角色对你使用牌无距离限制且不计次数' },
      mod: { inRangeOf(from, to) { if (from !== to && hasLease(to)) return true; } },
    },
    [RULES]: {
      charlotte: true,
      mod: {
        inRange(from, to) { if (from !== to && hasLease(to)) return true; },
        inRangeOf(from, to) { if (from !== to && hasLease(to)) return true; },
        targetInRange(card, player, target) { if (hasLease(target)) return true; },
        cardUsableTarget(card, player, target) { if (hasLease(target)) return true; },
        cardEnabled(card, player, event) { if (blocked(player, event)) return false; },
        cardEnabled2(card, player, event) { if (blocked(player, event)) return false; },
        cardRespondable(card, player) { if (blocked(player, _status.event)) return false; },
        wuxieEnabled(card, source, target, responder) { if (blocked(responder, _status.event, source, card)) return false; },
      },
    },
    [REFUND]: {
      trigger: { player: 'useCard1' },
      charlotte: true,
      forced: true,
      popup: false,
      firstDo: true,
      filter(event) { return event.addCount !== false && event.targets?.some(hasLease); },
      async content(event, trigger, player) {
        if (trigger.addCount === false) return;
        trigger.addCount = false;
        const stat = player.getStat('card');
        if (typeof stat?.[trigger.card.name] === 'number' && stat[trigger.card.name] > 0) stat[trigger.card.name]--;
      },
    },
    [FIRE]: {
      trigger: { global: 'damageSource' },
      charlotte: true,
      forced: true,
      popup: false,
      filter(event, player) {
        const state = extras.get(core.phaseUseOf(event));
        return Boolean(state && state.owner === player && event.source === player && !event.unreal && event.num > 0 && game.hasNature(event, 'fire'));
      },
      async content(event, trigger, player) {
        const state = extras.get(core.phaseUseOf(trigger));
        if (!state) return;
        if (upgraded(player) && !state.victims.has(trigger.player)) state.victims.set(trigger.player, findUse(trigger, player));
        if (core.inPlay(player)) await player.draw(1);
      },
    },
    [CLEANUP]: {
      trigger: { global: ['phaseUseAfter', 'phaseUseCancelled', 'phaseUseSkipped'] },
      charlotte: true,
      forced: true,
      popup: false,
      firstDo: true,
      priority: 100,
      filter(event) { return extras.has(event); },
      async content(event, trigger) { finishPhase(trigger); },
    },
  };

  api.chouju = { upgraded, upgrade, used, reset, canActivate, hasLease, grant, finishPhase, install };
  return {
    skills,
    translate: {
      [ID]: '筹炬',
      [ID + '_info']: '每轮限一次，一名角色的出牌阶段结束时，若本阶段使用牌指定过现存的所有势力的角色为目标，你可选择一名其他角色：本轮所有其他角色视为其在攻击范围内，且所有角色对其使用牌无距离限制且不计次数；你摸X张牌，若本阶段有人造成过火焰伤害，你再从牌堆、弃牌堆依次随机获得共X张点数为5的牌（X为现存势力数），然后你执行一个额外出牌阶段，此阶段你每造成一次火焰伤害便摸一张牌。你杀死角色后，刷新本轮发动次数。',
      [ID + '_modified']: '筹炬·改',
      [ID + '_modified_info']: '每轮限一次，一名角色的出牌阶段结束时，你可选择一名其他角色：本轮所有其他角色视为其在攻击范围内，且所有角色对其使用牌无距离限制且不计次数；你摸X张牌，若本阶段有人造成过火焰伤害，你再从牌堆、弃牌堆依次随机获得共X张点数为5的牌（X为现存势力数），然后你执行一个额外出牌阶段，此阶段你每造成一次火焰伤害便摸一张牌，且受伤角色至该阶段结束不能响应你此后使用的牌（包括使用无懈可击和打出牌）。你杀死角色后，刷新本轮发动次数。',
      [LEASE]: '筹炬',
    },
    content: install,
  };
},
function (lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wuzhouyu_xiongxian';
  const TAG = 'visible_bjgy_wuzhouyu_xiongxian';
  const GLOBALS = [ID + '_link', ID + '_shown', ID + '_chain'];
  const turns = new Map();
  const exposed = new Map();
  const shownEvents = new WeakSet();
  const chainEvents = new WeakSet();
  const chainSeen = new WeakMap();
  let installed = false;

  function players() {
    return game.filterPlayer(current => api.core.inPlay(current));
  }

  function isLocked(player) {
    for (const state of turns.values()) if (state.locked.has(player)) return true;
    return false;
  }

  function hasTag(card) {
    return typeof card.hasGaintag === 'function' ? card.hasGaintag(TAG) : card.gaintag?.includes(TAG);
  }

  async function syncShown() {
    const eligible = new Map();
    if (turns.size) {
      for (const current of players()) {
        if (current.isLinked()) for (const card of current.getCards('h')) eligible.set(card, current);
      }
    }
    // Explicit cards matter: a card may already have left its former owner's
    // hand. Never clear all visible tags or another skill's exposure.
    for (const [card, owner] of exposed) {
      if (eligible.get(card) !== owner) {
        owner.removeGaintag(TAG, [card]);
        exposed.delete(card);
      }
    }
    for (const current of players()) {
      const cards = [];
      for (const [card, owner] of eligible) {
        if (owner !== current) continue;
        exposed.set(card, current);
        if (!hasTag(card)) cards.push(card);
      }
      if (cards.length) await current.addShownCards(cards, TAG);
    }
  }

  function chainOf(damage) {
    const parent = damage?.parent || damage?.getParent?.();
    return parent && ['_lianhuan', '_lianhuan2'].includes(parent.name) ? parent : null;
  }

  function collectFive(player) {
    const cards = new Set();
    const lose_list = [];
    for (const position of ['cardPile', 'discardPile']) {
      for (const card of Array.from(ui[position]?.childNodes || [])) if (get.number(card) === 5) cards.add(card);
    }
    for (const current of players()) {
      const selected = current.getCards(current === player ? 'ej' : 'ejh').filter(card => get.number(card, current) === 5);
      const own = [...new Set(selected)].filter(card => !cards.has(card));
      if (own.length) {
        lose_list.push([current, own]);
        for (const card of own) cards.add(card);
      }
    }
    return { cards: [...cards], lose_list };
  }

  async function gainFive(player) {
    // Freeze both the set and effective point values while cards still have
    // their original owners. Moving a hand card can change get.number(card).
    const snapshot = collectFive(player);
    if (snapshot.lose_list.length) {
      for (const [current, cards] of snapshot.lose_list) current.$throw(cards);
      await game.loseAsync({ lose_list: snapshot.lose_list }).setContent('chooseToCompareLose');
      await game.delayx();
    }
    if (snapshot.cards.length) await player.gain(snapshot.cards, 'gain2');
  }

  function install() {
    if (installed) return;
    installed = true;
    api.core.onTurnEnd(async turn => {
      if (!turns.delete(turn)) return;
      await syncShown();
    });
    for (const id of GLOBALS) game.addGlobalSkill(id);
  }

  const skills = {
    [ID]: {
      enable: 'phaseUse',
      limited: true,
      skillAnimation: true,
      animationColor: 'fire',
      manualConfirm: true,
      filter(event, player) {
        if (!player || player.storage?.[ID] || !api.core.inPlay(player)) return false;
        const phase = api.core.phaseUseOf(event);
        return Boolean(phase && phase.player === player && api.core.turnOf(event));
      },
      async content(event, trigger, player) {
        install();
        const turn = api.core.turnOf(event);
        if (!turn || player.storage?.[ID]) return;
        player.storage[ID] = true;
        player.awakenSkill(ID);
        // Copy before any linking or addShownCards events: newly shown players
        // get the dynamic exposure, never an additional forced-link lock.
        const locked = new Set([...api.core.shownPlayers(event)].filter(current => api.core.inPlay(current)));
        const state = turns.get(turn) || { locked: new Set() };
        for (const current of locked) state.locked.add(current);
        turns.set(turn, state);
        for (const current of locked) if (!current.isLinked()) await current.link(true);
        await syncShown();
        const controls = ['改写顾曲', '改写筹炬', '获得所有5点牌'];
        const result = await player.chooseControl(controls)
          .set('prompt', '雄贤：选择一项')
          .set('choiceList', ['永久改写〖顾曲〗', '永久改写〖筹炬〗', '获得牌堆、弃牌堆、场上及其他角色手牌区内的所有当前点数为5的牌'])
          .set('ai', () => {
            const value = collectFive(player).cards.reduce((sum, card) => sum + (get.value(card, player) || 0), 0);
            if (value >= 18) return 2;
            return !api.guqu.upgraded(player) ? 0 : 1;
          }).forResult();
        let choice = Number.isInteger(result?.index) ? result.index : controls.indexOf(result?.control);
        if (choice < 0 || choice >= controls.length) choice = 0;
        if (choice === 0) api.guqu.upgrade(player);
        else if (choice === 1) api.chouju.upgrade(player);
        else await gainFive(player);
      },
      ai: { order: 8, result: { player: 1 }, threaten: 2 },
    },
    [ID + '_link']: {
      trigger: { player: 'linkBefore' },
      forced: true, charlotte: true, silent: true, popup: false,
      firstDo: true, priority: 100000, forceDie: true, forceOut: true,
      filter(event) { return turns.size > 0 && isLocked(event.player) && event.player.isLinked(); },
      async content(event, trigger) {
        // Native link(bool) checks bool only when creating the event, while
        // content.link always toggles. Cancel before that toggle, including the
        // link() created by native _lianhuan4 on elemental damage.
        trigger.cancel();
      },
    },
    [ID + '_shown']: {
      trigger: { global: ['linkAfter', 'gainAfter', 'loseAfter', 'loseAsyncAfter', 'equipAfter', 'addJudgeAfter', 'addToExpansionAfter', 'hideShownCardsAfter', 'dieAfter'] },
      forced: true, charlotte: true, silent: true, popup: false,
      firstDo: true, priority: 10000, forceDie: true, forceOut: true,
      filter(event) { return (turns.size > 0 || exposed.size > 0) && !shownEvents.has(event); },
      async content(event, trigger) {
        // A global skill can be arranged for several observers before its
        // first content runs. Keep the guard here as well as in filter.
        if (shownEvents.has(trigger)) return;
        shownEvents.add(trigger);
        await syncShown();
      },
    },
    [ID + '_chain']: {
      trigger: { player: 'damageBefore' },
      forced: true, charlotte: true, silent: true, popup: false,
      firstDo: true, priority: 100000, forceDie: true, forceOut: true,
      filter(event) { return turns.size > 0 && !chainEvents.has(event) && Boolean(chainOf(event)); },
      async content(event, trigger) {
        if (chainEvents.has(trigger)) return;
        chainEvents.add(trigger);
        const chain = chainOf(trigger);
        if (!chain) return;
        let seen = chainSeen.get(chain);
        if (!seen) {
          seen = new Set([chain.player]);
          chainSeen.set(chain, seen);
        }
        if (seen.has(trigger.player)) trigger.cancel();
        else seen.add(trigger.player);
        // Leave native _lianhuan.targets, lianhuanable and notLink() intact.
        // There is no custom damage propagation or second transmission queue.
      },
    },
  };

  const translate = {
    [ID]: '雄贤',
    [ID + '_info']: '限定技。出牌阶段，你可以令本回合展示过手牌的所有角色横置，且这些角色至本回合结束不能解除横置状态。本回合，所有横置角色的手牌明置。然后你选择一项：永久改写〖顾曲〗；永久改写〖筹炬〗；获得牌堆、弃牌堆、场上及其他角色手牌区内所有当前点数为5的牌。',
    [TAG]: '雄贤',
  };
  api.xiongxian = { install, isLocked, collectFive, syncShown, tag: TAG };
  return { skills, translate, content: install };
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills));
 const translate=Object.assign({},...modules.map(module=>module.translate));
 let scheduled=false;
 return {
  name:'武周瑜',editable:true,connect:false,
  async content(){
   // Native loadExtension calls content before package.skill registration.
   if(scheduled)return;scheduled=true;
   // ui.create.arena drains arenaReady synchronously without awaiting callbacks.
   (lib.arenaReady??=[]).push(function installWuzhouyu(){api.core.install();api.chouju.install();api.xiongxian.install();});
  },
  async precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_wuzhouyu:['male','wu',4,['bjgy_wuzhouyu_guqu','bjgy_wuzhouyu_chouju','bjgy_wuzhouyu_xiongxian'],['die:false','ext:武周瑜/bjgy_wuzhouyu.jpg']]},
    translate:{bjgy_wuzhouyu:'武周瑜'},characterIntro:{bjgy_wuzhouyu:'武周瑜，吴、男性、4/4。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画：设计者提供的GPT生成图。'},
    dynamicTranslate:{
     bjgy_wuzhouyu_guqu(player){return translate['bjgy_wuzhouyu_guqu'+(api.guqu.upgraded(player)?'_revised_info':'_info')];},
     bjgy_wuzhouyu_chouju(player){return translate['bjgy_wuzhouyu_chouju'+(api.chouju.upgraded(player)?'_modified_info':'_info')];}
    }},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'武周瑜：吴、男、4/4。顾曲、筹炬、雄贤，含两项永久改技、持续明置手牌与锁定横置，面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_wuzhouyu.jpg'],card:[],skill:[],audio:[]}
 };
});
