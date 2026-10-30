// 武王濬 v0.1.0 测试版；技能设计：辟境归元；实现与打包：OpenAI Codex协助。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function createXiajiang(lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wuwangjun_xiajiang';

  // phaseNumber advances for every actual turn, including another player's or
  // an inserted turn. Queries never mutate storage or consume an activation.
  function state(player) {
    const saved = player.storage[ID];
    return saved && saved.turn === game.phaseNumber ? saved : { turn: game.phaseNumber, used: [], locked: false };
  }
  function ordinary(name) {
    return lib.inpile.includes(name) && ['basic', 'trick'].includes(get.type(name));
  }
  function material(card, player) {
    return player.getCards('h').includes(card) && game.checkMod(card, player, 'unchanged', 'cardEnabled2', player) !== false;
  }
  function available(player, name) {
    const data = state(player);
    return ordinary(name) && !data.locked && !data.used.includes(name) && player.countCards('h', card => material(card, player)) > 0;
  }
  function names(player) {
    const list = [];
    for (const name of lib.inpile) {
      if (!available(player, name)) continue;
      list.push([get.translation(get.type(name)), '', name]);
      if (name === 'sha') for (const nature of lib.inpile_nature) list.push(['基本', '', name, nature]);
    }
    return list;
  }
  function allowed(event, player, link) {
    if (event?.name !== 'chooseToUse' || event.responded || !available(player, link[2])) return false;
    // Candidate admission must include real materials: rank restrictions and
    // Quxian's per-entity count exemption cannot be evaluated on an unsure card.
    // The native backup still validates the player's final selection normally.
    const hand = player.getCards('h').filter(card => material(card, player));
    const accepts = cards => event.filterCard(
      get.autoViewAs({ name: link[2], nature: link[3], number: total(cards, player) }, cards, player), player, event
    );
    for (let i = 0; i < hand.length; i++) {
      if (accepts([hand[i]])) return true;
      for (let j = i + 1; j < hand.length; j++) if (accepts([hand[i], hand[j]])) return true;
    }
    return false;
  }
  function total(cards, player) {
    return cards.reduce((sum, card) => {
      const number = get.number(card, player);
      return sum + (typeof number === 'number' && Number.isFinite(number) ? number : 0);
    }, 0);
  }
  function snapshot(result, player) {
    if (!result?.card || !result.cards?.length) return;
    const number = total(result.cards, player);
    result.card.number = number;
    result.card.storage = { ...result.card.storage, [ID]: { number } };
  }

  const skills = {
    [ID]: {
      enable: 'chooseToUse',
      filter(event, player) { return names(player).some(link => allowed(event, player, link)); },
      hiddenCard(player, name) { return available(player, name); },
      chooseButton: {
        dialog(event, player) { return ui.create.dialog('下江', [names(player), 'vcard']); },
        filter(button, player) { return allowed(_status.event.getParent(), player, button.link); },
        check(button) {
          const player = _status.event.player;
          return _status.event.getParent().type === 'phase' ? player.getUseValue({ name: button.link[2], nature: button.link[3] }) : 1;
        },
        backup(links) {
          const name = links[0][2], nature = links[0][3];
          return {
            position: 'h', selectCard: [1, 2], complexCard: true, popname: true,
            filterCard(card, player) { return material(card, player); },
            check(card) {
              const player = _status.event.player;
              const sum = total(ui.selected.cards.concat(card), player);
              return (sum === 10 ? 20 : 7) - get.value(card);
            },
            viewAs(cards, player) { return { name, nature, number: total(cards, player) }; },
            // This must stay async: the installed StepCompiler reconstructs
            // synchronous event functions and discards this factory closure.
            async precontent(event, trigger, player) { snapshot(event.result, player); },
            onuse(result, player) {
              // Player.useResult calls onuse only after final confirmation and
              // before Player.useCard constructs the VCard or moves materials.
              if (!result.bool || result.cancel) return;
              if (!result.card.storage?.[ID]) snapshot(result, player);
              const data = state(player), name = result.card.name;
              player.storage[ID] = {
                turn: game.phaseNumber,
                used: data.used.includes(name) ? data.used.slice() : data.used.concat(name),
                locked: data.locked || result.card.storage[ID].number !== 10,
              };
            },
          };
        },
        prompt(links) { return '将一至两张手牌当' + get.translation(links[0][3] || '') + '【' + get.translation(links[0][2]) + '】使用'; },
      },
      ai: {
        order: 4, save: true, respondSha: true, respondShan: true,
        skillTagFilter(player, tag, arg) {
          if (arg === 'respond') return false;
          const name = tag === 'respondSha' ? 'sha' : tag === 'respondShan' ? 'shan' : tag === 'save' ? 'tao' : null;
          if (!name || !available(player, name)) return false;
        },
      },
    },
  };
  // No global trigger is required: confirmed uses own all state, and the
  // current global turn number invalidates it without removal/death hooks.
  api.xiajiang = { install() {} };
  return {
    skills,
    translate: {
      [ID]: '下江',
      [ID + '_backup']: '下江',
      [ID + '_info']: '每回合每种牌名限一次，你可以将一至两张手牌当任意基本牌或普通锦囊牌使用（不包括纯打出，所有属性的【杀】共用次数）。此牌点数为素材牌离手前的有效点数之和。若点数之和不为10，本次牌正常使用，然后本回合下江失效。',
    },
  };
},
function quanouFactory(lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wuwangjun_quanou';
  const LINK = ID + '_link';
  const GROWTH = ID + '_growth';
  const VULNERABLE = ID + '_vulnerability';
  const COUNTS = ID + '_counts';

  function growth(player) {
    return player.storage[GROWTH] || { draw: 0, sha: 0, hand: 0 };
  }
  function vulnerability(player) { return player.storage[VULNERABLE] || 0; }
  function counts(player) {
    // The engine increments game.phaseNumber for every player's turn,
    // including inserted turns; this must not use player.phaseNumber.
    let value = player.storage[COUNTS];
    if (!value || value.turn !== game.phaseNumber) {
      value = player.storage[COUNTS] = { turn: game.phaseNumber, give: 0, link: 0 };
    }
    return value;
  }
  function sync(player, key) {
    player.syncStorage(key);
    player.markSkill(key);
  }
  function increase(player, fields) {
    const value = player.storage[GROWTH] = { ...growth(player) };
    for (const field of fields) value[field]++;
    sync(player, GROWTH);
  }
  function livingGroups() {
    return new Set(game.filterPlayer(current => current.isIn()).map(current => current.group)).size;
  }
  function recastable(player, card) {
    return player.getCards('he').includes(card) && player.canRecast(card);
  }

  async function recastAndSearch(player) {
    const available = player.getCards('he').filter(card => recastable(player, card));
    if (!available.length) return;
    const result = await player.chooseCard('he', [0, available.length], '全瓯：重铸任意张牌（可以不选）')
      .set('filterCard', card => available.includes(card) && recastable(player, card))
      .set('ai', card => 5 - get.value(card))
      .forResult();
    const cards = (result.cards || []).filter(card => recastable(player, card));
    if (!result.bool || !cards.length || !player.isIn()) return;

    // Numbers must be captured while these cards still belong to the owner.
    // Read the native lose event's cards2 afterward: a prevented loss or a card
    // moved away during loss processing is not an actually recast card.
    const numbers = new Map();
    let loss;
    const recast = player.recast(cards, (owner, selected) => {
      for (const card of selected) {
        const number = get.number(card, owner);
        numbers.set(card, typeof number === 'number' && Number.isFinite(number) ? number : 0);
      }
      loss = owner.loseToDiscardpile(selected);
      loss.log = false;
      return loss;
    });
    await recast;
    if (!player.isIn()) return;
    const actual = loss?.done?.cards2 || [];
    const total = actual.reduce((sum, card) => sum + (numbers.get(card) || 0), 0);
    const amount = Math.floor(total / 10);
    const found = [];
    const filter = card => !found.includes(card) && get.number(card, false) === 10;
    for (let i = 0; i < amount; i++) {
      const card = get.cardPile(filter, 'cardPile', 'random') || get.cardPile(filter, 'discardPile', 'random');
      if (!card) break;
      found.push(card);
    }
    if (found.length) await player.gain(found, 'gain2');
  }

  const skills = {
    [ID]: {
      audio: false,
      trigger: { player: 'useCardToPlayered' },
      forced: true,
      group: LINK,
      filter(event, player) {
        return event.isFirstTarget && get.number(event.card, player) === 10 &&
          event.targets.some(target => target !== player && target.isIn());
      },
      async content(event, trigger, player) {
        const candidates = trigger.targets.filter(target => target !== player && target.isIn());
        const result = await player.chooseTarget('全瓯：选择此牌的一名其他目标', true,
          (card, owner, target) => candidates.includes(target))
          .set('ai', target => -get.attitude(player, target))
          .forResult();
        const target = result.targets?.[0];
        if (!result.bool || !target?.isIn() || !player.isIn()) return;
        player.logSkill(ID, target);
        const record = counts(player);
        const giveX = record.give + 1;
        const linkX = record.link + 1;
        const giveOption = `交给其${giveX}张牌`;
        const linkOption = `下次属性伤害+${linkX}并横置`;
        const controls = target.countCards('he') >= giveX ? [giveOption, linkOption] : [linkOption];
        const choice = await target.chooseControl(controls)
          .set('prompt', '全瓯：选择一项')
          .set('ai', () => controls.length === 1 ? 0 : 1)
          .forResult();
        if (!target.isIn() || !player.isIn()) return;
        if (choice.control === giveOption && target.countCards('he') >= giveX) {
          record.give++;
          player.syncStorage(COUNTS);
          const amount = record.give;
          const chosen = await target.chooseCard('he', amount, true, `全瓯：交给${get.translation(player)}${amount}张牌`)
            .set('ai', card => 6 - get.value(card))
            .forResult();
          const cards = (chosen.cards || []).filter(card => target.getCards('he').includes(card));
          if (!chosen.bool || cards.length !== amount || !player.isIn()) return;
          await target.give(cards, player);
        } else {
          record.link++;
          player.syncStorage(COUNTS);
          target.storage[VULNERABLE] = vulnerability(target) + record.link;
          sync(target, VULNERABLE);
          // Already-linked targets still receive the pending damage increase,
          // but a no-op must never create a new linkAfter reward.
          if (!target.isLinked()) await target.link(true);
        }
      },
    },
    [LINK]: {
      audio: false,
      trigger: { global: 'linkAfter' },
      forced: true,
      filter(event) { return event.player.isLinked(); },
      async content(event, trigger, player) {
        const groups = livingGroups();
        // Snapshot before fire damage, which may kill a faction's last player
        // or propagate through the engine's native chain-damage mechanism.
        if (groups <= 1 && trigger.player.isIn()) await trigger.player.damage(1, 'fire', player);
        if (!player.isIn()) return;
        if (groups <= 2) increase(player, ['draw', 'sha']);
        if (groups <= 3) await recastAndSearch(player);
        if (!player.isIn()) return;
        if (groups <= 4) {
          await player.draw(1);
          if (player.isIn()) increase(player, ['hand']);
        }
      },
    },
    [VULNERABLE]: {
      charlotte: true,
      forced: true,
      silent: true,
      popup: false,
      priority: 100,
      trigger: { player: 'damageBegin1' },
      filter(event, player) {
        return !event.unreal && event.num > 0 && vulnerability(player) > 0 && event.hasNature();
      },
      async content(event, trigger, player) {
        const reserved = vulnerability(player);
        trigger.num += reserved;
        delete player.storage[VULNERABLE];
        player.syncStorage(VULNERABLE);
        player.unmarkSkill(VULNERABLE);
        // Reserve these layers for this damage only. Later immunity/cancellation
        // must not consume a "next actual damage" increase, while nested damage
        // must not apply the same reserved layers a second time.
        trigger.insertAfter(async function () {
          // Native damage may record a zero-damage entry, so identity in the
          // actual history alone is insufficient. Inspect every turn segment
          // in case damage reactions inserted another turn before cleanup.
          const inflicted = !trigger.unreal && trigger.num > 0 &&
            player.actionHistory.some(history => history.damage?.includes(trigger));
          if (!inflicted) {
            // Reactions may already have granted additional layers; refund by
            // addition rather than restoring an obsolete storage snapshot.
            player.storage[VULNERABLE] = vulnerability(player) + reserved;
            sync(player, VULNERABLE);
          }
        }, { player, forceDie: true, includeOut: true });
      },
      marktext: '瓯',
      intro: { content(storage) { return `下一次受到的属性伤害+${storage || 0}`; } },
    },
    [GROWTH]: {
      charlotte: true,
      forced: true,
      silent: true,
      popup: false,
      trigger: { player: 'phaseDrawBegin2' },
      filter(event, player) { return !event.numFixed && growth(player).draw > 0; },
      async content(event, trigger, player) { trigger.num += growth(player).draw; },
      mod: {
        cardUsable(card, player, num) { if (card.name === 'sha') return num + growth(player).sha; },
        maxHandcard(player, num) { return num + growth(player).hand; },
      },
      marktext: '瓯',
      intro: { content(storage) {
        const value = storage || { draw: 0, sha: 0, hand: 0 };
        return `摸牌阶段摸牌数+${value.draw}，出牌阶段【杀】次数+${value.sha}，手牌上限+${value.hand}`;
      } },
    },
  };
  let installed = false;
  api.quanou = {
    install() {
      if (installed) return;
      game.addGlobalSkill(VULNERABLE);
      game.addGlobalSkill(GROWTH);
      installed = true;
    },
    growth, vulnerability, counts,
  };
  return {
    skills,
    translate: {
      [ID]: '全瓯', [LINK]: '全瓯', [GROWTH]: '全瓯·积功', [VULNERABLE]: '全瓯·易伤',
      [ID + '_info']: '锁定技，你使用点数为10的牌指定目标后，每张牌限一次，你选择其中一名其他角色，令其选择一项：①交给你X张手牌或装备牌；②其下次受到的属性伤害+X，然后横置。X为本回合此选项被选择的次数（含此次），两项分别计数，跨目标共用。牌不足时不能选择①，已横置仍可选择②，易伤可叠加且不因回合结束或解除横置而消失。任意角色横置后，按此时存活角色的势力数依次执行对应及后续各项：①不大于1，你对其造成1点火焰伤害；②不大于2，你的摸牌阶段摸牌数和出牌阶段【杀】次数永久各+1；③不大于3，你可重铸任意张手牌或装备牌，再按实际重铸牌的点数和，每满10点随机获得一张10点牌（先牌堆后弃牌堆）；④不大于4，你摸一张牌，手牌上限永久+1。',
    },
  };
},
function createQuxian(lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wuwangjun_quxian';
  const EFFECT = ID + '_effect';
  const records = new Set();
  const layers = new WeakMap();
  let installed = false;
  const alive = player => !!player && player.isIn();

  function phaseOf(event) {
    const seen = new Set();
    while (event && !seen.has(event)) {
      if (event.name === 'phase') return event;
      seen.add(event);
      event = event.parent || event.getParent?.();
    }
    return null;
  }

  function eligible(player, card, event = _status.event, materials = []) {
    const phase = phaseOf(event);
    if (!phase) return false;
    const entities = new Set();
    const visit = value => {
      if (!value || entities.has(value)) return;
      entities.add(value);
      if (Array.isArray(value.cards)) value.cards.forEach(visit);
    };
    visit(card);
    materials.forEach(visit);
    for (const record of records) {
      if (record.owner !== player || record.phase !== phase || record.closed) continue;
      for (const entity of entities) if (record.cards.has(entity)) return true;
    }
    return false;
  }

  async function close(record) {
    if (record.closed) return;
    record.closed = true;
    records.delete(record);
    record.cards.clear();
    // A second holder can temporarily overwrite an earlier holder's change.
    // Closing the lower layer must not overwrite the still-active top layer.
    for (const entry of record.changes) {
      entry.closed = true;
      const stack = layers.get(entry.player);
      if (!stack || stack[stack.length - 1] !== entry) continue;
      let original;
      while (stack.length && stack[stack.length - 1].closed) original = stack.pop().original;
      if (!stack.length) layers.delete(entry.player);
      if (entry.player.group !== original) {
        const change = entry.player.changeGroup(original);
        // Native AsyncCompiler otherwise suppresses changeGroup for the dead.
        change.forceDie = true;
        change.includeOut = true;
        await change;
      }
    }
  }

  function install() {
    if (installed) return;
    installed = true;
    game.addGlobalSkill(EFFECT);
  }

  const skills = {
    [ID]: {
      audio: false,
      enable: 'phaseUse', limited: true, unique: true,
      skillAnimation: true, animationColor: 'thunder',
      filter(event, player) {
        return alive(player) && !player.storage[ID] && !player.awakenedSkills?.includes(ID) && !!phaseOf(event);
      },
      async content(event, trigger, player) {
        const phase = phaseOf(event);
        if (!phase || !alive(player) || player.storage[ID] || player.awakenedSkills?.includes(ID)) return;
        player.storage[ID] = true;
        player.syncStorage?.(ID);
        player.awakenSkill(ID);
        const group = player.group;
        const targets = game.filterPlayer(target => target !== player && alive(target))
          .map(target => ({ player: target, original: target.group }));
        const record = { owner: player, phase, cards: new Set(), changes: [], closed: false };
        records.add(record);
        // Cleanup is attached to this exact native phase. It runs after both
        // explicit phaseAfter content and the GameEvent lifecycle phaseAfter,
        // survives owner death/skill loss, and ignores nested extra turns.
        phase.insertAfter(async function () { await close(record); }, { forceDie: true, includeOut: true });
        for (const entry of targets) {
          if (entry.original === group || !alive(entry.player)) continue;
          await entry.player.changeGroup(group);
          if (entry.player.group !== group) continue;
          const stack = layers.get(entry.player) || [];
          stack.push(entry);
          layers.set(entry.player, stack);
          record.changes.push(entry);
        }
        for (const entry of record.changes) {
          if (!alive(player)) break;
          if (!alive(entry.player) || entry.player.countCards('h') < 1) continue;
          const choice = player.gainPlayerCard(entry.player, 'h', true);
          const result = await choice.forResult();
          // The native gainPlayerCard stores its actual gain child as done.
          // Its gain history proves completion even if gainAfter moves the
          // cards away immediately; a cancelled gain has no such history.
          const gain = choice.done;
          const gained = gain ? (player.getHistory('gain').includes(gain) ? gain.cards : []) :
            (result.cards || []).filter(card => get.owner(card) === player);
          for (const card of gained || []) record.cards.add(card);
        }
      },
      ai: { order: 10, result: { player: 1 } },
    },
    [EFFECT]: {
      charlotte: true, forced: true, popup: false, forceDie: true,
      firstDo: true, priority: 10000,
      trigger: { global: 'useCardBefore' },
      filter(event, player) {
        return event.player === player && eligible(player, event.card, event, event.cards || []);
      },
      async content(event, trigger) {
        // Before native useCard accounting and material loss, retain a stable
        // use-event decision. No gaintag is needed after cards leave the hand.
        trigger.addCount = false;
      },
      mod: {
        targetInRange(card, player) { if (eligible(player, card)) return true; },
        cardUsable(card, player) { if (eligible(player, card)) return Infinity; },
      },
    },
  };
  api.quxian = { install };
  return {
    skills,
    translate: {
      [ID]: '驱贤', [EFFECT]: '驱贤',
      [ID + '_info']: '限定技，出牌阶段，你令所有其他存活角色的势力变为你发动此技能时的势力，然后依次获得每名势力实际改变的角色的一张手牌（无手牌者跳过）。本回合结束后，这些角色恢复原势力。本回合，你使用以此法获得的牌（含以其为素材转化的牌）无距离和次数限制，且不计入使用次数。',
    },
  };
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills));
 const translate=Object.assign({},...modules.map(module=>module.translate));
 let scheduled=false;
 return {
  name:'武王濬',editable:true,connect:false,
  async content(){
   if(scheduled)return;scheduled=true;
   // The engine drains arenaReady synchronously after registering package skills.
   (lib.arenaReady??=[]).push(function installWuwangjun(){
    api.xiajiang.install();api.quanou.install();api.quxian.install();
   });
  },
  async precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_wuwangjun:['male','qun',4,['bjgy_wuwangjun_xiajiang','bjgy_wuwangjun_quanou','bjgy_wuwangjun_quxian'],['die:false','ext:武王濬/bjgy_wuwangjun.jpg']]},
    translate:{bjgy_wuwangjun:'武王濬'},characterIntro:{bjgy_wuwangjun:'武王濬，群、男性、初始体力4，体力上限4。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由设计者提供。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'武王濬：群、男、4/4。下江、全瓯、驱贤。面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_wuwangjun.jpg'],card:[],skill:[],audio:[]}
 };
});
