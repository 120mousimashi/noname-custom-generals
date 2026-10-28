// 谋法正 v0.1.0 双形态测试版。技能设计：辟境归元；实现：OpenAI Codex 协助。
// 面向无名杀1.11.6。参考的本体接口适用其原有许可，原创实现见LICENSE。
game.import("extension", function(lib, game, ui, get, ai, _status) {
    "use strict";
    const createAnmou = function createAnmou(lib, game, ui, get, ai, _status) {
  const MAIN = "bjgy_mfz_anmou";
  const START = "bjgy_mfz_am_start";
  const LIMIT = "bjgy_mfz_am_limit";
  const DRAW = "bjgy_mfz_am_draw";
  const VOID = "bjgy_mfz_am_void";
  const SEEN = "_bjgy_mfz_am_seen";
  const STARTED = "bjgy_mfz_am_started";
  const YANG = "令一名角色摸X张牌并回复1点体力，然后标记其当前手牌中的伤害牌，这些牌不计入手牌上限，直到离开手牌；其接下来X次使用非伤害牌结算完成后，各摸1张牌";
  const YIN = "令一名角色弃置X张牌（不足则尽量弃置，范围为手牌和装备牌），然后令其视为依次使用等量张普通【杀】或【决斗】，每张分别选择，不受距离和次数限制；此法使用的牌每对一名角色实际造成1点伤害，整次谙谋结算结束后令其获得1枚“谙”标记";

  function amount(target) {
    return Math.max(0, Math.min(5, Math.floor(Number(target.maxHp) || 0)));
  }
  function seen(trigger, owner) {
    return !!(trigger[SEEN] && trigger[SEEN].includes(owner));
  }
  function recordSeen(trigger, owner) {
    if (!trigger[SEEN]) trigger[SEEN] = [];
    if (!trigger[SEEN].includes(owner)) trigger[SEEN].push(owner);
  }
  function legalUsers(user, virtualCard) {
    return game.players.filter(target => target.isIn() && user.canUse(virtualCard, target, false));
  }
  function description(player) {
    const yang = "阳：" + YANG + "。";
    const yin = "阴：" + YIN + "。";
    return "转换技，一名角色翻面后，或一名角色的一个阶段被跳过后，你可以发动并转换状态。" +
      (player && !player.storage[MAIN] ? '<span class="bluetext">' + yang + "</span>" : yang) +
      (player && player.storage[MAIN] ? '<span class="bluetext">' + yin + "</span>" : yin) +
      "X为所选角色的体力上限且至多为5；摸牌次数与“谙”标记均可跨回合叠加。有“谙”标记的角色使用牌时移去1枚，令此整张牌无效。游戏开始时或你进入游戏时，可选择一次初始阴阳状态。";
  }

  const skills = {
    [MAIN]: {
      name: "谙谋",
      mark: true,
      marktext: "☯",
      zhuanhuanji(player, skill) {
        player.storage[skill] = !player.storage[skill];
        player.changeSkin(
          { characterName: "bjgy_moufazheng" },
          player.storage[skill] ? "bjgy_moufazheng_shadow" : "bjgy_moufazheng"
        );
      },
      intro: {
        content(storage) {
          return (storage ? "阴：" + YIN : "阳：" + YANG) + "（X为其体力上限且至多为5）";
        },
      },
      trigger: {
        global: [
          "turnOverAfter",
          "phaseZhunbeiSkipped", "phaseZhunbeiCancelled",
          "phaseJudgeSkipped", "phaseJudgeCancelled",
          "phaseDrawSkipped", "phaseDrawCancelled",
          "phaseUseSkipped", "phaseUseCancelled",
          "phaseDiscardSkipped", "phaseDiscardCancelled",
          "phaseJieshuSkipped", "phaseJieshuCancelled",
        ],
      },
      filter(event, player) {
        return !!event.player && !seen(event, player);
      },
      async cost(event, trigger, player) {
        const isYang = !player.storage[MAIN];
        const result = await player.chooseTarget(
          get.prompt(MAIN),
          (isYang ? "【阳】" + YANG : "【阴】" + YIN) + "（X为其体力上限且至多为5）",
          function (card, chooser, target) { return target.isIn(); }
        ).set("ai", function (target) {
          const chooser = get.player();
          const x = amount(target);
          return (!chooser.storage[MAIN] ? 1 : -1) * get.attitude(chooser, target) * (x + 1);
        }).forResult();
        // Both Cancelled and Skipped can describe this same concrete stage.
        // Declining the first offer must not create a second offer.
        recordSeen(trigger, player);
        event.result = result;
        if (result.bool && result.targets && result.targets[0]) {
          // The engine creates a NEW main-content event; cost_data is its bridge.
          result.cost_data = { x: amount(result.targets[0]), isYang };
        }
      },
      async content(event, trigger, player) {
        const target = event.targets && event.targets[0];
        if (!target || !target.isIn()) return;
        recordSeen(trigger, player);
        const x = event.cost_data ? event.cost_data.x : amount(target);
        const isYang = event.cost_data ? event.cost_data.isYang : !player.storage[MAIN];
        player.changeZhuanhuanji(MAIN);
        if (isYang) {
          if (x > 0) await target.draw(x);
          if (!target.isIn()) return;
          await target.recover(1);
          if (!target.isIn()) return;
          const cards = target.getCards("h", card => !!get.tag(card, "damage"));
          if (cards.length) {
            target.addGaintag(cards, LIMIT);
            target.addSkill(LIMIT);
          }
          if (x > 0) {
            target.addSkill(DRAW);
            target.addMark(DRAW, x, false);
          }
          return;
        }

        const discardCount = Math.min(x, target.countCards("he", card => lib.filter.cardDiscardable(card, target, MAIN)));
        if (discardCount <= 0) return;
        const discardChoice = target.chooseToDiscard("he", discardCount, true)
          .set("prompt", "谙谋：弃置" + get.cnNumber(discardCount) + "张牌，然后依次视为使用普通【杀】或【决斗】")
          .set("ai", function (card) { return 8 - get.value(card); });
        const discardedResult = await discardChoice.forResult();
        // Native shape: chooseToDiscard.done = discard, discard.done = lose.
        // result.cards only describes the chosen cards and can overcount a
        // cancelled/replaced loss. cards2 records cards actually lost from he.
        const lose = discardChoice.done && discardChoice.done.done;
        const discarded = lose && Array.isArray(lose.cards2) && discardedResult.cards
          ? lose.cards2.filter(card => discardedResult.cards.includes(card)) : [];
        const uses = [];
        for (let index = 0; index < discarded.length; index++) {
          if (!target.isIn()) break;
          const names = ["sha", "juedou"].filter(name => legalUsers(target, { name, isCard: true }).length > 0);
          if (!names.length) continue;
          let name = names[0];
          if (names.length > 1) {
            const result = await target.chooseControl(names)
              .set("prompt", "谙谋：选择第" + (index + 1) + "张视为使用的牌")
              .set("choiceList", names.map(item => "使用【" + get.translation(item) + "】"))
              .set("ai", function () { return 0; }).forResult();
            if (names.includes(result.control)) name = result.control;
            else if (Number.isInteger(result.index) && names[result.index]) name = names[result.index];
          }
          // Deliberately omit nature: this is an ordinary sha.
          const virtualCard = { name, isCard: true };
          const result = await target.chooseTarget(
            true,
            "谙谋：选择【" + get.translation(name) + "】的目标（无距离限制，不计入次数）",
            function (card, user, aim) {
              return aim.isIn() && user.canUse(_status.event._bjgy_mfz_am_card, aim, false);
            }
          ).set("_bjgy_mfz_am_card", virtualCard)
            .set("ai", function (aim) {
              return get.effect(aim, _status.event._bjgy_mfz_am_card, get.player(), get.player());
            }).forResult();
          const aim = result.targets && result.targets[0];
          if (!result.bool || !aim || !target.isIn() || !aim.isIn() || !target.canUse(virtualCard, aim, false)) continue;
          const use = target.useCard(virtualCard, false, aim);
          uses.push(use);
          await use;
        }
        if (!uses.length) return;
        // Each invocation owns its own concrete useCard event set. Reentrant
        // anmou/zhibian, other cards, and extra-turn history segments stay apart.
        const allPlayers = [...new Set(game.players.concat(game.dead || []))];
        for (const victim of allPlayers) {
          let total = 0;
          for (const damage of victim.getAllHistory("damage")) {
            if (damage.unreal || !(damage.num > 0) || !damage.card) continue;
            const originalUse = damage.getParent("useCard");
            if (uses.includes(originalUse) && damage.card === originalUse.card) total += damage.num;
          }
          if (total > 0 && victim.isIn()) {
            victim.addSkill(VOID);
            victim.addMark(VOID, total, false);
          }
        }
      },
      group: [START],
      ai: { threaten: 1.6 },
    },
    [START]: {
      trigger: { global: "phaseBefore", player: "enterGame" },
      forced: true,
      popup: false,
      filter(event, player) {
        return !player.storage[STARTED] && (event.name !== "phase" || game.phaseNumber === 0);
      },
      async content(event, trigger, player) {
        if (player.storage[STARTED]) return;
        player.storage[STARTED] = true;
        const result = await player.chooseControl("阳", "阴")
          .set("prompt", "谙谋：选择初始阴阳状态")
          .set("ai", function () { return 0; }).forResult();
        const desiredYin = result.control === "阴" || result.index === 1;
        if (!!player.storage[MAIN] !== desiredYin) player.changeZhuanhuanji(MAIN);
      },
    },
    [LIMIT]: {
      charlotte: true,
      intro: { content: "手牌中被谙谋标记的伤害牌不计入手牌上限；离开手牌时清除该牌标记。" },
      mod: {
        ignoredHandcard(card) { if (card.hasGaintag(LIMIT)) return true; },
        cardDiscardable(card, player, name) {
          if (name === "phaseDiscard" && card.hasGaintag(LIMIT)) return false;
        },
      },
      onremove(player) { player.removeGaintag(LIMIT); },
    },
    [DRAW]: {
      charlotte: true,
      mark: true,
      marktext: "谋",
      intro: { content: "接下来使用的#张非伤害牌结算完成后各摸一张牌，可跨回合累计。" },
      trigger: { player: "useCardAfter" },
      forced: true,
      popup: false,
      filter(event, player) { return player.countMark(DRAW) > 0 && !!event.card && !get.tag(event.card, "damage"); },
      async content(event, trigger, player) {
        player.removeMark(DRAW, 1, false);
        if (!player.countMark(DRAW)) player.removeSkill(DRAW);
        await player.draw(1);
      },
      onremove: true,
    },
    [VOID]: {
      charlotte: true,
      mark: true,
      marktext: "谙",
      intro: { content: "接下来使用的#张牌无效，可跨回合累计。" },
      trigger: { player: "useCard" },
      forced: true,
      popup: false,
      firstDo: true,
      filter(event, player) { return player.countMark(VOID) > 0; },
      async content(event, trigger, player) {
        player.removeMark(VOID, 1, false);
        if (!player.countMark(VOID)) player.removeSkill(VOID);
        trigger.all_excluded = true;
      },
      onremove: true,
    },
  };

  return {
    skills,
    translate: {
      [MAIN]: "谙谋", [MAIN + "_info"]: description(),
      [START]: "谙谋", [LIMIT]: "谙谋·阳", [DRAW]: "谙谋·摸牌", [VOID]: "谙谋·无效",
      [LIMIT + "_info"]: "被标记的伤害手牌不计入手牌上限，离开手牌时清除标记。",
      [DRAW + "_info"]: "每次使用非伤害牌结算完成后移去一枚标记并摸一张牌。",
      [VOID + "_info"]: "使用牌时移去一枚标记，令整张牌无效。",
      [LIMIT + "_tag"]: "谙谋",
    },
    dynamicTranslate: { [MAIN](player) { return description(player); } },
  };
};
    const createZhibian = function createZhibian(lib, game, ui, get, ai, _status) {
  // Event identities are deliberate: an inserted turn and each inserted stage
  // have their own lifetimes, irrespective of phaseNumber/phaseIndex/phase.num.
  const state = {
    uses: new WeakMap(), outside: {}, pending: [], locks: [], turns: new WeakMap(),
  };
  const mainId = 'bjgy_mfz_zhibian';
  const globalIds = ['bjgy_mfz_zb_begin', 'bjgy_mfz_zb_stage', 'bjgy_mfz_zb_watch'];
  const phaseNames = ['phaseZhunbei', 'phaseJudge', 'phaseDraw', 'phaseUse', 'phaseDiscard', 'phaseJieshu'];
  const labels = ['一：红桃与置底', '二：伤害牌与加阶段', '三：全取与翻面'];
  const alive = player => !!player && player.isIn();
  function phaseOf(event) {
    if (!event) return null;
    return event.name === 'phase' ? event : event.getParent?.('phase') || null;
  }
  function tokenOf(event) { return phaseOf(event) || state.outside; }
  function used(source, token, create) {
    let turns = state.uses.get(source);
    if (!turns && create) state.uses.set(source, turns = new WeakMap());
    let choices = turns?.get(token);
    if (!choices && create) turns.set(token, choices = new Set());
    return choices;
  }
  function available(source, event) {
    const choices = used(source, tokenOf(event), false);
    return [0, 1, 2].filter(index => !choices?.has(index) && (index !== 2 || !state.locks.some(lock => lock.source === source)));
  }
  function unlock(lock) {
    const index = state.locks.indexOf(lock);
    if (index !== -1) state.locks.splice(index, 1);
  }
  function gainHasOccurred(lock) {
    return lock.gainSettled || !!(lock.gainEvent && lock.gainEvent._triggered >= 3);
  }
  function finishTurn(turn) {
    const info = state.turns.get(turn);
    if (info) info.closed = true;
    state.pending = state.pending.filter(effect => effect.turn !== turn);
    for (const lock of state.locks.slice()) {
      if (lock.target !== turn.player) continue;
      if (!alive(lock.target)) unlock(lock);
      else if (!gainHasOccurred(lock)) continue;
      else if (lock.gaining) lock.endedCount = Math.max(lock.endedCount, lock.used);
      else if (lock.used >= lock.need) unlock(lock);
    }
  }
  function install() { for (const id of globalIds) game.addGlobalSkill(id); }
  function isHeld(card) { return card.parentNode === ui.special; }
  async function putTop(cards) {
    const held = cards.filter(isHeld);
    if (held.length) await game.cardsGotoPile(held.slice().reverse(), 'insert');
  }
  function obtained(gainEvent, target, eligible) {
    // getg() alone still returns the requested cards when gainBefore cancels
    // the native event. Native gain history confirms that it actually ran.
    const history = target.getAllHistory?.('gain');
    if (Array.isArray(history) && !history.includes(gainEvent)) return 0;
    const actual = typeof gainEvent?.getg === 'function' ? gainEvent.getg(target) : gainEvent?.cards || [];
    return new Set(actual.filter(card => eligible.includes(card))).size;
  }
  function readyEffect(effect) {
    if (!effect.gainEvent) return effect.at > 0;
    // A turn inserted by gainBefore is too early; gainEnd/gainAfter occur only
    // after the native gain has filtered destroyed/replaced cards and moved
    // them. Their nested turns must see this effect before await gain returns.
    if (!effect.gainSettled && !(effect.gainEvent._triggered >= 3)) return false;
    effect.at = obtained(effect.gainEvent, effect.target, effect.eligible);
    if (!effect.at) effect.spent = true;
    return effect.at > 0;
  }
  function isPhaseUseSkill(info) {
    return info?.enable === 'phaseUse' || (Array.isArray(info?.enable) && info.enable.includes('phaseUse'));
  }
  function savePhaseUseCounters(player) {
    const stat = player.getStat?.();
    if (!stat) return null;
    const saved = { skill: new Map(), card: new Map() };
    for (const key in stat.skill) if (isPhaseUseSkill(lib.skill[key])) saved.skill.set(key, stat.skill[key]);
    for (const key in stat.card) if (lib.card[key]?.updateUsable === 'phaseUse') saved.card.set(key, stat.card[key]);
    return saved;
  }
  function restorePhaseUseCounters(player, saved) {
    if (!saved) return;
    const stat = player.getStat();
    // Native phaseUse[0] resets these two categories. Restore the original
    // stage's Before consumption rather than blindly replaying that reset.
    // Skills/cards acquired inside the extra stage start at zero in this one.
    for (const key of new Set([...Object.keys(stat.skill), ...saved.skill.keys()])) {
      if (isPhaseUseSkill(lib.skill[key])) stat.skill[key] = saved.skill.has(key) ? saved.skill.get(key) : 0;
    }
    for (const key of new Set([...Object.keys(stat.card), ...saved.card.keys()])) {
      if (lib.card[key]?.updateUsable === 'phaseUse') stat.card[key] = saved.card.has(key) ? saved.card.get(key) : 0;
    }
  }

  const skills = {
    [mainId]: {
      trigger: { global: ['changeHpAfter', 'loseMaxHpAfter'] },
      direct: true,
      init(player) { install(); },
      filter(event, player) {
        // Native changedHp subtracts max(0, originalHp), so undo that clamp to
        // retain genuine recoveries from negative HP to zero while dying.
        const delta = event.changedHp - Math.min(0, event.originalHp ?? 0);
        return alive(player) && !!event.num && Number.isFinite(delta) && delta !== 0 && available(player, event).length > 0;
      },
      async content(event, trigger, player) {
        install();
        if (!available(player, trigger).length) return;
        const consent = await player.chooseBool('知变：是否观看牌堆顶六张牌？').set('ai', () => true).forResult();
        if (!consent.bool || !alive(player)) return;

        // Detach the exact six cards before a choice or gain can run another
        // skill. The unchosen portion never becomes a fresh top-six query.
        const batch = get.cards(6);
        // Ordering is public in native gain (it marks every card as known to
        // everyone). The unmarked special area preserves this private peek.
        if (batch.length) await game.cardsGotoSpecial(batch, false);
        let reservation = null, committed = false;
        try {
          const options = available(player, trigger);
          if (!options.length) return;
          const controls = options.map(index => labels[index]).concat('cancel2');
          const answer = await player.chooseControl(controls)
            .set('prompt', '知变：选择一项，随后选择获得牌的角色')
            .set('dialogcontrol', true).set('addDialog', [batch])
            .set('ai', () => 0).forResult();
          const index = labels.indexOf(answer.control);
          if (!options.includes(index) || !available(player, trigger).includes(index)) return;

          // Reserve before the target UI, then commit before gain. Cancellation
          // releases only this reservation; nested calls cannot reuse it.
          const choices = used(player, tokenOf(trigger), true);
          choices.add(index);
          reservation = { choices, index };
          const picked = await player.chooseTarget('知变：选择一名角色', (card, source, target) => target.isIn())
            .set('ai', target => get.attitude(player, target)).forResult();
          const target = picked.targets?.[0];
          if (!picked.bool || !alive(target) || !alive(player)) return;
          committed = true;
          player.logSkill(mainId, target);
          const give = batch.filter(card => isHeld(card) && (index === 2 || (index === 0 ? get.suit(card, false) === 'heart' : !!get.tag(card, 'damage'))));
          let rest = batch.filter(card => !give.includes(card));
          let bottom = [];
          if (index === 0 && rest.length) {
            const moved = await player.chooseToMove('知变：任意张置底，底牌左到右排序；留顶自动恢复原顺序', true)
              .set('list', [['留在牌堆顶（保持原序）', rest], ['牌堆底（右为最底）', []]])
              .set('processAI', list => [list[0][1].slice(), []]).forResult();
            if (moved.bool && moved.moved?.[1]) {
              bottom = [...new Set(moved.moved[1])].filter(card => rest.includes(card));
              rest = rest.filter(card => !bottom.includes(card));
            }
          }

          // The third-option lock and useCard listener exist before gain begins.
          // This also counts cards used by nested gainAfter effects.
          let lock = null;
          if (index === 2) {
            lock = { source: player, target, need: give.length, used: 0, seen: new WeakSet(target.getAllHistory?.('useCard') || []), gaining: true, gainEvent: null, gainSettled: false, endedCount: -1 };
            state.locks.push(lock);
          }
          let amount = 0;
          let phaseEffect = null;
          if (give.length) {
            const gainEvent = target.gain(give, 'draw');
            if (lock) lock.gainEvent = gainEvent;
            if (index !== 2) {
              phaseEffect = { source: player, target, kind: index === 0 ? 'skip' : 'extra', at: 0, turn: null, spent: false, gainEvent, gainSettled: false, eligible: give };
              state.pending.push(phaseEffect);
            }
            await gainEvent;
            amount = obtained(gainEvent, target, give);
            if (phaseEffect) {
              phaseEffect.gainSettled = true;
              phaseEffect.at = amount;
              if (!amount || !alive(target)) state.pending = state.pending.filter(effect => effect !== phaseEffect);
            }
          }
          if (lock) {
            lock.need = amount;
            lock.gaining = false;
            lock.gainSettled = true;
            if (!alive(target) || lock.endedCount >= lock.need) unlock(lock);
          }
          // Gain can wash or replace the pile. Only this batch's still-held
          // remainder is returned; newly introduced cards stay untouched.
          rest = batch.filter(card => !bottom.includes(card) && isHeld(card));
          await putTop(rest);
          const heldBottom = bottom.filter(isHeld);
          if (heldBottom.length) await game.cardsGotoPile(heldBottom);
          if (index === 2 && alive(target)) await target.turnOver();
        } finally {
          if (reservation && !committed) reservation.choices.delete(reservation.index);
          // Covers all UI cancellations and also an interrupted choice. Cards
          // already gained, destroyed, or moved elsewhere are never reclaimed.
          await putTop(batch);
        }
      },
      ai: { threaten: 1.6 },
    },
    bjgy_mfz_zb_begin: {
      charlotte: true, forced: true, popup: false, firstDo: true, priority: 10000,
      trigger: { global: 'phaseBeginStart' },
      filter(event) { return !state.turns.has(event); },
      async content(event, trigger) {
        state.turns.set(trigger, { count: 0, seen: new WeakMap(), closed: false });
        for (const effect of state.pending) {
          if (effect.target === trigger.player && effect.turn === null && readyEffect(effect)) effect.turn = trigger;
        }
        state.pending = state.pending.filter(effect => !effect.spent);
        const cleanup = game.createEvent('bjgy_mfz_zb_cleanup', false);
        const queue = event.next;
        const position = queue.indexOf(cleanup);
        if (position !== -1) queue.splice(position, 1);
        cleanup.player = trigger.player;
        cleanup.forceDie = true;
        cleanup.includeOut = true;
        cleanup.bjgy_mfz_zb_turn = trigger;
        cleanup.setContent(async function (cleanupEvent) { finishTurn(cleanupEvent.bjgy_mfz_zb_turn); });
        trigger.after.push(cleanup);
      },
    },
    bjgy_mfz_zb_stage: {
      charlotte: true, forced: true, popup: false, lastDo: true, priority: -10000,
      trigger: { global: phaseNames.map(name => name + 'Before') },
      filter(event) {
        if (event.finished || event._cancelled || event.isSkipped || !alive(event.player)) return false;
        const info = state.turns.get(phaseOf(event));
        return !!info && !info.closed && !info.seen.has(event);
      },
      async content(event, trigger) {
        const turn = phaseOf(trigger), info = state.turns.get(turn);
        if (!info || info.closed || info.seen.has(trigger)) return;
        info.seen.set(trigger, 'processing');
        let originalUseCounters = null;
        while (!trigger.finished && !trigger._cancelled && alive(trigger.player) && !info.closed) {
          const ordinal = info.count + 1;
          const due = state.pending.filter(effect => effect.turn === turn && !effect.spent && effect.at === ordinal);
          // Snapshot and consume all same-ordinal effects BEFORE recursion.
          for (const effect of due) effect.spent = true;
          const skipOriginal = due.some(effect => effect.kind === 'skip');
          if (!originalUseCounters && trigger.name === 'phaseUse' && due.some(effect => effect.kind === 'extra')) {
            originalUseCounters = savePhaseUseCounters(trigger.player);
          }
          for (const effect of due) {
            if (effect.kind !== 'extra' || !alive(trigger.player) || info.closed) continue;
            const extra = trigger.player[trigger.name]();
            extra._extraPhaseReason = mainId;
            await extra;
          }
          if (skipOriginal) {
            info.seen.set(trigger, 'skipped');
            trigger.cancel();
            return;
          }
          // Inserted stages take the earlier ordinals. Re-evaluate the original
          // at its new ordinal, allowing e.g. extra-3 then skip-4 to compose.
          if (due.some(effect => effect.kind === 'extra')) continue;
          restorePhaseUseCounters(trigger.player, originalUseCounters);
          info.count++;
          info.seen.set(trigger, info.count);
          return;
        }
      },
    },
    bjgy_mfz_zb_watch: {
      charlotte: true, forced: true, popup: false, firstDo: true, priority: 10000, forceDie: true,
      trigger: { global: ['useCard', 'phaseAfter', 'dieAfter'] },
      filter(event, player, name) {
        if (name === 'phaseAfter') return state.turns.has(event);
        return state.locks.some(lock => lock.target === event.player) || (name === 'dieAfter' && state.pending.some(effect => effect.target === event.player));
      },
      async content(event, trigger) {
        if (event.triggername === 'phaseAfter') { finishTurn(trigger); return; }
        if (event.triggername === 'dieAfter') {
          state.pending = state.pending.filter(effect => effect.target !== trigger.player);
          for (const lock of state.locks.slice()) if (lock.target === trigger.player) unlock(lock);
          return;
        }
        for (const lock of state.locks) {
          if (lock.target !== trigger.player || lock.seen.has(trigger)) continue;
          lock.seen.add(trigger);
          if (!gainHasOccurred(lock)) continue;
          lock.used++;
        }
      },
    },
  };
  const description = '每回合每项各限一次。一名角色的体力实际变化后，你可以观看牌堆顶六张牌并选择一项：①令一名角色获得其中所有红桃牌，你将其余任意张牌按任意顺序置于牌堆底，未置底的牌保持原序留顶；其下个实际开始的回合跳过第X个实际阶段。②令一名角色获得其中所有伤害牌，其余原序留顶；其下个实际开始的回合第X个实际阶段开始前，先执行一个相同阶段。以上X为其实际获得牌数，X为0不产生阶段效果，未在该回合命中的效果于回合结束清除。③令一名角色获得这六张牌并翻面，此项暂时失效；从此次获得牌开始累计其使用牌数，达到其实际获得牌数后，于其回合结束恢复此项，其阵亡则立即恢复。额外回合也可生效，因翻面跳过整个回合不消耗待生效效果。同序号额外与跳过同时命中时，先执行额外阶段，再跳过原阶段，均只消耗一次。';
  return {
    skills,
    translate: { [mainId]: '知变', [mainId + '_info']: description, bjgy_mfz_zb_begin: '知变', bjgy_mfz_zb_stage: '知变', bjgy_mfz_zb_watch: '知变' },
    dynamicTranslate: {
      [mainId](player) {
        const locks = state.locks.filter(lock => lock.source === player);
        if (!locks.length) return description;
        return description + '<br><span class="firetext">第三项暂时失效：' + locks.map(lock => get.translation(lock.target) + '已使用' + lock.used + '/' + lock.need + '张牌').join('；') + '。</span>';
      },
    },
  };
};
    const modules = [createAnmou(lib, game, ui, get, ai, _status), createZhibian(lib, game, ui, get, ai, _status)];
    const skills = Object.assign({}, ...modules.map(item => item.skills));
    const translate = Object.assign({}, ...modules.map(item => item.translate));
    const dynamicTranslate = Object.assign({}, ...modules.map(item => item.dynamicTranslate || {}));
    return {
        name: "谋法正",
        editable: true,
        connect: false,
        content: async function() {},
        precontent: async function() {},
        help: {},
        config: {},
        package: {
            character: {
                character: {
                    bjgy_moufazheng: ["male", "shu", 3, ["bjgy_mfz_anmou", "bjgy_mfz_zhibian"], ["die:false", "ext:谋法正/bjgy_moufazheng.jpg"]]
                },
                characterSubstitute: {
                    bjgy_moufazheng: [["bjgy_moufazheng_shadow", ["ext:谋法正/bjgy_moufazheng_shadow.jpg", "die:false"]]]
                },
                translate: {bjgy_moufazheng: "谋·法正", bjgy_moufazheng_shadow: "谋·法正"},
                characterIntro: {bjgy_moufazheng: "原创谋法正。技能设计：辟境归元。蜀势力，男性，体力及体力上限3/3。白旗为谙谋阳状态，红旗为阴状态；以本体原生转换技接口自动切换原画。"},
                dynamicTranslate: dynamicTranslate
            },
            card: {card: {}, translate: {}, list: []},
            skill: {skill: skills, translate: translate},
            intro: "谋·法正：蜀，男，3/3。包含谙谋、知变及白旗阳/红旗阴双形态原画。本体原生切换，无需额外皮肤扩展。此版本供设计者实测。",
            author: "辟境归元",
            diskURL: "",
            forumURL: "",
            version: "0.1.0"
        },
        files: {character: ["bjgy_moufazheng.jpg", "bjgy_moufazheng_shadow.jpg"], card: [], skill: [], audio: []}
    };
});
