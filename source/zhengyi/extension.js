// 郑以 v0.1.0 测试版；技能设计：辟境归元；实现与打包：OpenAI Codex协助。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function kanwenFactory(lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_zhengyi_kanwen';
  const players = new WeakMap();

  function ancestor(event, name) {
    const visited = new Set();
    while (event && typeof event === 'object' && !visited.has(event)) {
      if (event.name === name) return event;
      visited.add(event);
      event = event.parent || (typeof event.getParent === 'function' ? event.getParent() : null);
    }
    return null;
  }
  function context(player, event) {
    const current = event || _status.event;
    const phase = ancestor(current, 'phaseUse');
    if (!phase || phase.player !== player) return null;
    // Native phase increments game.phaseNumber once per full turn; an inserted
    // phaseUse can have no phase ancestor and must still share that turn's bans.
    const turn = game.phaseNumber;
    let data = players.get(player);
    if (!data || data.turn !== turn) {
      data = { turn, disabled: false, usedNames: new Set(), phases: new WeakMap() };
      players.set(player, data);
    }
    let usage = data.phases.get(phase);
    if (!usage) { usage = { count: 0, locked: false }; data.phases.set(phase, usage); }
    return { phase, data, usage };
  }
  function available(player, event) {
    const c = context(player, event);
    return !!c && !c.data.disabled && !c.usage.locked && c.usage.count < 5;
  }
  function resetUsage(player, event) {
    const active = ancestor(_status.event, 'phaseUse');
    if (!active || ancestor(event || _status.event, 'phaseUse') !== active || active.player !== player) return false;
    const c = context(player, event);
    if (!c) return false;
    c.usage.count = 0;
    return true;
  }
  function virtual(name, nature) {
    const card = { name, suit: 'none', color: 'none', number: null, isCard: true, cards: [] };
    if (nature) card.nature = nature;
    return card;
  }
  function legalCard(card, player) {
    if (!lib.filter.cardEnabled(card, player)) return false;
    const info = get.info(card);
    if (info.notarget) return true;
    const range = get.select(get.copy(info.selectTarget));
    game.checkMod(card, player, range, 'selectTarget', player);
    const count = game.filterPlayer(target => target.isIn() && player.canUse(card, target, false, false)).length;
    return range[1] <= -1 ? count > 0 : count >= range[0];
  }
  function names(player, x, data) {
    const list = [];
    for (const name of [...new Set(lib.inpile)]) {
      const type = get.type(name);
      if ((type !== 'basic' && type !== 'trick') || data.usedNames.has(name) || get.cardNameLength(name) > x) continue;
      const variants = name === 'sha' ? [undefined, ...(lib.inpile_nature || [])] : [undefined];
      for (const nature of variants) {
        if (legalCard(virtual(name, nature), player)) list.push(['', '', name, nature]);
      }
    }
    return list;
  }
  function actualDiscard(discard, player) {
    // Selected links are not evidence of a real loss: discard/lose can be
    // rewritten or cancelled. Native discardPlayerCard.done is discard;
    // discard.done is its settled lose event, whose cards excludes absent cards.
    const loss = discard?.done?.done;
    if (loss?.player === player && loss.type === 'discard' && Array.isArray(loss.cards) && !loss._cancelled && player.getHistory('lose').includes(loss)) return loss.cards;
    return [];
  }
  async function yang(player, budget) {
    while (budget > 0) {
      const controls = Array.from({ length: budget }, (_, index) => String(index + 1));
      const result = await player.chooseControl(controls)
        .set('prompt', `勘文：选择牌名字数（剩余${budget}）`)
        .set('ai', () => controls.length - 1).forResult();
      // There is no cancel control. A malformed/disconnected response still
      // spends one point so it cannot leave an infinite selection loop.
      const n = controls.includes(result.control) ? Number(result.control) : 1;
      budget -= n;
      let matches = Array.from(ui.cardPile.childNodes).filter(card => get.cardNameLength(card) === n);
      if (!matches.length) matches = Array.from(ui.discardPile.childNodes).filter(card => get.cardNameLength(card) === n);
      if (matches.length) await player.gain(matches[Math.floor(Math.random() * matches.length)], 'gain2');
    }
  }
  async function yin(player, x, data) {
    const options = names(player, x, data);
    if (!options.length) return;
    const result = await player.chooseButton(['勘文：使用一张牌', [options, 'vcard']], true)
      .set('ai', button => player.getUseValue(virtual(button.link[2], button.link[3]))).forResult();
    const link = result.bool && result.links?.[0];
    const chosen = link && options.find(item => item[2] === link[2] && item[3] === link[3]);
    if (!chosen) return;
    const card = virtual(chosen[2], chosen[3]);
    if (!legalCard(card, player)) return;
    await player.chooseUseTarget({
      card, cards: [], forced: true, nodistance: true, addCount: false,
      // Native useCard invokes oncard only after its use starts. Merely
      // confirming a button or cancelling an invalid target never consumes a name.
      oncard: () => data.usedNames.add(card.name),
    });
  }

  api.kanwen = { install() {}, resetUsage };
  const skills = {
    [ID]: {
      enable: 'phaseUse', zhuanhuanji: true, mark: true, marktext: '☯',
      init(player) { if (typeof player.storage[ID] !== 'boolean') player.storage[ID] = false; },
      intro: { content(storage) { return storage ? '阴：弃置黑色牌，然后使用牌' : '阳：弃置红色牌，然后获得牌'; } },
      filter(event, player) { return available(player, event); },
      filterTarget(card, player, target) { return target.isIn(); },
      selectTarget: 1,
      async content(event, trigger, player) {
        const c = context(player, event);
        if (!c || !available(player, event)) return;
        const x = ++c.usage.count, isYin = player.storage[ID] === true;
        const target = event.target || event.targets?.[0];
        player.changeZhuanhuanji(ID);
        try {
          if (!target?.isIn()) { c.data.disabled = true; return; }
          if (target !== player && target.countCards('h')) await player.viewHandcards(target);
          const cards = target.getCards('hej').filter(card => get.color(card, target) === (isYin ? 'black' : 'red') && lib.filter.canBeDiscarded(card, player, target, ID));
          let discarded = [];
          if (cards.length) {
            const next = player.discardPlayerCard({ target, position: 'hej', forced: true, visible: true, directresult: cards });
            await next;
            if (target === player) discarded = actualDiscard(next, player);
          }
          if (!discarded.length) { c.data.disabled = true; return; }
          if (isYin) await yin(player, x, c.data);
          else await yang(player, x);
        } finally {
          if (x >= 5) c.usage.locked = true;
        }
      },
      ai: { order: 8, result: { target(player, target) { return player === target ? 1 : -1; } } },
    },
  };
  const translate = {
    [ID]: '勘文',
    [ID + '_info']: '转换技。出牌阶段，你可以观看一名角色的手牌，弃置其区域内所有可弃置的红色牌（阳）或黑色牌（阴），然后转换状态。若未实际弃置自己的牌，本回合此技能失效；否则，阳：你反复选择1至剩余预算的一个数字n，优先从牌堆、其次从弃牌堆随机获得一张牌名字数为n的牌，无论是否获得均扣除n，直至预算X耗尽；阴：你须使用一张当前牌池中牌名字数不大于X的基本牌或普通锦囊牌，无距离和次数限制且不计次，同回合每种牌名限一次。X为本出牌阶段发动次数；第5次完整结算后，本阶段此技能失效。',
  };
  return { skills, translate };
},
function createZhudian(lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_zhengyi_zhudian';
  const EFFECT = ID + '_effect';
  const seenGains = new WeakMap();
  const activeUses = new WeakMap();
  const state = player => player.storage[EFFECT] || { unlimited: false, unrespondable: false };
  function refresh(player) {
    player.syncStorage(EFFECT);
    if (state(player).unlimited || state(player).unrespondable) player.markSkill(EFFECT);
    else player.unmarkSkill(EFFECT);
  }
  function gainEvents(event, player) {
    if (event.name === 'gain') return event.player === player && event.cards?.length ? [event] : [];
    if (!event.getg?.(player)?.length) return [];
    const children = player.getHistory('gain', gain => gain.getParent() === event);
    return children.length ? children : [event];
  }
  function unseen(event, player) {
    const seen = seenGains.get(player);
    return gainEvents(event, player).some(gain => !seen?.has(gain));
  }
  function unlimited(card, player) {
    let event = _status.event;
    const visited = new Set();
    while (event && !visited.has(event)) {
      visited.add(event);
      if (event.name === 'useCard') {
        if (event.player === player && event.card === card) return !!activeUses.get(event)?.unlimited;
        break;
      }
      event = event.parent || event.getParent?.();
    }
    return !!state(player).unlimited;
  }
  const skills = {
    [ID]: {
      locked: true, forced: true,
      trigger: { player: 'gainAfter', global: 'loseAsyncAfter' },
      filter(event, player) { return unseen(event, player); },
      async content(event, trigger, player) {
        let seen = seenGains.get(player);
        if (!seen) seenGains.set(player, seen = new WeakSet());
        for (const gain of gainEvents(trigger, player)) seen.add(gain);
        const black = player.countCards('h', card => get.color(card, player) === 'black');
        const red = player.countCards('h', card => get.color(card, player) === 'red');
        const next = { ...state(player) };
        if (black > red) next.unlimited = true;
        if (red > black) next.unrespondable = true;
        player.storage[EFFECT] = next;
        refresh(player);
      },
    },
    [EFFECT]: {
      charlotte: true, forced: true, silent: true, popup: false,
      firstDo: true, priority: Infinity,
      trigger: { player: 'useCardBefore' },
      filter(event, player) {
        return !activeUses.has(event) && (state(player).unlimited || state(player).unrespondable);
      },
      async content(event, trigger, player) {
        const snapshot = { ...state(player) };
        activeUses.set(trigger, snapshot);
        player.storage[EFFECT] = { unlimited: false, unrespondable: false };
        if (snapshot.unlimited) trigger.addCount = false;
        if (snapshot.unrespondable) {
          trigger.directHit ??= [];
          trigger.directHit.addArray(game.filterPlayer());
        }
        refresh(player);
        // Freeze benefits for this actual use while allowing gains during its
        // resolution to grant independent benefits for the following card.
        trigger.insertAfter(async function () {
          if (!player.actionHistory.some(history => history.useCard?.includes(trigger))) {
            const pending = state(player);
            player.storage[EFFECT] = {
              unlimited: pending.unlimited || snapshot.unlimited,
              unrespondable: pending.unrespondable || snapshot.unrespondable,
            };
            refresh(player);
          }
          activeUses.delete(trigger);
        }, { player, forceDie: true, includeOut: true });
      },
      mod: {
        targetInRange(card, player) { if (unlimited(card, player)) return true; },
        cardUsable(card, player) { if (unlimited(card, player)) return Infinity; },
      },
      marktext: '注',
      intro: { content(storage, player) {
        const effects = [];
        if (state(player).unlimited) effects.push('无距离和次数限制且不计次');
        if (state(player).unrespondable) effects.push('不能被响应');
        return effects.length ? '下一张使用的牌：' + effects.join('；') : '暂无待生效效果';
      } },
    },
  };
  let installed = false;
  api.zhudian = { state: player => ({ ...state(player) }), install() {
    if (installed) return;
    installed = true;
    game.addGlobalSkill(EFFECT);
  } };
  return { skills, translate: {
    [ID]: '注典', [EFFECT]: '注典',
    [ID + '_info']: '锁定技，你获得牌后，若手中黑色牌更多，你使用的下一张牌无距离和次数限制且不计次；若红色牌更多，你使用的下一张牌不能被响应。两种效果可以共存，同种效果不累计次数；数量相等不清除已有效果。效果保留至下一次使用牌，打出牌不消耗。',
  } };
},
function bianshuFactory(lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_zhengyi_bianshu';
  const KANWEN = 'bjgy_zhengyi_kanwen';
  const uses = new WeakMap();
  let installed = false;

  function currentPhase(event, player) {
    if (!event) return null;
    const phase = event.name === 'phaseUse' ? event : event.getParent?.('phaseUse', true, true);
    return phase?.name === 'phaseUse' && phase.player === player ? phase : null;
  }

  function wasUsed(phase, player, target) {
    return uses.get(phase)?.get(player)?.has(target) === true;
  }

  function consume(phase, player, target) {
    let owners = uses.get(phase);
    if (!owners) uses.set(phase, owners = new WeakMap());
    let targets = owners.get(player);
    if (!targets) owners.set(player, targets = new WeakSet());
    targets.add(target);
  }

  function inGame(player) {
    return !!player && (typeof player.isIn !== 'function' || player.isIn());
  }

  function validTarget(phase, player, target) {
    return !!phase && inGame(target) && target.countCards('h') > 0 && !wasUsed(phase, player, target);
  }

  // expandSkills only expands one level in this installation. Iterate to a
  // fixed point so a group-owned conversion skill is not silently omitted.
  function expand(ids) {
    const result = [...new Set(ids)];
    for (let previous = -1; previous !== result.length;) {
      previous = result.length;
      game.expandSkills(result);
    }
    return result;
  }

  function conversions(player) {
    // The third argument retains held but disabled skills (e.g. fengyin).
    // Never reconstruct ownership from the character's original skill list:
    // a removed skill stays removed, and newly acquired card skills count.
    return expand(player.getSkills(null, false, false)).filter(id => {
      const info = lib.skill[id];
      return info?.zhuanhuanji && !info.equipSkill;
    });
  }

  function resetNativeUsage(player, skill) {
    // Player.refreshSkill also removes temp_ban, awakened state and blockers.
    // Only its documented native usage records are appropriate here.
    for (const id of expand([skill])) {
      const info = lib.skill[id];
      if (!info) continue;
      // Active-skill stat entries are native counts even without usable:
      // official dcshoutan checks getStat('skill') directly in its filter.
      for (const type of ['skill', 'triggerSkill']) {
        const stat = player.getStat(type);
        if (stat && typeof stat[id] === 'number') delete stat[id];
      }
      if (info.round && player.storage[id + '_roundcount'] !== undefined) {
        delete player.storage[id + '_roundcount'];
        player.unmarkSkill(id + '_roundcount');
      }
    }
  }

  // Audited installed-source adapters for usage that does not use native stat.
  // These markers contain only phase/turn/round use allowance. In particular,
  // youlong2 (permanent card names), duanwan (permanent upgrade), effect skills,
  // temp_ban and arbitrary *_used/*_count records are never inferred or erased.
  const usageMarkers = {
    // character/shenhua/skill.js: addTempSkill(..., 'phaseUseAfter').
    nzry_zhenliang: ['nzry_zhenliang_used'],
    nzry_shenshi: ['nzry_shenshi_used'],
    // character/newjiang/skill.js: once per turn after duanwan.
    diezhang: ['diezhang_used'],
    // character/xianding/skill.js: this turn's yin/yang allowance only.
    dcsbmengmou: ['dcsbmengmou_used'],
    // character/sp/skill.js: this round's yin/yang allowance only.
    youlong: ['youlong_used'],
    // character/key/skill.js: separate per-round allowance for each side.
    chihaya_youfeng: ['chihaya_youfeng_true', 'chihaya_youfeng_false'],
    // character/clan/skill.js: each phase's one activation with this holder.
    clanlianzhu: ['clanlianzhu_targeted'],
  };

  function resetNamedUsage(player, skill) {
    for (const marker of usageMarkers[skill] || []) {
      if (player.hasSkill(marker, null, false, false) || player.storage[marker] !== undefined) player.removeSkill(marker);
    }
    if (skill === 'dcsbquanmou') {
      // Only the current-phase target allowance. Do not remove *_true/*_false:
      // their onremove would also erase pending effects on other characters.
      delete player.storage.dcsbquanmou_selected;
    }
  }

  function resetAndSwitch(player, event) {
    for (const skill of conversions(player)) {
      if (!conversions(player).includes(skill)) continue;
      if (skill === KANWEN) {
        // Kanwen owns X, the phase invalidation and its card-name record.
        // Its narrow reset API clears X while preserving those restrictions.
        api.kanwen.resetUsage(player, event);
      } else {
        resetNativeUsage(player, skill);
        resetNamedUsage(player, skill);
      }
      if (conversions(player).includes(skill)) player.changeZhuanhuanji(skill);
    }
  }

  const skills = {
    [ID]: {
      enable: 'phaseUse',
      selectTarget: 1,
      filter(event, player) {
        const phase = currentPhase(event, player);
        return !!phase && game.hasPlayer(target => validTarget(phase, player, target));
      },
      filterTarget(card, player, target) {
        return validTarget(currentPhase(_status.event, player), player, target);
      },
      async content(event, trigger, player) {
        const phase = currentPhase(event, player), target = event.target || event.targets?.[0];
        if (!validTarget(phase, player, target)) return;
        consume(phase, player, target);

        const first = await target.chooseCard({
          position: 'h', selectCard: 1, forced: true,
          prompt: '辨书：请选择一张手牌展示',
        }).set('ai', card => 6 - get.value(card)).forResult();
        const firstCard = first.cards?.[0];
        if (!first.bool || !inGame(target) || !target.getCards('h').includes(firstCard)) return;
        const firstColor = get.color(firstCard, target);
        await target.showCards([firstCard], '【辨书】' + get.translation(target) + '展示的手牌');

        if (!inGame(player)) return;
        const proceed = await player.chooseBool('辨书：是否摸一张牌，然后展示一张手牌？')
          .set('ai', () => true).forResult();
        if (!proceed.bool || !inGame(player)) return;
        await player.draw(1);
        if (!inGame(player) || !player.countCards('h')) return;
        const second = await player.chooseCard({
          position: 'h', selectCard: 1, forced: true,
          prompt: '辨书：请选择一张当前手牌展示（可以是刚摸的牌）',
        }).set('ai', card => get.color(card, player) !== firstColor ? 8 - get.value(card) : -get.value(card)).forResult();
        const secondCard = second.cards?.[0];
        if (!second.bool || !inGame(player) || !player.getCards('h').includes(secondCard)) return;
        const secondColor = get.color(secondCard, player);
        await player.showCards([secondCard], '【辨书】' + get.translation(player) + '展示的手牌');
        if (!['red', 'black'].includes(firstColor) || !['red', 'black'].includes(secondColor) || firstColor === secondColor || !inGame(player)) return;

        const allowed = [...new Set([player, target])];
        const chosen = await player.chooseTarget('辨书：你可以令自己或原目标的所有转换技视为未发动过，并各切换一次阴阳',
          (card, owner, current) => allowed.includes(current) && inGame(current))
          .set('ai', current => get.attitude(player, current)).forResult();
        const recipient = chosen.targets?.[0];
        if (!chosen.bool || !allowed.includes(recipient) || !inGame(recipient)) return;
        resetAndSwitch(recipient, event);
      },
      ai: { order: 7, result: { player: 1, target: 0.2 } },
    },
  };
  const translate = {
    [ID]: '辨书',
    [ID + '_info']: '出牌阶段，每名角色限一次，你可以令一名有手牌的角色自己选择并展示一张手牌，然后你可以摸一张牌并展示一张当前手牌。若这两张牌均为有颜色的牌且颜色不同，你可以令你或其武将牌上当前持有的所有转换技视为未发动过，并各切换一次阴阳。此切换不执行技能效果，不计为发动技能，且不解除技能封印、技能自身失效或已用牌名限制。',
  };
  api.bianshu = {
    install() {
      if (installed) return;
      installed = true;
    },
  };
  return { skills, translate };
},
function createShouzang(lib, game, ui, get, ai, _status, api) {
  const SKILL = 'bjgy_zhengyi_shouzang';
  const RULE = `${SKILL}_rule`;
  // A normal (non-eternal) gain tag is deliberately used: installed native
  // lose records it in gaintag_map and removes it at the physical loss stage.
  // Thus a later gain of the same object never restores this grant.
  const TAG = `${SKILL}_card`;

  function inHand(card, holder) {
    return !!card && !!holder && get.itemtype(card) === 'card' &&
      get.owner(card) === holder && holder.getCards('h').includes(card);
  }
  function isProtected(card, holder) {
    return inHand(card, holder) && card.hasGaintag(TAG);
  }
  function matchingCards(event, player) {
    const name = event.card && get.name(event.card, player);
    if (!name) return [];
    return player.getCards('h').filter(card => inHand(card, player) && get.name(card, player) === name);
  }
  function overLimit(target) {
    return !!target && target.isIn() && target.countCards('h') > target.getHandcardLimit();
  }
  function inheritable(target, player) {
    return target !== player && target.isIn() && !target.hasSkill(SKILL, null, null, false);
  }

  const skills = {
    [SKILL]: {
      audio: false,
      trigger: { player: ['useCard', 'respond'] },
      group: [`${SKILL}_end`, `${SKILL}_inherit`],
      filter(event, player) { return matchingCards(event, player).length > 0; },
      async cost(event, trigger, player) {
        const cards = matchingCards(trigger, player);
        const result = await player.chooseBool(`守藏：是否保护手中剩余的${get.translation(trigger.card)}？`)
          .set('ai', () => true).forResult();
        event.result = { bool: result.bool, cost_data: cards };
      },
      async content(event, trigger, player) {
        // Snapshot the objects at activation; new same-name cards are not grants.
        const cards = (event.cost_data || []).filter(card => inHand(card, player));
        if (cards.length) player.addGaintag(cards, TAG);
      },
      ai: { threaten: 1.5 },
    },
    [RULE]: {
      charlotte: true,
      forced: true,
      silent: true,
      popup: false,
      forceDie: true,
      firstDo: true,
      // Check the grant after ordinary hand-limit/discard modifiers. This rule
      // is global so already-granted cards survive removal of the main skill.
      priority: Infinity,
      trigger: { global: ['discardBefore', 'loseBefore'] },
      filter(event, player) {
        if (event.name === 'lose' && event.type !== 'discard') return false;
        return event.player === player && Array.isArray(event.cards) &&
          event.cards.some(card => isProtected(card, player));
      },
      async content(event, trigger, player) {
        // Native bare discard() and discardMultiple/raw discard-type lose()
        // bypass choice mods. Their Before boundaries precede all physical
        // snapshots: filter only the input cards, then let native lose derive
        // hs/es/js/cards2/gaintag_map and history from the remaining objects.
        // Non-discard losses, including use/respond/give/gain/recast/death,
        // never qualify. No already-derived loss arrays are ever rewritten.
        trigger.cards = trigger.cards.filter(card => !isProtected(card, player));
        if (!trigger.cards.length) {
          trigger.result = { bool: false, cards: [] };
          trigger.finish();
        }
      },
      mod: {
        ignoredHandcard(card, player) { if (isProtected(card, player)) return true; },
        cardDiscardable(card, player) { if (isProtected(card, player)) return false; },
        canBeDiscarded(card, source, target) { if (isProtected(card, target)) return false; },
      },
    },
    [`${SKILL}_end`]: {
      audio: false,
      trigger: { global: 'phaseEnd' },
      filter(event) { return overLimit(event.player); },
      async cost(event, trigger, player) {
        if (!overLimit(trigger.player)) { event.result = { bool: false }; return; }
        event.result = await player.chooseBool(`守藏：是否令${get.translation(trigger.player)}摸两张牌？`)
          .set('ai', () => get.attitude(player, trigger.player) > 0).forResult();
      },
      async content(event, trigger) {
        if (overLimit(trigger.player)) await trigger.player.draw(2);
      },
    },
    [`${SKILL}_inherit`]: {
      audio: false,
      trigger: { player: 'dieAfter' },
      forceDie: true,
      filter(event, player) { return game.hasPlayer(target => inheritable(target, player)); },
      async cost(event, trigger, player) {
        event.result = await player.chooseTarget('守藏：是否令一名其他角色获得守藏？',
          (card, source, target) => inheritable(target, source))
          .set('forceDie', true).set('ai', target => get.attitude(player, target)).forResult();
      },
      async content(event, trigger, player) {
        const target = event.targets && event.targets[0];
        if (!target || !inheritable(target, player)) return;
        // Use the real acquisition path, including trigger registration. Never
        // derive this identifier from the enclosing event's name (e.g. die).
        if (typeof target.addSkills === 'function') await target.addSkills(SKILL);
        else target.addSkill(SKILL);
      },
    },
  };
  let installed = false;
  api.shouzang = {
    tag: TAG,
    isProtected,
    install() {
      if (installed) return;
      game.addGlobalSkill(RULE);
      installed = true;
    },
  };
  return {
    skills,
    translate: {
      [SKILL]: '守藏',
      [`${SKILL}_end`]: '守藏',
      [`${SKILL}_inherit`]: '守藏',
      [TAG]: '守藏',
      [`${SKILL}_info`]: '当你使用或打出牌时，你可以令此时手中剩余的所有同名实体牌不计入手牌上限且不能被任何人弃置，直到这些牌离开你的手牌（仍可使用、打出、交给、被获得或重铸）。每名角色的回合结束时，若其实际手牌数大于其手牌上限，你可以令其摸两张牌。你阵亡后，可以令一名未拥有“守藏”的其他在场角色获得“守藏”。',
    },
  };
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills));
 const translate=Object.assign({},...modules.map(module=>module.translate));
 let scheduled=false;
 return {
  name:'郑以',editable:true,connect:false,
  async content(){
   if(scheduled)return;scheduled=true;
   (lib.arenaReady??=[]).push(function installZhengyi(){
    api.kanwen.install();api.zhudian.install();api.bianshu.install();api.shouzang.install();
   });
  },
  async precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_zhengyi:['female','qun',3,['bjgy_zhengyi_kanwen','bjgy_zhengyi_zhudian','bjgy_zhengyi_bianshu','bjgy_zhengyi_shouzang'],['die:false','ext:郑以/bjgy_zhengyi.jpg']]},
    translate:{bjgy_zhengyi:'郑以'},characterIntro:{bjgy_zhengyi:'郑以，群、女性、初始体力3，体力上限3。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由设计者提供。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'郑以：群、女、3/3。勘文、注典、辨书、守藏。面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_zhengyi.jpg'],card:[],skill:[],audio:[]}
 };
});
