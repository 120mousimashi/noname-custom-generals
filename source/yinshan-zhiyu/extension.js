// 隐山之玉 v1.0.0。技能设计：辟境归元；代码实现与整合：OpenAI Codex协助。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const parts=[(function(lib,game,ui,get,ai,_status){
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
   character:{character:{bjgy_zhengyi:['female','qun',3,['bjgy_zhengyi_kanwen','bjgy_zhengyi_zhudian','bjgy_zhengyi_bianshu','bjgy_zhengyi_shouzang'],['die:false','ext:隐山之玉/bjgy_zhengyi.jpg']]},
    translate:{bjgy_zhengyi:'郑以'},characterIntro:{bjgy_zhengyi:'郑以，群、女性、初始体力3，体力上限3。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由设计者提供。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'郑以：群、女、3/3。勘文、注典、辨书、守藏。面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_zhengyi.jpg'],card:[],skill:[],audio:[]}
 };
})(lib,game,ui,get,ai,_status),
(function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function createZhangua(lib,game,ui,get,ai,_status,api){
 const ID='bjgy_sunyi_zhangua';
 const isIn=player=>!!player&&player.isIn();
 let installed=false;
 api.zhangua={install(){if(installed)return;installed=true;}};

 function wasGiven(choice,result,giver,recipient){
  const card=result?.cards?.[0],gain=choice.done;
  if(!result?.bool||result.cards.length!==1||!card||!gain||gain.player!==recipient||gain.giver!==giver)return false;
  // Native self-gain records the gain before it removes the already-owned
  // hand card from gain.cards. It deliberately creates no loss in this case.
  if(!recipient.getHistory('gain').includes(gain))return false;
  if(giver===recipient)return recipient.getCards('h').includes(card);
  return gain.getg(recipient).includes(card)&&gain.getl(giver).hs.includes(card);
 }

 async function blackDamage(source){
  if(!isIn(source)||!game.hasPlayer(target=>isIn(target)&&target!==source))return;
  const result=await source.chooseTarget('占卦：选择一名其他角色，对其造成1点普通伤害',true,
   (card,player,target)=>target!==player&&target.isIn())
   .set('forced',true)
   .set('ai',target=>get.damageEffect(target,source,source))
   .forResult();
  const target=result.targets?.[0];
  if(!isIn(source)||!isIn(target)||target===source)return;
  await target.damage({num:1,source,nocard:true});
 }

 return {
  skills:{
   [ID]:{
    trigger:{global:'phaseBegin'},
    group:['bjgy_sunyi_zhangua_judge'],
    forced:true,
    locked:false,
    popup:false,
    forceDie:true,
    filter(event,player){
     return isIn(player)&&isIn(event.player)&&event.player.getCards('h').some(card=>lib.filter.canBeGained(card,player,event.player));
    },
    async content(event,trigger,player){
     const current=trigger.player;
     if(!isIn(player)||!isIn(current))return;
     const choice=current.chooseToGive({target:player,position:'h',selectCard:[1,1],forced:false,
      prompt:'占卦：你可以交给'+get.translation(player)+'一张手牌，令其选择是否进行判定'});
     const result=await choice.forResult();
     if(!wasGiven(choice,result,current,player)||!isIn(player)||!isIn(current))return;
     const consent=await player.chooseBool('占卦：是否进行判定？')
      .set('prompt2','红色：你与当前回合角色各摸两张牌；黑色：你与其依次各选择一名其他角色，造成1点普通伤害')
      .set('ai',()=>true).forResult();
     if(!consent.bool||!isIn(player)||!isIn(current))return;
     player.logSkill(ID);
     const judged=await player.judge(ID,card=>card.color==='red'?1:card.color==='black'?-1:0).forResult();
     if(judged.color==='red'){
      if(isIn(player))await player.draw(2);
      if(isIn(current))await current.draw(2);
     }else if(judged.color==='black'){
      await blackDamage(player);
      await blackDamage(current);
     }
    },
   },
  },
  translate:{
   [ID]:'占卦',
   [ID+'_info']:'每回合开始时，当前回合角色可以交给你一张手牌，然后你可以进行一次判定：红色，你与该角色各摸两张牌；黑色，你与该角色依次各对一名其他角色造成1点普通伤害。允许自己交给自己并分别结算两次。你进行判定时，可以弃置一张手牌，根据所弃牌颜色、当前判定牌颜色的顺序执行：红黑，摸1并获得原判定牌，本次判定以弃置牌完整信息为准；红红，视为使用一张基本牌；黑红，弃置一名其他角色两张牌，本次判定以弃置牌完整信息为准；黑黑，视为使用一张普通锦囊牌（每轮每种牌名限一次）。每次判定此效果至多发动一次，印牌遵守正常距离和次数限制，无合法选项则无事发生。',
  },
 };
},
function createDivination(lib, game, ui, get, ai, _status, api) {
  const id = 'bjgy_sunyi_zhangua_judge';
  const attempted = new WeakSet();
  const isColor = color => color === 'red' || color === 'black';
  const discardable = (card, player) => lib.filter.cardDiscardable(card, player, id);
  const roundKey = '占卦本轮锦囊';

  function usedNames(player) {
    const state = player.storage[roundKey];
    return state?.round === game.roundNumber ? state.names : [];
  }

  function legalUse(card, player) {
    if (!lib.filter.cardEnabled(card, player) || !lib.filter.cardUsable(card, player, _status.event)) return false;
    return !!get.info(card)?.notarget || player.hasUseTarget(card, null, true);
  }

  async function printCard(player, type) {
    const entries = [];
    for (const name of lib.inpile) {
      if (get.type(name) !== type || (type === 'trick' && usedNames(player).includes(name))) continue;
      const natures = name === 'sha' ? [undefined, ...lib.inpile_nature] : [undefined];
      for (const nature of natures) {
        const card = { name, isCard: true };
        if (nature) card.nature = nature;
        if (legalUse(card, player)) entries.push([type, '', name, nature]);
      }
    }
    if (!entries.length) return;
    const result = await player.chooseButton(['占卦：视为使用一张' + (type === 'basic' ? '基本牌' : '普通锦囊牌'), [entries, 'vcard']], true)
      .set('ai', button => player.getUseValue({ name: button.link[2], nature: button.link[3], isCard: true })).forResult();
    const selected = result.links?.[0];
    if (!result.bool || !selected || !entries.some(entry => entry[2] === selected[2] && entry[3] === selected[3])) return;
    const card = { name: selected[2], isCard: true };
    if (selected[3]) card.nature = selected[3];
    if (!legalUse(card, player) || (type === 'trick' && usedNames(player).includes(card.name))) return;
    const choice = player.chooseUseTarget(card, true);
    if (type === 'trick') {
      // Native useCard invokes oncard at its actual use entrance, before card
      // effects or nested judges. Failed target selection/canceled use costs no
      // name; successful nested uses already see this name as consumed.
      choice.set('oncard', function () {
        let state = player.storage[roundKey];
        if (state?.round !== game.roundNumber) state = player.storage[roundKey] = { round: game.roundNumber, names: [] };
        if (!state.names.includes(card.name)) state.names.push(card.name);
        player.syncStorage(roundKey);
      });
    }
    await choice;
  }

  function fallbackResult(trigger, player, original, snapshot) {
    const previous = Object.getOwnPropertyDescriptor(trigger, 'fixedResult');
    let replaced = false, assigned;
    let active = true;
    const baseline = () => replaced ? assigned : previous?.get ? previous.get.call(trigger) : previous?.value;
    const fallback = { ...baseline(), ...snapshot };
    Object.defineProperty(trigger, 'fixedResult', {
      configurable: true,
      enumerable: previous?.enumerable ?? true,
      get() {
        const value = baseline();
        // The judge consumes fixedResult before shifting judging. A later
        // physical rejudge automatically supersedes this event-local snapshot.
        return active && player.judging[0] === original ? fallback : value;
      },
      set(value) {
        active = false;
        if (previous?.set) previous.set.call(trigger, value);
        else { replaced = true; assigned = value; }
      },
    });
  }

  async function replaceJudge(trigger, player, snapshot, original, gainOriginal) {
    const discarded = snapshot.card;
    // Content.judge queues the revealed card's movement before invoking its
    // rejudge timing, then awaits it afterward. Complete that one native move
    // before gaining/discarding the placeholder, including the snapshot path.
    const revealedMove = trigger.next.find(next => next.name === 'cardsGotoOrdering' && next.cards?.includes(original));
    if (revealedMove) await revealedMove;
    // This is an actual rejudge, so the installed judge builds its result from
    // the replacement card and later rejudge skills retain normal precedence.
    const physical = get.position(discarded, true) === 'd' && !get.owner(discarded, 'judge');
    if (original.clone) {
      original.clone.classList.remove('thrownhighlight');
      game.broadcast(function (card) {
        if (card.clone) card.clone.classList.remove('thrownhighlight');
      }, original);
      game.addVideo('deletenode', player, get.cardsInfo([original.clone]));
    }
    trigger.orderingCards ??= [];
    trigger.orderingCards.remove(original);
    if (physical) {
      await game.cardsGotoOrdering(discarded).set('relatedEvent', trigger);
      player.judging[0] = discarded;
    } else {
      // A paid discard may already have been gained by another skill. Preserve
      // its full result without stealing it, duplicating it, or suppressing the
      // rest of this branch. A metadata-only vcard is a safe placeholder: later
      // native guicai/guidao cannot discard or gain either already-owned card.
      const placeholder = { name: snapshot.name, suit: snapshot.suit, number: snapshot.number, isCard: true };
      player.judging[0] = placeholder;
      fallbackResult(trigger, player, placeholder, snapshot);
    }
    if (!get.owner(original, 'judge') && ['o', 'd'].includes(get.position(original, true))) {
      if (gainOriginal) await player.gain(original, 'gain2');
      else await game.cardsDiscard(original);
    }
    game.log(player, '的判定牌改为', discarded);
  }

  api.divination = { install() {} };
  return {
    skills: {
      [id]: {
        trigger: { player: 'judge' },
        direct: true,
        popup: false,
        filter(event, player) {
          return !attempted.has(event) && event.player === player &&
            !!player.judging[0] && isColor(get.color(player.judging[0])) &&
            player.countCards('h', card => discardable(card, player)) > 0;
        },
        async content(event, trigger, player) {
          if (attempted.has(trigger)) return;
          attempted.add(trigger);
          const choice = player.chooseToDiscard('占卦：可以弃置一张手牌', 'h', 1)
            .set('filterCard', card => discardable(card, player))
            .set('ai', card => 6 - get.value(card));
          const result = await choice.forResult();
          const discarded = result.cards?.[0];
          const loss = choice.done?.done;
          // A selection is not payment: validate the actual native discard loss.
          if (!result.bool || !discarded || !loss || loss.type !== 'discard' || !loss.cards2?.includes(discarded)) return;
          player.logSkill('bjgy_sunyi_zhangua');
          const original = player.judging[0];
          if (!original) return;
          const snapshot = Object.freeze({ card: discarded, name: discarded.name,
            suit: get.suit(discarded, false), number: get.number(discarded, false), color: get.color(discarded, false) });
          const left = snapshot.color, right = get.color(original);
          if (!isColor(left) || !isColor(right)) return;
          if (left === 'red' && right === 'black') {
            await player.draw(1);
            await replaceJudge(trigger, player, snapshot, original, true);
          } else if (left === 'black' && right === 'red') {
            const selection = await player.chooseTarget('占卦：弃置一名其他角色的两张牌', true,
              (card, source, target) => target !== source && target.countCards('he') > 0)
              .set('ai', target => -get.attitude(player, target)).forResult();
            const target = selection.targets?.[0];
            if (selection.bool && target) await player.discardPlayerCard(target, 'he', 2, true);
            await replaceJudge(trigger, player, snapshot, original, false);
          } else if (left === 'red' && right === 'red') {
            await printCard(player, 'basic');
          } else if (left === 'black' && right === 'black') {
            await printCard(player, 'trick');
          }
        },
      },
    },
    translate: {},
  };
},
function createShaoyi(lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_sunyi_shaoyi';
  const EFFECT = ID + '_effect', COMMIT = ID + '_commit', DRAW = ID + '_draw';
  const CAST = ID + '_cast';
  const phaseStates = new WeakMap(), activeUses = new WeakMap();
  const pending = player => player.storage[EFFECT] || { damage: 0, drawLayers: 0 };
  function phaseOf(player, event = _status.event) {
    const seen = new Set();
    while (event && !seen.has(event)) {
      seen.add(event);
      if (event.name === 'phaseUse') return event.player === player ? event : null;
      event = event.parent || event.getParent?.();
    }
    return null;
  }
  function quota(player, phase = phaseOf(player)) {
    const state = phase && phaseStates.get(phase);
    return { used: state?.used || 0, limit: state?.limit || 1, nextX: (state?.used || 0) + 1 };
  }
  function mutableQuota(phase) {
    let state = phaseStates.get(phase);
    if (!state) phaseStates.set(phase, state = { used: 0, limit: 1 });
    return state;
  }
  function refresh(player) {
    player.syncStorage(EFFECT);
    if (pending(player).damage || pending(player).drawLayers) player.markSkill(EFFECT);
    else player.unmarkSkill(EFFECT);
  }
  function freeze(player, cards, phase) {
    const colors = { phase, red: 0, black: 0 };
    for (const card of cards) {
      const color = get.color(card, player);
      if (color === 'red' || color === 'black') colors[color]++;
    }
    return colors;
  }
  function hasUsed(player, use) {
    return player.actionHistory.some(history => history.useCard?.includes(use));
  }
  function damageUse(event) {
    const seen = new Set();
    while (event && !seen.has(event)) {
      seen.add(event);
      if (event.name === 'useCard') return event;
      event = event.parent || event.getParent?.();
    }
    return null;
  }
  const skills = {
    [ID]: {
      enable: 'phaseUse', position: 'he', locked: false,
      filter(event, player) {
        const phase = phaseOf(player, event), q = quota(player, phase);
        return !!phase && q.used < q.limit && player.countCards('he') >= q.nextX;
      },
      viewAs: { name: 'sha', storage: { [ID]: true } },
      viewAsFilter(player) { return skills[ID].filter(_status.event, player); },
      filterCard(card, player) { return player.getCards('he').includes(card); },
      selectCard() { return [quota(_status.event.player).nextX, Infinity]; },
      async precontent(event, trigger, player) {
        event.getParent().addCount = false;
        event.result._apply_args ??= {};
        event.result._apply_args[CAST] = freeze(player, event.result.cards, phaseOf(player, event));
      },
      mod: { cardUsable(card) { if (card.storage?.[ID]) return Infinity; } },
      check(card) { return 6 - get.value(card); },
      ai: { order: 3 },
    },
    [EFFECT]: {
      charlotte: true, forced: true, silent: true, popup: false, firstDo: true, priority: Infinity,
      trigger: { player: 'useCardBefore' },
      filter(event, player) {
        return get.name(event.card, player) === 'sha' && !activeUses.has(event) &&
          (!!event.card.storage?.[ID] || pending(player).damage > 0 || pending(player).drawLayers > 0);
      },
      async content(event, trigger, player) {
        const benefits = { ...pending(player) };
        const cast = trigger.card.storage?.[ID] ? trigger[CAST] || freeze(player, trigger.cards, phaseOf(player, trigger)) : null;
        const record = { ...benefits, cast, committed: false, x: 0 };
        activeUses.set(trigger, record);
        player.storage[EFFECT] = { damage: 0, drawLayers: 0 };
        if (cast) trigger.addCount = false;
        if (benefits.damage) trigger.baseDamage = (typeof trigger.baseDamage === 'number' ? trigger.baseDamage : get.info(trigger.card, false).baseDamage || 1) + benefits.damage;
        refresh(player);
        // Native after events run after this complete use, including all targets,
        // repeated effects, responses and damage. New rewards cannot affect it.
        trigger.insertAfter(async function () {
          try {
            if (!hasUsed(player, trigger)) {
              const next = pending(player);
              player.storage[EFFECT] = { damage: next.damage + benefits.damage, drawLayers: next.drawLayers + benefits.drawLayers };
              refresh(player);
              return;
            }
            if (!cast?.phase || !record.committed || !player.isIn()) return;
            const unequal = cast.red !== cast.black;
            if (unequal) await player.loseHp();
            else await player.recover();
            if (!player.isIn()) return;
            const majority = cast.red > cast.black ? 'red' : 'black';
            const result = await player.judge(judge => unequal ? (judge.color === majority ? 1 : -1) : (get.tag({ name: judge.name }, 'damage') ? 1 : -1)).forResult();
            if (!player.isIn() || !result?.card) return;
            const success = unequal ? result.color === majority : !!get.tag({ name: result.name }, 'damage');
            if (!success) return;
            mutableQuota(cast.phase).limit++;
            const next = { ...pending(player) };
            if (unequal) next.damage += record.x;
            else next.drawLayers++;
            player.storage[EFFECT] = next;
            refresh(player);
          } finally { activeUses.delete(trigger); }
        }, { player, forceDie: true, includeOut: true });
      },
      marktext: '翊',
      intro: { content(storage, player) {
        const next = pending(player), parts = [];
        if (next.damage) parts.push('下一张使用的杀伤害+' + next.damage);
        if (next.drawLayers) parts.push('该杀每次造成伤害后摸' + 2 * next.drawLayers + '张牌');
        return parts.join('；') || '暂无待生效收益';
      } },
    },
    [COMMIT]: {
      charlotte: true, forced: true, silent: true, popup: false, firstDo: true, priority: Infinity,
      trigger: { player: 'useCard0' },
      filter(event) { const record = activeUses.get(event); return !!record?.cast?.phase && !record.committed; },
      async content(event, trigger) {
        const record = activeUses.get(trigger);
        record.committed = true;
        record.x = ++mutableQuota(record.cast.phase).used;
      },
    },
    [DRAW]: {
      charlotte: true, forced: true, silent: true, popup: false,
      trigger: { source: 'damageSource' },
      filter(event, player) {
        const use = damageUse(event), record = use && activeUses.get(use);
        return !event.unreal && event.num > 0 && use?.player === player && event.card === use.card &&
          get.name(use.card, player) === 'sha' && record?.drawLayers > 0;
      },
      async content(event, trigger, player) { await player.draw(2 * activeUses.get(damageUse(trigger)).drawLayers); },
    },
  };
  let installed = false;
  api.shaoyi = { state: player => ({ ...pending(player) }), quota,
    install() { if (installed) return; installed = true; for (const skill of [EFFECT, COMMIT, DRAW]) game.addGlobalSkill(skill); },
  };
  return { skills, translate: {
    [ID]: '绍翊', [EFFECT]: '绍翊', [COMMIT]: '绍翊', [DRAW]: '绍翊',
    [ID + '_info']: '出牌阶段限一次，你可以将至少X张手牌或装备牌当做一张不计次且无次数限制的普通【杀】使用（距离限制照常，X为本阶段实际发动次数）。此【杀】结算后，若素材中红、黑牌数量不等，你失去1点体力并判定，若判定牌颜色为素材较多的颜色，本阶段发动次数上限+1，且下一张使用的【杀】伤害+X；若红、黑牌数量相等，你回复1点体力并判定，若判定牌为伤害牌，本阶段发动次数上限+1，且下一张使用的【杀】每次造成伤害后摸两张牌。同种收益可叠加，两种收益可共存并保留至下一张使用的【杀】。',
  } };
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills));
 const translate=Object.assign({},...modules.map(module=>module.translate));
 let scheduled=false;
 return {
  name:'孙伊',editable:true,connect:false,
  async content(){
   if(scheduled)return;scheduled=true;
   (lib.arenaReady??=[]).push(function installSunyi(){
    api.zhangua.install();api.divination.install();api.shaoyi.install();
   });
  },
  async precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_sunyi:['female','wu',4,['bjgy_sunyi_zhangua','bjgy_sunyi_shaoyi'],['die:false','ext:隐山之玉/bjgy_sunyi.jpg']]},
    translate:{bjgy_sunyi:'孙伊'},characterIntro:{bjgy_sunyi:'孙伊，吴、女性、初始体力4，体力上限4。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由设计者提供。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'孙伊：吴、女、4/4。占卦、绍翊。面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_sunyi.jpg'],card:[],skill:[],audio:[]}
 };
})(lib,game,ui,get,ai,_status),
(function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function createShuCore(lib,game,ui,get,ai,_status,api){
 const TAG='bjgy_zhugeyi_shu',START='bjgy_zhugeyi_shu_start',SNAP='bjgy_zhugeyi_shu_snapshot';
 const XING='bjgy_zhugeyi_xingshu',CHENG='bjgy_zhugeyi_chengtu';
 const snapshots=new WeakMap();let installed=false;
 const tagged=card=>!!card?.hasGaintag?.(TAG);
 const history=(player,key)=>player.getHistory?.(key)||[];
 function count(player){return player.getCards('h').filter(tagged).length;}
 function materials(use){
  const cards=[...(Array.isArray(use.cards)?use.cards:[]),...(Array.isArray(use.card?.cards)?use.card.cards:[])];
  if(get.itemtype?.(use.card)==='card')cards.push(use.card);
  return [...new Set(cards)];
 }
 function sameUse(loss,use){
  if(loss.relatedEvent===use)return true;
  if(typeof loss.getParent!=='function')return loss.parent===use;
  return loss.getParent()===use||loss.getParent('useCard')===use;
 }
 function lossHasShu(loss,subset){
  return (loss.hs||[]).some(card=>(!subset||subset.has(card)||subset.has(card.cardid))&&loss.gaintag_map?.[card.cardid]?.includes(TAG));
 }
 function wasShuUse(use,player){
  const cards=materials(use);if(!cards.length)return false;
  if(cards.some(card=>tagged(card)&&(!get.owner||!get.owner(card)||get.owner(card)===player)))return true;
  const subset=new Set(cards.flatMap(card=>[card,card.cardid]));
  return history(player,'lose').some(loss=>sameUse(loss,use)&&lossHasShu(loss,subset));
 }
 function snapshot(use,player){
  const saved=snapshots.get(use);if(saved?.player===player)return saved.value;
  const card=use.card;
  const value=Object.freeze({shu:wasShuUse(use,player),suit:get.suit(card,player),type:get.type2(card,player),number:get.number(card,player)});
  snapshots.set(use,{player,value});return value;
 }
 function lostShuInTurn(player){return history(player,'lose').some(loss=>lossHasShu(loss));}
 function gainedFromOther(event,player){
  if(event.name==='gain'&&event.getlx===false)return false;
  const gains=typeof event.getg==='function'?event.getg(player):event.player===player?event.cards||[]:[];
  if(!gains?.length)return false;
  return [...new Set([...(game.players||[]),...(game.dead||[])])].some(other=>{
   if(other===player)return false;
   const loss=event.getl?.(other);if(!loss)return false;
   return [...(loss.hs||[]),...(loss.es||[])].some(card=>gains.includes(card));
  });
 }
 function firstEquip(event){
  if(event.name!=='useCard'||get.type(event.card)!=='equip')return false;
  const uses=game.getGlobalHistory('useCard')||[];
  return uses.find(use=>get.type(use.card)==='equip')===event;
 }
 function owns(player){return !!player.hasSkill?.(XING)||!!player.hasSkill?.(CHENG);}
 function install(){
  if(installed)return;installed=true;
  for(const id of [START,SNAP])game.addGlobalSkill(id);
 }
 const skills={
  [START]:{charlotte:true,forced:true,popup:false,firstDo:true,priority:1000,
   trigger:{global:'phaseBefore',player:'enterGame'},
   filter(event,player){return !!player.hasSkill?.(XING)&&!player.storage[START]&&(event.name!=='phase'||!game.phaseNumber);},
   async content(event,trigger,player){player.storage[START]=true;const cards=player.getCards('h');if(cards.length)player.addGaintag(cards,TAG);}
  },
  [SNAP]:{charlotte:true,forced:true,popup:false,firstDo:true,priority:10000,
   trigger:{global:['useCardBefore','useCard1']},
   filter(event,player){return event.player===player&&owns(player)&&!snapshots.has(event);},
   async content(event,trigger,player){snapshot(trigger,player);}
  }
 };
 api.core={TAG,count,tagged,materials,wasShuUse,snapshot,lostShuInTurn,gainedFromOther,firstEquip,install};
 return{skills,translate:{[TAG]:'枢',[START]:'行枢',[SNAP]:'枢'}};
},
function createXingshu(lib,game,ui,get,ai,_status,api){
 const ID='bjgy_zhugeyi_xingshu';
 const resolved=new WeakSet();
 const live=target=>!!target&&!target.removed&&(typeof target.isIn!=='function'||target.isIn());
 function usable(use){
  if(!use?.card)return false;
  return (get.name?get.name(use.card):use.card.name)==='sha'||get.type(use.card)==='trick';
 }
 function features(card){
  return {suit:get.suit(card,false),type:get.type2(card,false),number:get.number(card,false)};
 }
 function matches(used,revealed){
  const suits=lib.suits||['spade','heart','club','diamond'];
  return {
   suit:suits.includes(used.suit)&&used.suit===revealed.suit,
   type:['basic','trick','equip'].includes(used.type)&&used.type===revealed.type,
   number:Number.isInteger(used.number)&&used.number>=1&&used.number<=13&&used.number===revealed.number,
  };
 }
 function canTarget(use,player,target){
  if(!live(target))return false;
  if(use.targets.includes(target))return true;
  // Added targets ignore only the printed target count, not distance or
  // skill-based prohibitions. Native modTarget permits e.g. 无中生有 others.
  // Borrowed-sword target checks must not see a previous UI target and skip
  // playerEnabled/targetEnabled modifications under the singleCard rule.
  const previous=ui.selected.targets;
  ui.selected.targets=[];
  try{return lib.filter.targetEnabled2(use.card,player,target)&&lib.filter.targetInRange(use.card,player,target);}
  finally{ui.selected.targets=previous;}
 }
 function applyTargets(use,targets){
  const final=[...new Set(targets)];
  if(!final.length)return false;
  use.targets.splice(0,use.targets.length,...final);
  const info=get.info(use.card,false);
  if(info.singleCard&&info.filterAddedTarget){
   // useCard's native contentBefore will align every final primary target
   // with a legal addedTarget after sorting. Retain the original target /
   // addedTarget pair; the engine reuses it only if that primary survives.
   use.addedTargets=[];
  }
  return true;
 }
 async function changeTargets(use,player){
  if(!live(player)||!game.hasPlayer(target=>canTarget(use,player,target)))return;
  const answer=await player.chooseTarget(
   '行枢：重新选择此牌的最终目标（至少一名）；取消则保留原目标',
   [1,Infinity],
   (_card,_player,target)=>canTarget(use,player,target)
  ).set('ai',target=>get.effect(target,use.card,player,player)).forResult();
  if(answer?.bool&&answer.targets?.length){
   const final=[...new Set(answer.targets)].filter(target=>canTarget(use,player,target));
   if(final.length){applyTargets(use,final);player.line?.(final,'green');}
  }
 }
 const skills={
  [ID]:{
   audio:false,locked:false,
   trigger:{player:'useCard2'},
   filter(event,player){
    return !resolved.has(event)&&live(player)&&usable(event)&&event.targets?.length>0&&api.core.snapshot(event,player).shu;
   },
   async cost(event,trigger,player){
    event.result=await player.chooseBool('行枢：是否亮出牌堆顶一张牌？').set('ai',()=>true).forResult();
   },
   async content(event,trigger,player){
    if(resolved.has(trigger))return;
    resolved.add(trigger);
    const used=api.core.snapshot(trigger,player);
    const cards=get.cards(1);
    if(!cards?.length)return;
    const card=cards[0];
    await game.cardsGotoOrdering(cards);
    if(get.position(card,true)!=='o')return;
    // Freeze all three comparisons before showing/gaining the revealed card.
    // Gain-triggered point modifiers must not change a later comparison.
    const hit=matches(used,features(card));
    try{
     // Same reveal mode as 称象: isFlash=true, rather than ordinary display.
     // The native reveal associates ordering cleanup with this skill event;
     // keep the card available for the gain branch before our final discard.
     await player.showCards(cards,'行枢',true).set('clearArena',false);
     if(hit.suit&&get.position(card,true)==='o'&&live(player)&&game.hasPlayer(live)){
      const answer=await player.chooseTarget('行枢：令一名角色获得亮出的牌',true,(_card,_player,target)=>live(target))
       .set('ai',target=>get.attitude(player,target)).forResult();
      const target=answer?.targets?.[0];
      if(answer?.bool&&live(target)&&get.position(card,true)==='o')await target.gain(card,'gain2');
     }
     if(hit.type)await changeTargets(trigger,player);
     if(hit.number){
      const existing=typeof trigger.effectCount==='number'?trigger.effectCount:(get.info(trigger.card,false).effectCount||1);
      trigger.effectCount=existing+1;
      game.log(player,'令',trigger.card,'额外结算一次');
     }
    }finally{
     if(get.position(card,true)==='o')await game.cardsDiscard([card]);
    }
   },
   ai:{threaten:1.7},
  },
 };
 api.xingshu={canTarget,applyTargets,matches,features,changeTargets};
 return {skills,translate:{
  [ID]:'行枢',
  [ID+'_info']:'游戏开始时，你将所有手牌标记为“枢”（离开手牌区时清除）。你使用【杀】或普通锦囊牌指定目标时，若此牌含有“枢”实体素材，你可以亮出牌堆顶一张牌，并依次执行所有符合条件的效果（每张使用牌限一次）：①花色相同，令一名角色获得亮出牌；②类型相同，你可以增减任意名目标，最终至少保留一名目标；③点数相同，此牌额外结算一次。亮出牌未被获得时置入弃牌堆。',
 }};
},
function createChengtu(lib,game,ui,get,ai,_status,api){
 const ID='bjgy_zhugeyi_chengtu';
 const settled=new WeakMap();
 const isIn=player=>!!player&&player.isIn();
 function already(source,player){return settled.get(source)?.has(player)||false;}
 function remember(source,player){let holders=settled.get(source);if(!holders)settled.set(source,holders=new Set());holders.add(player);}
 function eligible(source,player){
  if(!source||!isIn(player)||already(source,player))return false;
  switch(source.name){
   case 'phaseZhunbei':return source.player===player;
   case 'phase':return api.core.lostShuInTurn(player);
   case 'damage':return source.source===player&&source.num>0&&!source.unreal&&!source.cancelled;
   case 'gain':return source.getlx!==false&&api.core.gainedFromOther(source,player);
   case 'loseAsync':return api.core.gainedFromOther(source,player);
   case 'useCard':return api.core.firstEquip(source);
   default:return false;
  }
 }
 function inOrdering(card){return get.position(card,true)==='o';}
 function validArrangement(moved,cards){
  if(!Array.isArray(moved)||moved.length!==3||!moved.every(Array.isArray)||moved[1].length!==1)return false;
  const all=moved.flat();
  return all.length===cards.length&&new Set(all).size===cards.length&&all.every(card=>cards.includes(card));
 }
 async function returnTop(cards){const live=cards.filter(inOrdering);if(live.length)await game.cardsGotoPile(live.slice().reverse(),'insert');}
 api.chengtu={install(){},eligible,viewCount(player){return Math.max(1,Math.min(7,api.core.count(player)));}};
 return {
  skills:{
   [ID]:{
    forced:true,
    trigger:{player:'phaseZhunbeiBegin',source:'damageSource',global:['phaseEnd','gainAfter','loseAsyncAfter','useCard']},
    filter:eligible,
    async content(event,trigger,player){
     if(!eligible(trigger,player))return;
     // One source event may be exposed through more than one native hook.
     // Claim it before awaiting anything, without combining distinct events.
     remember(trigger,player);
     const num=api.chengtu.viewCount(player);
     const viewed=get.cards(num,true);
     if(!viewed.length)return;
     await game.cardsGotoOrdering(viewed);
     const cards=viewed.filter(inOrdering);
     if(!cards.length)return;
     if(!isIn(player)){await returnTop(cards);return;}
     const result=await player.chooseToMove_new({
      prompt:'承图：获得一张牌并标记为“枢”，将其余牌任意安排在牌堆顶或牌堆底（靠左的在上）',
      forced:true,
      list:[['牌堆顶',cards],['获得（须一张）'],['牌堆底']],
      filterMove(from,to,moved){return to!==1||moved[1].length<1;},
      filterOk(moved){return validArrangement(moved,cards);},
      processAI(list){
       const order=list[0][1].slice().sort((a,b)=>get.value(b)-get.value(a));
       const obtain=order.splice(0,1);
       return [order,obtain,[]];
      }
     }).forResult();
     if(!isIn(player)){await returnTop(cards);return;}
     const moved=result?.bool&&validArrangement(result.moved,cards)?result.moved:[cards.slice(1),[cards[0]],[]];
     const gain=moved[1].filter(inOrdering);
     if(gain.length)await player.gain({cards:gain,animate:'gain2',gaintag:[api.core.TAG]});
     // A gain can insert further events. Never take cards that another effect
     // has already moved, nor accidentally include another scan's cards.
     await returnTop(moved[0]);
     const bottom=moved[2].filter(inOrdering);
     if(bottom.length)await game.cardsGotoPile(bottom);
    },
   },
  },
  translate:{
   [ID]:'承图',
   [ID+'_info']:'锁定技，于你的准备阶段开始时、你失去过“枢”的回合结束时、你造成伤害后、你获得其他角色的手牌或装备区里的牌后，以及每回合第一张装备牌被使用时，你观看牌堆顶X张牌，将其中一张牌标记为“枢”并获得之，然后将其余牌以任意顺序分别放回牌堆顶或牌堆底（X为开始观看时你手中“枢”的数量，至少为1且至多为7）。伤害按每次事件触发，不按伤害点数；同一次获得多张牌只触发一次。',
  },
 };
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills));
 const translate=Object.assign({},...modules.map(module=>module.translate));
 let scheduled=false;
 return {
  name:'诸葛仪',editable:true,connect:false,
  content(){
   if(scheduled)return;scheduled=true;
   (lib.arenaReady??=[]).push(function installZhugeyi(){
    api.core.install();api.xingshu?.install?.();api.chengtu?.install?.();
   });
  },
  precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_zhugeyi:['female','shu',3,['bjgy_zhugeyi_xingshu','bjgy_zhugeyi_chengtu'],['die:false','ext:隐山之玉/bjgy_zhugeyi.jpg']]},
    translate:{bjgy_zhugeyi:'诸葛仪'},characterIntro:{bjgy_zhugeyi:'诸葛仪，蜀、女性、初始体力3，体力上限3。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由设计者提供。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'诸葛仪：蜀、女、3/3。行枢、承图；枢标记、转化继承、锦囊目标调整与观牌顶底整理。面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.1'
  },files:{character:['bjgy_zhugeyi.jpg'],card:[],skill:[],audio:[]}
 };
})(lib,game,ui,get,ai,_status),
(function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function createZhongyiCore(lib,game,ui,get,ai,_status,api){
 const HENG='bjgy_zhongyi_hengce',FANG='bjgy_zhongyi_fangshu',HUI='bjgy_zhongyi_huiyi',XUAN='bjgy_zhongyi_xuanzhen';
 const LIMIT='bjgy_zhongyi_limit_bonus',AWAKE='bjgy_zhongyi_awakened',RULE='bjgy_zhongyi_limit_rule';
 let installed=false;
 const canAct=player=>!!player&&player.isIn();
 const limitBonus=player=>Number(player.storage[LIMIT])||0;
 function adjustLimit(player,amount){
  amount=Math.trunc(Number(amount)||0);if(!amount)return;
  player.storage[LIMIT]=limitBonus(player)+amount;
  player.syncStorage?.(LIMIT);player.update?.();
 }
 function turnKey(){return game.getGlobalHistory?.()||game.phaseNumber||0;}
 function awakened(player){return !!player.storage[AWAKE]||!!player.awakenedSkills?.includes(HUI);}
 function portrait(player){
  if(awakened(player))player.changeSkin({characterName:'bjgy_zhongyi'},'bjgy_zhongyi_awakened');
 }
 function install(){if(installed)return;installed=true;game.addGlobalSkill(RULE);}
 api.core={LIMIT,AWAKE,canAct,limitBonus,adjustLimit,turnKey,awakened,portrait,install};
 const skills={
  [RULE]:{charlotte:true,popup:false,
   mod:{maxHandcard(player,num){return num+limitBonus(player);}}
  },
  [HENG]:{audio:false,forced:true,
   trigger:{player:'damageEnd',source:'damageSource'},
   filter(event,player){return canAct(player)&&player.hasSkill(HENG)&&event.num>0&&!event.unreal&&!event.cancelled;},
   getIndex(event){return Math.max(0,Math.floor(Number(event.num)||0));},
   async content(event,trigger,player){
    if(!canAct(player)||!player.hasSkill(HENG))return;
    await player.draw(1);
    adjustLimit(player,1);
   }
  },
  [HUI]:{audio:false,forced:true,unique:true,juexingji:true,derivation:XUAN,
   trigger:{player:'dyingAfter'},
   filter(event,player){return canAct(player)&&player.hp>0&&!awakened(player);},
   async content(event,trigger,player){
    if(!canAct(player)||player.hp<=0||awakened(player))return;
    player.storage[AWAKE]=true;player.syncStorage?.(AWAKE);player.awakenSkill(HUI);
    if(player.maxHp>player.hp)await player.recover(player.maxHp-player.hp);
    await player.changeSkills([XUAN],[HENG,FANG]);
    portrait(player);
   }
  }
 };
 return{skills,translate:{
  [HENG]:'衡策',[HENG+'_info']:'锁定技，当你造成或受到1点伤害后，你摸一张牌且本局游戏手牌上限+1。',
  [HUI]:'会仪',[HUI+'_info']:'觉醒技，当你脱离濒死状态后，你回复所有已损体力，然后失去“衡策”和“仿书”，获得“玄阵”。',
  [RULE]:'衡策',
 }};
},
function createImmortal(lib,game,ui,get,ai,_status,api){
 const PREFIX='bjgy_zhongyi_immortal',EXPIRE=PREFIX+'_expire';
 // Author-side identity registry; never used as player-visible prose.
 const identities=new Set(['南华老仙','张角','张宝','张梁','于吉','宫崇','张陵','张衡','张修','张鲁','卢氏','张琪瑛','左慈','葛玄','介象','介琰','杜契','孙寒华','李宽','李阿','董奉','白羊公','徐宗度','晏贤生','虞翁生','诸葛果','李意其','紫虚上人','骆曜','郑隐','魏华存','许逊','葛洪','魏伯阳','吴猛','诸葛亮']);
 const aliases={'杜泌':'白羊公','卧龙诸葛':'诸葛亮'};
 const forbiddenCategories=new Set(['Charlotte','主公技','觉醒技','限定技','隐匿技','使命技','持恒技']);
 let installed=false;
 function rawOwned(player){
  const all=[...(player.skills||[]),...Object.keys(player.tempSkills||{}),...(player.hiddenSkills||[]),...(player.invisibleSkills||[])];
  for(const value of Object.values(player.additionalSkills||{}))all.push(...(Array.isArray(value)?value:[value]));
  for(const record of player.storage?.[PREFIX]||[])if(record.pending)all.push(record.skill);
  if(player.getSkills)all.push(...player.getSkills(true,true,false));
  return new Set(all.filter(skill=>typeof skill==='string'));
 }
 function hasConversion(player){
  const skills=[...rawOwned(player)];if(game.expandSkills)game.expandSkills(skills);
  return skills.some(skill=>lib.skill[skill]&&(get.is?.zhuanhuanji?get.is.zhuanhuanji(skill,player):!!lib.skill[skill].zhuanhuanji));
 }
 function isGuozhan(id){
  if(id.startsWith('gz_'))return true;
  let normal=false,guozhan=false;
  for(const[pack,characters]of Object.entries(lib.characterPack||{}))if(Object.prototype.hasOwnProperty.call(characters||{},id)){
   if(lib.characterGuozhanFilter?.has?.(pack)||lib.characterGuozhanFilter?.includes?.(pack)||pack==='guozhan')guozhan=true;
   else normal=true;
  }
  return guozhan&&!normal;
 }
 function identityOf(id,character){
  let names;
  const declared=character.names||(Array.isArray(character)?character[4]?.find(item=>typeof item==='string'&&item.startsWith('name:'))?.slice(5):undefined);
  if(declared){
   const parts=declared.split('-');if(parts.length!==1)return null;
   names=parts.map(name=>name.split('|').map(x=>x==='null'?'':x).join(''));
  }else if(get.characterSurname){
   names=get.characterSurname(id).map(parts=>parts.join(''));
   if(names.length!==1)return null;
  }
  const candidates=[...(names||[]),get.rawName?.(id,true)];
  if(get.sourceCharacter){const origin=get.sourceCharacter(id);if(origin&&origin!==id)candidates.push(get.rawName?.(origin,true));}
  for(let name of candidates){name=aliases[name]||name;if(identities.has(name))return name;}
  return null;
 }
 function skillAllowed(skill,player,owned=rawOwned(player),conversion=hasConversion(player)){
  const info=lib.skill[skill];if(!info||owned.has(skill))return false;
  if(info.sub||info.charlotte||info.zhuSkill||info.limited||info.juexingji||info.dutySkill||info.hiddenSkill||info.persevereSkill||info.fixed||info.fixedSkill||(info.unique&&!info.gainable))return false;
  if(info.ai&&(info.ai.combo||info.ai.notemp||info.ai.neg))return false;
  if(get.skillCategoriesOf?.(skill,player)?.some(category=>forbiddenCategories.has(category)))return false;
  if(conversion&&(get.is?.zhuanhuanji?get.is.zhuanhuanji(skill,player):info.zhuanhuanji))return false;
  return true;
 }
 function candidates(player){
  const owned=rawOwned(player),conversion=hasConversion(player),result=new Set();
  for(const[id,character]of Object.entries(lib.character||{})){
   if(isGuozhan(id)||!identityOf(id,character))continue;
   const skills=character.skills||(Array.isArray(character)?character[3]:[])||[];
   for(const skill of skills)if(skillAllowed(skill,player,owned,conversion))result.add(skill);
  }
  return [...result];
 }
 function offers(player){
  const rest=candidates(player),result=[];
  while(rest.length&&result.length<3){const index=get.rand?get.rand(0,rest.length-1):Math.floor(Math.random()*rest.length);result.push(rest.splice(Math.max(0,Math.min(rest.length-1,index)),1)[0]);}
  return result;
 }
 function registry(player){return player.storage[PREFIX]??=[];}
 function records(player){
  const list=registry(player);
  for(let i=list.length-1;i>=0;i--){const entry=list[i];if(!entry.pending&&!player.additionalSkills?.[entry.source]?.includes(entry.skill))list.splice(i,1);}
  return list;
 }
 function count(player){return records(player).length;}
 async function grant(player,skill){
  if(!api.core.canAct(player)||count(player)>=3||!candidates(player).includes(skill))return false;
  const serial=(player.storage[PREFIX+'_serial']||0)+1;player.storage[PREFIX+'_serial']=serial;
  const record={skill,source:PREFIX+'_'+serial,expires:(Number(player.phaseNumber)||0)+1,pending:true};
  registry(player).push(record);
  try{
   await player.addAdditionalSkills(record.source,[skill],true);
   record.pending=false;
   if(!player.additionalSkills?.[record.source]?.includes(skill)){registry(player).splice(registry(player).indexOf(record),1);return false;}
   return true;
  }catch(error){const index=registry(player).indexOf(record);if(index>=0)registry(player).splice(index,1);throw error;}
 }
 async function choose(player){
  const options=offers(player);if(!options.length)return false;
  const result=await player.chooseControl(options)
   .set('prompt','玄阵：选择获得一个仙人技能')
   .set('choiceList',options.map(skill=>'【'+get.translation(skill)+'】'+get.skillInfoTranslation(skill,player)))
   .set('displayIndex',false)
   .set('ai',()=>{let best=0;for(let i=1;i<options.length;i++)if((get.skillRank?.(options[i],'in')||0)>(get.skillRank?.(options[best],'in')||0))best=i;return best;})
   .forResult();
  const chosen=options.includes(result?.control)?result.control:options[result?.index??0];
  return chosen?grant(player,chosen):false;
 }
 async function expire(player){
  for(const record of records(player).slice())if(!record.pending&&(Number(player.phaseNumber)||0)>=record.expires){
   await player.removeAdditionalSkills(record.source);
   const index=registry(player).indexOf(record);if(index>=0)registry(player).splice(index,1);
  }
 }
 function install(){if(installed)return;installed=true;game.addGlobalSkill(EXPIRE);}
 api.immortal={install,candidates,offers,choose,grant,count,expire,records,rawOwned,hasConversion,skillAllowed,identityOf};
 return{skills:{[EXPIRE]:{charlotte:true,forced:true,popup:false,lastDo:true,priority:-1000,
  trigger:{global:'phaseAfter'},
  filter(event,player){return event.player===player&&records(player).some(record=>!record.pending&&(Number(player.phaseNumber)||0)>=record.expires);},
  async content(event,trigger,player){await expire(player);}
 }},translate:{[EXPIRE]:'玄阵'}};
},
function createFangshu(lib,game,ui,get,ai,_status,api){
 const ID='bjgy_zhongyi_fangshu',BACKUP=ID+'_backup';
 const usage=new WeakMap();
 function alive(player){return api.core.canAct?api.core.canAct(player):!!player?.isIn?.();}
 function state(player){
  const turn=api.core.turnKey();let data=usage.get(player);
  if(!data||data.turn!==turn){data={turn,used:new Set()};usage.set(player,data);}
  return data;
 }
 const key=card=>card.cardid||card;
 function used(player,card){return state(player).used.has(key(card));}
 function owns(player){return alive(player)&&!!player.hasSkill?.(ID);}
 function copy(card,player){
  const result={name:get.name(card,player),suit:get.suit(card,player),number:get.number(card,player),isCard:true,cards:[],storage:{bjgyZhongyiFangshu:true}};
  const nature=get.nature(card,player);if(nature)result.nature=nature;
  return result;
 }
 function eligible(player,card){
  if(!owns(player)||!player.getCards('h').includes(card)||used(player,card))return false;
  const type=get.type(copy(card,player));return type==='basic'||type==='trick';
 }
 function candidates(player,event){
  if(event&&event.name!=='chooseToUse')return [];
  if(!owns(player))return [];
  return player.getCards('h').filter(card=>eligible(player,card)&&(!event?.filterCard||event.filterCard(copy(card,player),player,event)));
 }
 function claim(player,card){
  if(!eligible(player,card))return false;
  state(player).used.add(key(card));return true;
 }
 function currentWindow(){
  let event=typeof get.event==='function'?get.event():_status.event;
  const seen=new Set();
  while(event&&!seen.has(event)){
   seen.add(event);
   if(event.name==='chooseToRespond')return null;
   if(event.name==='chooseToUse')return event;
   event=typeof event.getParent==='function'?event.getParent():event.parent;
  }
  return null;
 }
 function hiddenCard(player,name){return candidates(player).some(card=>get.name(card,player)===name);}
 function backup(card,player){
  const virtual=copy(card,player);
  return {
   audio:false,log:false,
   selectCard:-1,filterCard:()=>false,
   viewAs:virtual,
   viewAsFilter(owner){return eligible(owner,card);},
   async precontent(event,trigger,owner){
    // Reaching precontent means the use and targets have been confirmed.
    // The exemplar is displayed, never paid as material or moved from hand.
    if(event.result?.bool===false)return;
    if(!claim(owner,card)){
     if(event.result)event.result.bool=false;
     return;
    }
    event.result.cards=[];
    event.result.card=virtual;
    owner.logSkill(ID);
    await owner.showCards([card],'仿书');
   },
  };
 }
 const skills={
  [ID]:{
   audio:false,locked:false,
   enable:'chooseToUse',
   filter(event,player){return candidates(player,event).length>0;},
   chooseButton:{
    dialog(event,player){return ui.create.dialog('仿书：展示一张手牌，视为使用其副本',[candidates(player,event),'card']);},
    filter(button,player){const event=currentWindow();return !!event&&candidates(player,event).includes(button.link);},
    check(button){const player=typeof get.player==='function'?get.player():_status.event.player;return typeof player.getUseValue==='function'?player.getUseValue(copy(button.link,player)):get.value(button.link,player);},
    backup(links,player){return backup(links[0],player);},
    prompt(links,player){return `仿书：展示${get.translation(links[0])}，视为使用其副本`;},
   },
   hiddenCard,
   ai:{
    order:8,respondSha:true,respondShan:true,save:true,
    skillTagFilter(player,tag,arg){
     if(arg==='respond')return false;
     if(tag==='respondSha')return hiddenCard(player,'sha');
     if(tag==='respondShan')return hiddenCard(player,'shan');
     if(tag==='save')return hiddenCard(player,'tao')||arg===player&&hiddenCard(player,'jiu');
     return false;
    },
    result:{player:1},
   },
  },
  [BACKUP]:{},
 };
 api.fangshu={candidates,copy,used,claim,backup,hiddenCard,install(){}};
 return {skills,translate:{
  [ID]:'仿书',
  [ID+'_info']:'每回合每张手牌限一次，你可以展示一张手牌中的基本牌或普通锦囊牌，然后视为使用此牌。副本保留展示牌的牌名、花色、点数与属性，正常计算距离和使用次数；展示的实体牌留在手中。同一实体牌离手后返回不刷新额度。可以在合法的使用牌时机发动，不能用于纯打出牌。',
  [BACKUP]:'仿书',
 }};
},
function createXuanzhen(lib,game,ui,get,ai,_status,api){
 const ID='bjgy_zhongyi_xuanzhen',USE=ID+'_use',END=ID+'_end';
 const frames=new WeakMap(),used=new WeakMap(),ended=new WeakMap();
 function claimed(map,event,player){return map.get(event)?.has(player)||false;}
 function claim(map,event,player){let players=map.get(event);if(!players)map.set(event,players=new Set());players.add(player);}
 function owns(player){return api.core.canAct(player)&&!!player.hasSkill(ID);}
 function frame(player){const record=frames.get(player);return record?.key===api.core.turnKey()?record:undefined;}
 function inOrdering(card){return get.position(card,true)==='o';}
 function validOrder(moved,cards){return Array.isArray(moved)&&moved.length===1&&Array.isArray(moved[0])&&moved[0].length===cards.length&&new Set(moved[0]).size===cards.length&&moved[0].every(card=>cards.includes(card));}
 async function begin(player){
  const x=Math.max(0,Math.min(8,Math.floor(Number(player.getHandcardLimit())||0)));
  frames.set(player,{key:api.core.turnKey(),x});
  if(!x)return;
  const cards=get.cards(x,true);if(!cards.length)return;
  await game.cardsGotoOrdering(cards);
  const live=cards.filter(inOrdering);if(!live.length)return;
  let top=live;
  if(api.core.canAct(player)){
   const result=await player.chooseToMove_new({
    prompt:'玄阵：将这些牌以任意顺序放回牌堆顶（靠左的在上）',forced:true,
    list:[['牌堆顶',live]],
    filterMove(){return true;},filterOk(moved){return validOrder(moved,live);},
    processAI(list){return [list[0][1].slice().sort((a,b)=>get.value(b)-get.value(a))];},
   }).forResult();
   if(result?.bool&&validOrder(result.moved,live))top=result.moved[0];
  }
  top=top.filter(inOrdering);if(top.length)await game.cardsGotoPile(top.slice().reverse(),'insert');
 }
 function ordinal(use){return (game.getGlobalHistory('useCard')||[]).indexOf(use)+1;}
 function eligibleUse(use,player){const record=frame(player),n=ordinal(use);return owns(player)&&record&&use.name==='useCard'&&n>0&&n<=record.x&&!claimed(used,use,player);}
 function properties(card,owner){return{suit:get.suit(card,owner),number:get.number(card,owner),type:get.type2(card,owner)};}
 function match(use,player){
  if(!eligibleUse(use,player))return false;
  const n=ordinal(use),card=ui.cardPile.childNodes[n-1];if(!card)return false;
  const a=properties(use.card,use.player),b=properties(card,false);
  return ['spade','heart','club','diamond'].includes(a.suit)&&a.suit===b.suit||Number.isInteger(a.number)&&a.number>=1&&a.number<=13&&a.number===b.number||['basic','trick','equip'].includes(a.type)&&a.type===b.type;
 }
 async function resolve(use,player){
  if(!eligibleUse(use,player))return false;
  const hit=match(use,player);claim(used,use,player);
  if(!hit)return false;
  player.logSkill?.(ID);
  api.core.adjustLimit(player,-1);
  if(api.immortal.count(player)>=3)await player.draw(2);
  else await api.immortal.choose(player);
  return true;
 }
 function totalDamage(player){
  const events=[...new Set(player.getHistory?.('sourceDamage')||[])];
  return events.reduce((sum,event)=>sum+(!event.unreal&&!event.cancelled&&(!event.source||event.source===player)?Math.max(0,Number(event.num)||0):0),0);
 }
 function damageAward(player){
  const own=totalDamage(player);if(!own)return 0;
  return [...new Set([...(game.players||[]),...(game.dead||[])])].some(other=>totalDamage(other)>own)?0:own;
 }
 async function rewardDamage(player){const amount=damageAward(player);if(amount)api.core.adjustLimit(player,amount);return amount;}
 api.xuanzhen={install(){},begin,frame,ordinal,match,resolve,totalDamage,damageAward,rewardDamage};
 return{skills:{
  [ID]:{forced:true,audio:false,trigger:{global:'phaseBegin'},group:[USE,END],
   async content(event,trigger,player){await begin(player);}
  },
  [USE]:{forced:true,popup:false,sourceSkill:ID,trigger:{global:'useCard1'},
   filter:eligibleUse,
   async content(event,trigger,player){await resolve(trigger,player);}
  },
  [END]:{forced:true,popup:false,sourceSkill:ID,trigger:{global:'phaseEnd'},
   filter(event,player){return owns(player)&&!claimed(ended,event,player)&&damageAward(player)>0;},
   async content(event,trigger,player){if(claimed(ended,trigger,player))return;claim(ended,trigger,player);player.logSkill?.(ID);await rewardDamage(player);}
  },
 },translate:{
  [ID]:'玄阵',[USE]:'玄阵',[END]:'玄阵',
  [ID+'_info']:'锁定技，每回合开始时，你观看牌堆顶X张牌并以任意顺序放回牌堆顶。本回合全场前X张牌被使用时，若其点数、花色或类型与此时牌堆顶起同次序的牌相同，你的手牌上限永久-1，然后从三个仙人技能中选择一个获得，直到你下个实际执行的回合结束；若你已拥有三个以此法获得的技能，则改为摸两张牌。每回合结束时，若你本回合实际造成的伤害点数为全场最多（可并列），你的手牌上限永久增加等量数值。X为回合开始时你的手牌上限，至多为8，本回合固定。',
 }};
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills));
 const translate=Object.assign({},...modules.map(module=>module.translate));
 let scheduled=false;
 return {
  name:'钟忆',editable:true,connect:false,
  content(){if(scheduled)return;scheduled=true;(lib.arenaReady??=[]).push(function installZhongyi(){
   api.core.install();api.immortal.install();api.fangshu?.install?.();api.xuanzhen.install();
  });},precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_zhongyi:['female','wei',4,['bjgy_zhongyi_hengce','bjgy_zhongyi_fangshu','bjgy_zhongyi_huiyi'],['die:false','ext:隐山之玉/bjgy_zhongyi.jpg']]},
    characterSubstitute:{bjgy_zhongyi:[['bjgy_zhongyi_awakened',['ext:隐山之玉/bjgy_zhongyi_awakened.jpg','die:false']]]},
    translate:{bjgy_zhongyi:'钟忆',bjgy_zhongyi_awakened:'钟忆'},
    characterIntro:{bjgy_zhongyi:'钟忆，魏、女性、初始体力4，体力上限4。会仪觉醒后切换仙人形态。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由设计者提供。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'钟忆：魏、女、4/4。衡策、仿书、会仪及衍生技玄阵。内含觉醒前后双形态原画，面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_zhongyi.jpg','bjgy_zhongyi_awakened.jpg'],card:[],skill:[],audio:[]}
 };
})(lib,game,ui,get,ai,_status)];
 const merge=(objects)=>{
  const result={};
  for(const object of objects)for(const[key,value]of Object.entries(object||{})){
   if(Object.prototype.hasOwnProperty.call(result,key))throw new Error('隐山之玉：重复登记 '+key);
   result[key]=value;
  }
  return result;
 };
 const character={};
 for(const key of ['character','translate','characterIntro','characterSubstitute','dynamicTranslate'])character[key]=merge(parts.map(part=>part.package.character[key]));
 const skills=merge(parts.map(part=>part.package.skill.skill)),translate=merge(parts.map(part=>part.package.skill.translate));
 const portraits=parts.flatMap(part=>part.files.character);
 return {
  name:'隐山之玉',editable:true,connect:false,
  async content(...args){for(const part of parts)if(part.content)await part.content.apply(this,args);},
  async precontent(...args){for(const part of parts)if(part.precontent)await part.precontent.apply(this,args);},
  help:{},config:{},
  package:{character,card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'郑以、孙伊、诸葛仪、钟忆四将整合扩展，包含钟忆觉醒前后双形态原画，面向无名杀1.11.6单机。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'1.0.0'},
  files:{character:portraits,card:[],skill:[],audio:[]}
 };
});
