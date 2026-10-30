// 武杜预 v0.1.0 测试版；技能设计：辟境归元；实现与打包：OpenAI Codex协助。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function createPozhu(lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wuduyu_pozhu';
  const DYING = ID + '_dying';
  const turnStates = new WeakMap();
  const outsideTurns = new WeakMap();
  const pendingDamage = new WeakMap();

  function phaseOf(event) {
    const phase = event?.name === 'phase' ? event : event?.getParent?.('phase', true, true);
    return phase?.name === 'phase' ? phase : null;
  }

  function pointsOf(event, player, create = false) {
    // Event identity also covers inserted turns and phaseBefore, before the
    // engine increments phaseNumber. Skill loss/reacquisition does not reset it.
    const phase = phaseOf(event);
    if (phase) {
      let players = turnStates.get(phase);
      if (!players && create) turnStates.set(phase, players = new WeakMap());
      let points = players?.get(player);
      if (!points && create) players.set(player, points = new Set());
      return points;
    }
    let state = outsideTurns.get(player);
    if (state?.turn !== game.phaseNumber) state = undefined;
    if (!state && create) outsideTurns.set(player, state = { turn: game.phaseNumber, points: new Set() });
    return state?.points;
  }

  function eligible(event, player) {
    const target = event.target;
    if (!target || target === player || !target.isIn()) return false;
    const number = get.number(event.card, player);
    return Number.isInteger(number) && number >= 1 && number <= 13 &&
      Number.isInteger(target.hp) && target.hp > 0 && number % target.hp === 0 &&
      !pointsOf(event, player)?.has(number);
  }

  function pendingFor(dying) {
    for (let parent = dying.getParent(); parent; parent = parent.getParent?.()) {
      const pending = pendingDamage.get(parent);
      if (pending && pending.target === dying.player) return pending;
    }
    return null;
  }

  const skills = {
    [ID]: {
      trigger: { player: 'useCardToPlayered' },
      filter: eligible,
      logTarget: 'target',
      async cost(event, trigger, player) {
        event.result = await player.chooseBool(
          get.prompt(ID, trigger.target),
          '对其造成1点普通伤害（当前点数：' + get.number(trigger.card, player) + '）'
        ).set('ai', () => get.damageEffect(trigger.target, player, player) > 0).forResult();
      },
      async content(event, trigger, player) {
        if (!eligible(trigger, player)) return;
        const number = get.number(trigger.card, player);
        const points = pointsOf(trigger, player, true);
        points.add(number);
        // nocard prevents the native damage factory from inheriting the used
        // card. This is skill damage even while resolving a card's target event.
        const damage = trigger.target.damage({ num: 1, source: player, nocard: true });
        const pending = { target: trigger.target, enteredDying: false };
        pendingDamage.set(damage, pending);
        try {
          await damage;
        } finally {
          pendingDamage.delete(damage);
        }
        if (number === 12 || pending.enteredDying) points.clear();
      },
      ai: { expose: 0.2 },
    },
    [DYING]: {
      charlotte: true,
      forced: true,
      silent: true,
      popup: false,
      forceDie: true,
      forceOut: true,
      firstDo: true,
      priority: 100,
      trigger: { global: 'dying' },
      filter(event, player) {
        return event.player === player && !!pendingFor(event);
      },
      async content(event, trigger) {
        const pending = pendingFor(trigger);
        if (pending) pending.enteredDying = true;
      },
    },
  };

  function install() {
    game.addGlobalSkill(DYING);
  }
  api.pozhu = { install };
  return {
    skills,
    translate: {
      [ID]: '破竹',
      [DYING]: '破竹',
      [ID + '_info']: '每回合每个点数限一次，你使用牌指定其他角色为目标时，若其当前体力值是此牌当前有效点数的正约数，你可以对其造成1点普通伤害。若其因此进入过濒死状态，或此牌点数为Q，则清空本回合此技能所有点数的已发动记录。',
    },
  };
},
function createBocai(lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wuduyu_bocai';
  const DIVISORS = [1, 2, 3, 4, 6, 12];

  function names(player) {
    return Array.isArray(player.storage[ID]) ? player.storage[ID].slice() : [];
  }
  function usableName(player, name) {
    return names(player).includes(name) && ['basic', 'trick'].includes(get.type2(name));
  }
  function material(card, player) {
    return player.getCards('he').includes(card) && DIVISORS.includes(get.number(card, player)) &&
      game.checkMod(card, player, 'unchanged', 'cardEnabled2', player) !== false;
  }
  function available(player, name) {
    return usableName(player, name) && player.countCards('he', card => material(card, player)) > 0;
  }
  function choices(player) {
    const list = [];
    for (const name of names(player)) {
      if (!usableName(player, name)) continue;
      list.push([get.translation(get.type2(name)), '', name]);
      if (name === 'sha') for (const nature of lib.inpile_nature) list.push(['基本', '', name, nature]);
    }
    return list;
  }
  function allowed(event, player, link) {
    if (event?.name !== 'chooseToUse' || event.responded || !usableName(player, link[2])) return false;
    return player.getCards('he').some(card => material(card, player) && event.filterCard(
      get.autoViewAs({ name: link[2], nature: link[3], number: get.number(card, player) }, [card], player), player, event
    ));
  }
  function drawCount(number) {
    return Math.ceil(DIVISORS.filter(divisor => number % divisor === 0).length / 2);
  }
  function snapshot(result, player, name) {
    if (!result?.card || result.cards?.length !== 1) return;
    const number = get.number(result.cards[0], player);
    result.card.number = number;
    result.card.storage = { ...result.card.storage, [ID]: { name, number, confirmed: false } };
  }
  function pending(event, player) {
    const data = event.card?.storage?.[ID];
    return data?.confirmed && !data.settled && names(player).includes(data.name) ? data : null;
  }
  function refresh(player) {
    player.syncStorage(ID);
    player.markSkill(ID);
  }
  function reward(player) {
    let cards = Array.from(ui.cardPile.childNodes).filter(card => get.number(card, false) === 12);
    if (!cards.length) cards = Array.from(ui.discardPile.childNodes).filter(card => get.number(card, false) === 12);
    if (cards.length) player.gain(cards.randomGet(), 'gain2');
  }

  const skills = {
    [ID]: {
      enable: 'chooseToUse',
      group: [ID + '_record'],
      mark: true,
      marktext: '博',
      intro: { content(storage, player) { const list = names(player); return list.length ? '已记录：' + list.map(name => get.translation(name)).join('、') : '尚未记录牌名'; } },
      filter(event, player) { return choices(player).some(link => allowed(event, player, link)); },
      hiddenCard(player, name) { return available(player, name); },
      chooseButton: {
        dialog(event, player) { return ui.create.dialog('博才', [choices(player), 'vcard']); },
        filter(button, player) { return allowed(_status.event.getParent(), player, button.link); },
        check(button) {
          const player = _status.event.player;
          return _status.event.getParent()?.type === 'phase' ? player.getUseValue({ name: button.link[2], nature: button.link[3] }) : 1;
        },
        backup(links) {
          // Capture the name, not an index into records that can change during
          // nested card resolutions and other players' reactions.
          const name = links[0][2], nature = links[0][3];
          return {
            position: 'he', selectCard: 1, popname: true,
            filterCard(card, player) { return material(card, player); },
            check(card) { return 7 - get.value(card); },
            viewAs(cards, player) { return { name, nature, number: cards.length ? get.number(cards[0], player) : undefined }; },
            // The installed StepCompiler discards closures of synchronous
            // event entrypoints; this must remain async even without await.
            async precontent(event, trigger, player) { snapshot(event.result, player, name); },
            onuse(result, player) {
              if (!result.bool || result.cancel) return;
              if (!result.card?.storage?.[ID]) snapshot(result, player, name);
              if (result.card?.storage?.[ID]) result.card.storage[ID].confirmed = true;
            },
          };
        },
        prompt(links) { return '将一张点数为1、2、3、4、6或Q的牌当' + get.translation(links[0][3] || '') + '【' + get.translation(links[0][2]) + '】使用'; },
      },
      ai: {
        order: 5, save: true, respondSha: true, respondShan: true,
        skillTagFilter(player, tag, arg) {
          if (arg === 'respond') return false;
          const name = tag === 'respondSha' ? 'sha' : tag === 'respondShan' ? 'shan' : tag === 'save' ? 'tao' : null;
          if (!name || !available(player, name)) return false;
        },
      },
    },
    [ID + '_record']: {
      trigger: { player: 'useCard1', target: 'useCardToTargeted' },
      forced: true, popup: false,
      filter(event, player) { return !!event.card?.name && !names(player).includes(event.card.name); },
      async content(event, trigger, player) {
        const name = trigger.card.name, list = names(player);
        if (list.includes(name)) return;
        list.push(name);
        player.storage[ID] = list;
        refresh(player);
        if (DIVISORS.includes(list.length) || list.length % 12 === 0) reward(player);
      },
    },
    [ID + '_after']: {
      trigger: { player: 'useCardAfter' },
      charlotte: true, forced: true, popup: false,
      filter(event, player) { return event.player === player && !!pending(event, player); },
      async content(event, trigger, player) {
        const data = pending(trigger, player);
        if (!data) return;
        data.settled = true;
        const count = drawCount(data.number);
        const result = await player.chooseBool('博才：是否删除【' + get.translation(data.name) + '】的记录并摸' + count + '张牌？')
          .set('ai', () => true).forResult();
        // Another nested settlement may already have removed this name while
        // the choice was open. Only an actual deletion earns these cards.
        const list = names(player), index = list.indexOf(data.name);
        if (!result.bool || index < 0) return;
        list.splice(index, 1);
        player.storage[ID] = list;
        refresh(player);
        player.draw(count);
      },
    },
  };

  // Confirmation creates a continuation of that use. Losing or blocking the
  // skill while the card resolves must not cancel this already-started effect.
  // Only recording remains in the player-owned group, so future records stop.
  api.bocai = { names, install() { game.addGlobalSkill(ID + '_after'); } };
  return {
    skills,
    translate: {
      [ID]: '博才', [ID + '_backup']: '博才', [ID + '_record']: '博才', [ID + '_after']: '博才',
      [ID + '_info']: '当你使用牌或成为牌的目标时，若此牌名未被记录，你记录之。新记录后，若记录数为12的约数或正倍数，你从牌堆中随机获得一张点数为Q的牌（牌堆没有则改为弃牌堆，没有则不获得）。你可以将一张点数为12的约数的手牌或装备区里的牌，当记录过的基本牌或锦囊牌使用（包括延时锦囊，不包括纯打出）。以此法使用的牌结算完成后，你可以删除其牌名记录并摸X张牌（X为此牌点数与12的公因数数量的一半，向上取整）。所有属性的【杀】共用牌名记录。',
    },
  };
},
function beixianFactory(lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wuduyu_beixian';
  const EFFECT = ID + '_effect';
  const ledgers = new WeakMap();

  function state(player) { return player.storage[EFFECT]; }
  function categories(player) {
    return new Set(api.bocai.names(player).map(name => get.type2(name))
      .filter(type => ['basic', 'trick', 'equip'].includes(type))).size;
  }
  function actual(event) { return !event.unreal && event.num > 0; }
  function recorded(player, event) {
    return actual(event) && player.actionHistory.some(history => history.sourceDamage?.includes(event));
  }
  function ledger(player, create = false) {
    const history = player.getHistory('sourceDamage');
    let turns = ledgers.get(player);
    if (!turns && create) ledgers.set(player, turns = new WeakMap());
    let value = turns?.get(history);
    if (!value && create) turns.set(history, value = { spent: 0, pending: new Set() });
    return value;
  }
  function occupied(player) {
    const value = ledger(player);
    if (!value) return 0;
    let count = value.spent;
    // Only allocated tickets count after activation. In particular, a nested
    // damage denied a reserved ticket must not consume it when the enclosing
    // damage is later canceled. Count completed-but-not-finalized tickets once.
    for (const event of value.pending) {
      if (recorded(player, event) || (!event.finished && actual(event))) count++;
    }
    return count;
  }

  const skills = {
    [ID]: {
      audio: false,
      enable: 'phaseUse',
      limited: true,
      skillAnimation: true,
      animationColor: 'thunder',
      filter(event, player) { return !state(player)?.used; },
      async content(event, trigger, player) {
        if (state(player)?.used) return;
        const x = categories(player);
        // This separate permanent record survives ordinary removal/reacquisition
        // of the limited skill, including clearing its native awakened marker.
        player.storage[EFFECT] = { used: true, x };
        // Pre-activation actual damage is the one-time baseline for this turn;
        // later turns get fresh ledgers keyed by native history segment identity.
        ledger(player, true).spent = player.getHistory('sourceDamage').filter(actual).length;
        player.syncStorage(EFFECT);
        player.markSkill(EFFECT);
        player.awakenSkill(ID);
        if (x > 0) await player.gainMaxHp(x);
        const missing = player.maxHp - player.hp;
        if (missing > 0) await player.recover(missing);
      },
      ai: {
        order: 10,
        result: { player(player) { return categories(player) + Math.max(0, player.maxHp - player.hp); } },
      },
    },
    [EFFECT]: {
      charlotte: true,
      forced: true,
      silent: true,
      popup: false,
      forceDie: true,
      forceOut: true,
      priority: 100,
      trigger: { source: 'damageBegin1' },
      filter(event, player) {
        return actual(event) && state(player)?.x > occupied(player) && !ledger(player)?.pending.has(event);
      },
      async content(event, trigger, player) {
        if (!actual(trigger) || !(state(player)?.x > occupied(player))) return;
        const value = ledger(player, true);
        if (value.pending.has(trigger)) return;
        value.pending.add(trigger);
        trigger.num++;
        // The native after queue runs even for damage canceled before its body.
        // Commit only a successful allocated ticket. A canceled/zero/unreal
        // ticket is refunded for the next damage; completed nested damage that
        // had no ticket is neither charged nor retroactively increased.
        trigger.insertAfter(async function () {
          if (value.pending.delete(trigger) && recorded(player, trigger)) value.spent++;
        }, { player, forceDie: true, includeOut: true });
      },
      marktext: '贤',
      intro: { content(storage) {
        return `备贤已发动，X固定为${storage?.x || 0}；每回合前${storage?.x || 0}次伤害机会+1（发动前实际伤害计入）。伤害开始时预占，取消后返还给下一次伤害，已结算的嵌套伤害不补伤`;
      } },
    },
  };
  let installed = false;
  api.beixian = {
    install() {
      if (installed) return;
      game.addGlobalSkill(EFFECT);
      installed = true;
    },
    state, categories,
  };
  return {
    skills,
    translate: {
      [ID]: '备贤', [EFFECT]: '备贤',
      [ID + '_info']: '限定技，出牌阶段，你增加X点体力上限，然后将体力回复至上限。此后，你每回合前X次实际造成的伤害+1。X为发动时“博才”记录牌名所属的大类别数（基本牌、锦囊牌、装备牌，延时锦囊归入锦囊），至多为3，发动后固定。本回合发动前已实际造成的伤害计入前X次；一笔多点伤害只计一次，连环伤害分别计次，取消、零点及虚假伤害不计次。嵌套伤害按伤害开始顺序预占次数，取消后返还给下一次伤害；未分到次数且已结算的内层伤害不补伤，也不占用返还的次数。X为0仍可发动并回复体力。',
    },
  };
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills));
 const translate=Object.assign({},...modules.map(module=>module.translate));
 let scheduled=false;
 return {
  name:'武杜预',editable:true,connect:false,
  async content(){
   if(scheduled)return;scheduled=true;
   (lib.arenaReady??=[]).push(function installWuduyu(){
    api.pozhu.install();api.bocai.install();api.beixian.install();
   });
  },
  async precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_wuduyu:['male','qun',4,['bjgy_wuduyu_pozhu','bjgy_wuduyu_bocai','bjgy_wuduyu_beixian'],['die:false','ext:武杜预/bjgy_wuduyu.jpg']]},
    translate:{bjgy_wuduyu:'武杜预'},characterIntro:{bjgy_wuduyu:'武杜预，群、男性、初始体力4，体力上限4。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由设计者提供。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'武杜预：群、男、4/4。破竹、博才、备贤。面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_wuduyu.jpg'],card:[],skill:[],audio:[]}
 };
});
