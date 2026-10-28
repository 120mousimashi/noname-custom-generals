// 辅翼谙计 v1.0.0。设计：辟境归元；代码与打包：OpenAI Codex协助。
// 保留四将已确认的技能机制；原创代码MIT，原画与设计文字另行署名。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const parts=[(function(lib, game, ui, get, ai, _status) {
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
                    bjgy_moufazheng: ["male", "shu", 3, ["bjgy_mfz_anmou", "bjgy_mfz_zhibian"], ["die:false", "ext:辅翼谙计/bjgy_moufazheng.jpg"]]
                },
                characterSubstitute: {
                    bjgy_moufazheng: [["bjgy_moufazheng_shadow", ["ext:辅翼谙计/bjgy_moufazheng_shadow.jpg", "die:false"]]]
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
})(lib,game,ui,get,ai,_status),
(function(lib, game, ui, get, ai, _status) {
    "use strict";
    const createLiedi = function createLiedi(lib, game, ui, get, ai, _status) {
  const MAIN = 'bjgy_mhz_liedi';
  const DAMAGE = 'bjgy_mhz_ld_damage';
  const suits = new Set(['spade', 'heart', 'club', 'diamond']);
  function extra(target) {
    return new Set(target.getCards('e').map(card => get.suit(card, target)).filter(suit => suits.has(suit))).size;
  }
  const description = '锁定技，你使用【杀】无距离限制，装备区没有牌的其他角色不能响应你使用的【杀】。你对装备区牌数比你多的角色造成伤害时，此伤害+X（X为其当前装备区的花色数，只计四种常规花色）。技能伤害也适用，铁索传导到每名角色时重新判断并增加伤害。';
  return {
    skills: {
      [MAIN]: {
        name: '烈镝', forced: true, locked: true,
        mod: {
          targetInRange(card, player) { if (get.name(card, player) === 'sha') return true; },
        },
        trigger: {player: 'useCard'},
        filter(event, player) { return !!event.card && get.name(event.card, player) === 'sha'; },
        async content(event, trigger, player) {
          const targets = game.filterPlayer(target => target !== player && target.countCards('e') === 0);
          trigger.directHit.addArray(targets);
        },
        group: [DAMAGE],
        ai: {threaten: 1.8},
      },
      [DAMAGE]: {
        trigger: {source: 'damageBegin1'}, forced: true, locked: true, popup: false,
        filter(event, player) {
          return event.source === player && !!event.player && event.num > 0 && !event.unreal &&
            event.player.countCards('e') > player.countCards('e');
        },
        async content(event, trigger, player) {
          trigger.num += extra(trigger.player);
        },
      },
    },
    translate: {[MAIN]: '烈镝', [MAIN + '_info']: description, [DAMAGE]: '烈镝'},
    dynamicTranslate: {},
  };
};
    const createCuifeng = function createCuifeng(lib, game, ui, get, ai, _status) {
  const MAIN = 'bjgy_mhz_cuifeng';
  const REWARD = 'bjgy_mhz_cf_reward';
  const EFFECT = 'bjgy_mhz_cf_effect';
  const CLEAR = 'bjgy_mhz_cf_clear';
  const STATE = 'bjgy_mhz_cf_state';
  const TURN = '_bjgy_mhz_cf_key';
  const USE = '_bjgy_mhz_cf_use';
  const SEEN = '_bjgy_mhz_cf_rewarded';
  let nextId = 0;

  function ancestor(event, name) {
    if (!event) return null;
    if (event.name === name) return event;
    if (typeof event.getParent === 'function') return event.getParent(name, true, true) || null;
    return null;
  }

  function phaseOf(event) {
    return ancestor(event, 'phase') || ancestor(_status.event, 'phase');
  }

  function stateOf(player, create = false) {
    if (!player.storage[STATE] && create) player.storage[STATE] = { turns: {}, b: 0 };
    return player.storage[STATE];
  }

  function scopeOf(player, event) {
    const data = stateOf(player);
    if (!data) return null;
    const phase = phaseOf(event);
    return data.turns[phase ? phase[TURN] : 'outside'] || null;
  }

  function refresh(player, event) {
    const data = stateOf(player);
    const scope = scopeOf(player, event);
    if (data && (data.b > 0 || scope && scope.a > 0)) player.markSkill(EFFECT);
    else player.unmarkSkill(EFFECT);
  }

  function clearScope(player, key, event) {
    const data = stateOf(player);
    if (data) delete data.turns[key];
    refresh(player, event);
  }

  function ensureScope(player, event) {
    const data = stateOf(player, true);
    const phase = phaseOf(event);
    if (phase && !phase[TURN]) phase[TURN] = typeof get.id === 'function' ? get.id() : `bjgy_mhz_cf_${++nextId}`;
    const key = phase ? phase[TURN] : 'outside';
    if (!data.turns[key]) {
      data.turns[key] = { a: 0, adjust: 0, disabled: false };
      // A phase can be finished early and skip its ordinary phaseAfter step.
      // Its after queue still runs; each cleanup deletes only this exact phase key.
      if (phase) {
        const cleanup = game.createEvent('bjgy_mhz_cf_cleanup', false);
        const parent = cleanup.getParent();
        if (parent && Array.isArray(parent.next)) {
          const index = parent.next.indexOf(cleanup);
          if (index !== -1) parent.next.splice(index, 1);
        }
        cleanup.player = player;
        cleanup.forceDie = true;
        cleanup.includeOut = true;
        cleanup.bjgyMhzTurnKey = key;
        cleanup.setContent(async function (event, trigger, player) {
          clearScope(player, event.bjgyMhzTurnKey, event);
        });
        phase.after.push(cleanup);
      }
    }
    // This independent charlotte skill owns benefits already earned, even if
    // the character subsequently loses the original source skill.
    player.addSkill(EFFECT);
    return data.turns[key];
  }

  function disabled(player, event) {
    const scope = scopeOf(player, event);
    return !!(scope && scope.disabled);
  }

  function usableTarget(player, use, target) {
    return target !== player && !use.targets.includes(target) && player.inRange(target) && lib.filter.targetEnabled2(use.card, player, target);
  }

  function mayAddTarget(event, player) {
    const use = ancestor(event, 'useCard');
    if (!use || disabled(player, event) || !use.card || !Array.isArray(use.targets) || use.targets.length !== 1) return false;
    const info = get.info(use.card);
    if (!get.tag(use.card, 'damage') || !info || info.allowMultiple === false || info.multitarget) return false;
    return game.hasPlayer(target => usableTarget(player, use, target));
  }

  function snapshot(player, use) {
    if (use[USE]) return use[USE];
    const data = stateOf(player);
    const scope = scopeOf(player, use);
    const saved = use[USE] = { a: !!(scope && scope.a > 0), b: !!(data && data.b > 0), applied: false };
    if (saved.a) scope.a--;
    if (saved.b) data.b--;
    return saved;
  }

  function excludeStartedUses(player, event) {
    // A new reward starts with the NEXT use. This also covers damage nested in
    // the physical-card loss steps before an already started use reaches useCard0.
    let use = ancestor(event, 'useCard');
    const visited = [];
    while (use && !visited.includes(use)) {
      visited.push(use);
      if (use.player === player && !use[USE]) use[USE] = { a: false, b: false, applied: true };
      use = ancestor(use.parent, 'useCard');
    }
  }

  const description = '你使用带有伤害标签的牌指定唯一目标时，可额外指定攻击范围内的一名其他合法角色为目标。你造成伤害后，可选择一项：①摸等同于当前体力值的牌，令你本回合接下来使用的X张牌伤害+1；②摸等同于已损失体力值的牌，令你接下来使用的X张牌无次数限制且不计入使用次数（X为本次实际摸到的牌数，同类次数相加）。然后必须选择一项：失去1点体力，再将手牌调整至体力上限减去本回合此前选择此项的次数，至少为0；或回复1点体力（若已满体力则摸两张牌），令摧锋在当前回合内失效。第一项额度在当前回合结束时清除，第二项额度保留至用完，已获得的额度不因摧锋失效而移除。';

  return {
    skills: {
      [MAIN]: {
        trigger: { player: 'useCardToPlayer' },
        direct: true,
        group: [REWARD],
        filter: mayAddTarget,
        async content(event, trigger, player) {
          const use = ancestor(trigger, 'useCard');
          if (!mayAddTarget(trigger, player)) return;
          const result = await player.chooseTarget('摧锋：是否增加一个目标？', `为${get.translation(use.card)}额外指定攻击范围内的一名其他合法角色`, (card, source, target) => usableTarget(source, use, target))
            .set('card', use.card)
            .set('ai', target => get.effect(target, use.card, player, player)).forResult();
          if (result.bool && result.targets && result.targets.length && mayAddTarget(trigger, player)) {
            const target = result.targets[0];
            if (usableTarget(player, use, target)) {
              player.logSkill(MAIN, target);
              use.targets.push(target);
            }
          }
        },
        ai: { threaten: 3 },
      },
      [REWARD]: {
        trigger: { source: 'damageSource' },
        direct: true,
        filter(event, player) {
          return event.num > 0 && !event[SEEN] && !disabled(player, event);
        },
        async content(event, trigger, player) {
          if (trigger[SEEN] || disabled(player, trigger)) return;
          trigger[SEEN] = true;
          const hp = Math.max(0, player.getHp());
          const lost = Math.max(0, player.getDamagedHp());
          const result = await player.chooseControl('选项一', '选项二', 'cancel2')
            .set('prompt', '摧锋：选择一项收益，或取消发动')
            .set('choiceList', [`摸${hp}张牌，获得本回合下X张使用牌伤害+1的额度`, `摸${lost}张牌，获得下X张使用牌无次数限制且不计次的额度`])
            .set('ai', () => hp >= lost ? 0 : 1).forResult();
          const isA = result.control === '选项一';
          if (!isA && result.control !== '选项二') return;
          player.logSkill(MAIN);
          const scope = ensureScope(player, trigger);
          const draw = player.draw(isA ? hp : lost);
          await draw;
          if (typeof player.isIn === 'function' && !player.isIn()) return;
          const x = draw.result && Array.isArray(draw.result.cards) ? draw.result.cards.length : 0;
          excludeStartedUses(player, trigger);
          if (isA) scope.a += x;
          else stateOf(player, true).b += x;
          refresh(player, trigger);
          const next = await player.chooseControl('失去体力', '回复体力')
            .set('prompt', '摧锋：必须选择一项')
            .set('choiceList', [`失去1点体力，再将手牌调整至${Math.max(0, player.maxHp - scope.adjust)}张`, '回复1点体力（已满体力则摸两张牌），摧锋在本回合内失效'])
            .set('ai', () => player.hp > 1 && player.countCards('h') < Math.max(0, player.maxHp - scope.adjust) ? 0 : 1).forResult();
          if (next.control === '回复体力') {
            scope.disabled = true;
            if (player.hp >= player.maxHp) await player.draw(2);
            else await player.recover(1);
          } else {
            const previous = scope.adjust++;
            await player.loseHp(1);
            if (typeof player.isIn === 'function' && !player.isIn()) return;
            const target = Math.max(0, player.maxHp - previous);
            const diff = target - player.countCards('h');
            if (diff > 0) await player.draw(diff);
            else if (diff < 0) await player.chooseToDiscard('h', -diff, true).set('prompt', `摧锋：将手牌调整至${target}张`).forResult();
          }
          refresh(player, trigger);
        },
      },
      [EFFECT]: {
        charlotte: true,
        forced: true,
        popup: false,
        firstDo: true,
        priority: 100,
        group: [CLEAR],
        trigger: { player: ['useCardBefore', 'useCard0'] },
        filter(event, player, name) {
          if (event[USE]) return name === 'useCard0' && !event[USE].applied && (event[USE].a || event[USE].b);
          const data = stateOf(player);
          const scope = scopeOf(player, event);
          return !!(data && data.b > 0 || scope && scope.a > 0);
        },
        async content(event, trigger, player) {
          const saved = snapshot(player, trigger);
          if (saved.b && trigger.addCount !== false) {
            trigger.addCount = false;
            // Normal useCardBefore precedes the native stat increment. This
            // fallback also supports an engine-created use starting at useCard0.
            if (event.triggername === 'useCard0') {
              const stat = player.getStat().card;
              if (stat[trigger.card.name] > 0) stat[trigger.card.name]--;
            }
          }
          if (event.triggername === 'useCard0' && !saved.applied) {
            saved.applied = true;
            if (saved.a) {
              // Native useCard copies baseDamage into EVERY card-content
              // event, including targets appended later by the source skill.
              // Native chain damage inherits the resolved amount; no damage
              // trigger adds this bonus a second time.
              if (typeof trigger.baseDamage !== 'number') trigger.baseDamage = get.info(trigger.card, false).baseDamage || 1;
              trigger.baseDamage++;
            }
          }
          refresh(player, trigger);
        },
        mod: {
          cardUsable(card, player) {
            const data = stateOf(player);
            if (data && data.b > 0) return Infinity;
            // A nested new chooseToUse must not borrow the last allowance of
            // an outer use, even when an effect reuses that same physical card.
            const context = _status.event;
            const use = context && typeof context.getParent === 'function' ? context.getParent(current => ['useCard', 'chooseToUse', 'chooseUseTarget'].includes(current.name), true, true) : null;
            if (use && use.name === 'useCard' && use.player === player && use.card === card && use[USE] && use[USE].b) return Infinity;
          },
        },
        marktext: '锋',
        intro: {
          content(storage, player) {
            const data = stateOf(player);
            const scope = scopeOf(player, _status.event);
            return `本回合下${scope ? scope.a : 0}张使用牌伤害+1；下${data ? data.b : 0}张使用牌无次数限制且不计次。`;
          },
          markcount(storage, player) {
            const data = stateOf(player);
            const scope = scopeOf(player, _status.event);
            return (scope ? scope.a : 0) + (data ? data.b : 0);
          },
        },
      },
      [CLEAR]: {
        charlotte: true,
        forced: true,
        popup: false,
        lastDo: true,
        priority: -1000,
        forceDie: true,
        trigger: { global: ['phaseAfter', 'phaseBefore'] },
        filter(event, player, name) {
          const data = stateOf(player);
          return !!(data && (name === 'phaseBefore' ? data.turns.outside : event[TURN] && data.turns[event[TURN]]));
        },
        async content(event, trigger, player) {
          if (event.triggername === 'phaseBefore') clearScope(player, 'outside', trigger);
          else if (trigger[TURN]) clearScope(player, trigger[TURN], trigger);
        },
      },
    },
    translate: {
      [MAIN]: '摧锋',
      [`${MAIN}_info`]: description,
      [REWARD]: '摧锋',
      [EFFECT]: '摧锋·余势',
      [`${EFFECT}_info`]: '已获得的摧锋额度独立保留。增伤额度限对应当前回合，无次数额度保留至耗尽。使用任意牌均各消耗一份，打出不消耗。',
      [CLEAR]: '摧锋·回合清理',
    },
    dynamicTranslate: {
      [MAIN](player) {
        return description + (disabled(player, _status.event) ? '<br><span class="bluetext">摧锋在当前回合已失效，已获得的额度仍有效。</span>' : '');
      },
    },
  };
};
    const modules = [createLiedi(lib, game, ui, get, ai, _status), createCuifeng(lib, game, ui, get, ai, _status)];
    const skills = Object.assign({}, ...modules.map(item => item.skills));
    const translate = Object.assign({}, ...modules.map(item => item.translate));
    const dynamicTranslate = Object.assign({}, ...modules.map(item => item.dynamicTranslate || {}));
    return {
        name: "谋黄忠", editable: true, connect: false,
        content: async function() {}, precontent: async function() {},
        help: {}, config: {},
        package: {
            character: {
                character: {bjgy_mouhuangzhong: ["male", "shu", 5, ["bjgy_mhz_liedi", "bjgy_mhz_cuifeng"], ["die:false", "ext:辅翼谙计/bjgy_mouhuangzhong.jpg"]]},
                translate: {bjgy_mouhuangzhong: "谋·黄忠"},
                characterIntro: {bjgy_mouhuangzhong: "原创谋黄忠。技能设计：辟境归元。蜀势力，男性，体力及体力上限5/5。包含烈镝、摧锋。"},
                dynamicTranslate: dynamicTranslate
            },
            card: {card: {}, translate: {}, list: []},
            skill: {skill: skills, translate: translate},
            intro: "谋·黄忠：蜀，男，5/5；烈镝、摧锋。依据设计者确认的伤害、额度与回合规则制作，供无名杀1.11.6实测。",
            author: "辟境归元", diskURL: "", forumURL: "", version: "0.1.0"
        },
        files: {character: ["bjgy_mouhuangzhong.jpg"], card: [], skill: [], audio: []}
    };
})(lib,game,ui,get,ai,_status),
(function(lib, game, ui, get, ai, _status) {
    "use strict";
    const createZhulan=function (lib, game, ui, get, ai, _status, api) {
  const Z = 'bjgy_mxy_zhulan';
  const G = 'bjgy_mxy_guzha';
  const OP = '_bjgy_mxy_zl_operation';
  const EXPLICIT = '_bjgy_mxy_zl_explicitRestore';
  const hooks = new WeakMap();
  const alive = player => !!player && (typeof player.isIn === 'function' ? player.isIn() : player.isAlive());
  const owns = player => alive(player) && player.hasSkill(Z);
  function state(player) {
    if (!player.storage[Z]) player.storage[Z] = { removed: [], numbers: [1, 1, 1] };
    return player.storage[Z];
  }
  function remaining(player) {
    const data = state(player);
    return [0, 1, 2].filter(index => !data.removed.includes(index));
  }
  function refresh(player) {
    player.syncStorage?.(Z);
    player.markSkill(Z);
  }
  function describe(index, number) {
    return [
      `使用装备：令一名角色随机使用牌堆或弃牌堆中的${number}张装备牌`,
      `弃置牌：令一名角色自行弃置${number}张手牌或装备牌`,
      `失去体力：令一名角色失去${number}点体力`
    ][index];
  }
  async function resultOf(event) {
    return typeof event.forResult === 'function' ? event.forResult() : (await event).result;
  }
  function equipmentCandidates(target, seen) {
    return [...ui.cardPile.childNodes, ...ui.discardPile.childNodes].filter(card =>
      !seen.has(card) && get.type(card) === 'equip' && target.canUse(card, target));
  }
  async function settle(player, cause) {
    if (!owns(player)) return false;
    const data = state(player), choices = remaining(player);
    if (!choices.length) return false;
    const labels = choices.map(index => describe(index, data.numbers[index]));
    const choice = await resultOf(player.chooseControl(labels)
      .set('prompt', '筑栏：永久删除一项，再选择一名角色执行')
      .set('ai', () => 0));
    let local = Number.isInteger(choice?.index) ? choice.index : labels.indexOf(choice?.control);
    if (local < 0 || local >= choices.length) local = 0;
    const index = choices[local];
    if (data.removed.includes(index)) return false;
    const number = data.numbers[index];
    // Commit before opening another UI or executing an effect. Even an empty
    // effect and effects recursively causing flips permanently consume the item.
    data.removed.push(index);
    for (const other of remaining(player)) data.numbers[other]++;
    refresh(player);
    if (!alive(player)) return true;
    const selected = await resultOf(player.chooseTarget('筑栏：选择执行此项的角色', true,
      (card, source, target) => alive(target))
      .set('ai', target => (index === 0 ? 1 : -1) * get.attitude(player, target)));
    if (!alive(player)) return true;
    const target = selected?.targets?.find(alive);
    if (!target) return true;
    player.logSkill(Z, target);
    if (index === 0) {
      const seen = new Set();
      for (let i = 0; i < number && alive(player) && alive(target); i++) {
        const candidates = equipmentCandidates(target, seen);
        if (!candidates.length) break;
        const card = candidates[get.rand(0, candidates.length - 1)];
        seen.add(card);
        await target.useCard(card, target);
      }
    } else if (index === 1) {
      const count = Math.min(number, target.countDiscardableCards(target, 'he'));
      if (count > 0) await target.chooseToDiscard('he', count, true);
    } else {
      await target.loseHp(number);
    }
    return true;
  }

  function finishExternal(record, player) {
    if (record.turnAsked && record.linkAsked && record.changed &&
        !player.isTurnedOver() && !player.isLinked()) record.complete = true;
  }
  function scheduleRecognizedRestore(holder, record, player) {
    if (!record.changed || record.counted || record.queued ||
        !record.turnAsked || !record.linkAsked || player.isTurnedOver() || player.isLinked()) return;
    record.queued = true;
    const next = game.createEvent('bjgy_mxy_zl_externalRestore', false);
    next.player = player;
    next.setContent(async function (event, trigger, owner) {
      if (!holder.active || record.counted || !owns(owner) ||
          owner.isTurnedOver() || owner.isLinked()) return;
      record.counted = true;
      record.complete = true;
      await settle(owner, 'externalRestore');
    });
  }
  function install(player) {
    if (hooks.has(player)) return;
    const holder = { active: true, explicitDepth: 0, contexts: new WeakMap(), fallback: {}, originals: {} };
    hooks.set(player, holder);
    for (const name of ['turnOver', 'link']) {
      const original = player[name], descriptor = Object.getOwnPropertyDescriptor(player, name);
      const wrapper = function (...args) {
        // A later plugin may retain this wrapper in its chain after removal.
        if (!holder.active || this !== player) return original.apply(this, args);
        const explicit = holder.explicitDepth > 0;
        const caller = _status.event && typeof _status.event === 'object' ? _status.event : holder.fallback;
        let record;
        if (!explicit && args[0] === false) {
          record = holder.contexts.get(caller);
          if (!record || record.complete) {
            record = { turnAsked: false, linkAsked: false, changed: false,
              counted: false, queued: false, complete: false };
            holder.contexts.set(caller, record);
          }
          if (name === 'turnOver') record.turnAsked = true;
          else record.linkAsked = true;
        }
        const next = original.apply(this, args);
        if (next && typeof next === 'object') {
          if (explicit) next[EXPLICIT] = holder.explicitToken;
          else if (record) next[OP] = { record, name };
        }
        // In reverse serial order, link(false) may already have finished and
        // turnOver(false) is a no-op, so no further native After event will run.
        if (record) scheduleRecognizedRestore(holder, record, player);
        return next;
      };
      holder.originals[name] = { original, descriptor, wrapper };
      Object.defineProperty(player, name, { configurable: true, enumerable: descriptor?.enumerable ?? false,
        writable: true, value: wrapper });
    }
  }
  function uninstall(player) {
    const holder = hooks.get(player);
    if (!holder) return;
    holder.active = false;
    for (const [name, info] of Object.entries(holder.originals)) {
      if (player[name] !== info.wrapper) continue;
      if (info.descriptor) Object.defineProperty(player, name, info.descriptor);
      else delete player[name];
    }
    hooks.delete(player);
  }

  api.restore = async function (player, cause) {
    if (!alive(player)) return false;
    const changed = player.isTurnedOver() || player.isLinked();
    if (!changed) return false;
    if (player.hasSkill(Z)) install(player);
    const holder = hooks.get(player);
    const token = { turnChanged: false };
    const operation = name => {
      const previous = holder?.explicitToken;
      if (holder) holder.explicitDepth++;
      if (holder) holder.explicitToken = token;
      try { return player[name](false); }
      finally {
        if (holder) { holder.explicitDepth--; holder.explicitToken = previous; }
      }
    };
    // Only these two method calls belong to this restoration. Their nested
    // triggers may cause other genuine flips, which retain their own timing.
    await operation('turnOver');
    await operation('link');
    if (!player.isTurnedOver() && !player.isLinked()) await settle(player, cause || 'restore');
    else if (token.turnChanged) await settle(player, 'interruptedRestoreFlip');
    return true;
  };
  api.isAwakened = player => !!player.storage[G];
  api.checkAwaken = async function (player, cause) {
    if (!alive(player) || !player.hasSkill(G) || api.isAwakened(player) || remaining(player).length) return false;
    // Mark first: restore and any skill it invokes cannot re-enter awakening.
    player.storage[G] = true;
    player.syncStorage?.(G);
    player.awakenSkill(G);
    player.logSkill(G);
    await api.restore(player, cause || G);
    if (alive(player)) player.addSkill('bjgy_mxy_minfeng');
    return true;
  };

  function cannotRespond(player) {
    if (!player.isTurnedOver()) return false;
    let event = _status.event;
    const visited = new Set();
    while (event && !visited.has(event)) {
      visited.add(event);
      if (event.respondTo) {
        return event.respondTo[0] !== player && get.name(event.respondTo[1]) === 'sha';
      }
      event = typeof event.getParent === 'function' ? event.getParent() : event.parent;
    }
    return false;
  }
  const skills = {
    [Z]: {
      audio: false, forced: true, locked: true, mark: true, marktext: '栏',
      init(player) { state(player); install(player); },
      onremove(player) { uninstall(player); },
      group: ['bjgy_mxy_zl_turn', 'bjgy_mxy_zl_link'],
      trigger: { target: 'useCardToTargeted' },
      filter(event, player) {
        return alive(player) && (player.isTurnedOver() || player.isLinked()) &&
          event.player !== player && event.targets?.length === 1 && event.targets[0] === player &&
          !!get.tag(event.card, 'damage') && event.player.inRange(player);
      },
      async content(event, trigger, player) { await api.restore(player, 'singleDamageTarget'); },
      mod: {
        cardEnabled(card, player) { if (cannotRespond(player)) return false; },
        cardRespondable(card, player) { if (cannotRespond(player)) return false; }
      },
      intro: {
        content(storage, player) {
          const data = state(player);
          return remaining(player).map(index => describe(index, data.numbers[index])).join('<br>') || '三项均已删除';
        }
      },
      ai: { threaten: 1.4 }
    },
    bjgy_mxy_zl_turn: {
      audio: false, forced: true, popup: false, charlotte: true,
      trigger: { player: 'turnOverAfter' },
      filter(event, player) { return owns(player) && remaining(player).length > 0; },
      async content(event, trigger, player) {
        if (trigger[EXPLICIT]) { trigger[EXPLICIT].turnChanged = true; return; }
        const operation = trigger[OP];
        if (operation) {
          operation.record.changed = true;
          operation.record.counted = true;
          finishExternal(operation.record, player);
        }
        await settle(player, 'turnOver');
      }
    },
    bjgy_mxy_zl_link: {
      audio: false, forced: true, popup: false, charlotte: true,
      trigger: { player: 'linkAfter' },
      filter(event, player) {
        return owns(player) && !event[EXPLICIT] && !!event[OP];
      },
      async content(event, trigger, player) {
        const record = trigger[OP].record;
        record.changed = true;
        finishExternal(record, player);
        if (record.complete && !record.counted) {
          record.counted = true;
          await settle(player, 'externalRestore');
        }
      }
    },
    [G]: {
      audio: false, forced: true, juexingji: true, skillAnimation: true,
      animationColor: 'water', trigger: { global: 'phaseEnd' }, priority: -50,
      filter(event, player) { return !api.isAwakened(player); },
      async content(event, trigger, player) { await api.checkAwaken(player, 'phaseEnd'); },
      derivation: 'bjgy_mxy_minfeng', ai: { combo: Z }
    }
  };
  const translate = {
    [Z]: '筑栏',
    [Z + '_info']: '锁定技，若你背面朝上，你不能响应其他角色使用的【杀】；当你成为其他角色使用的伤害牌的唯一目标后，若你在其攻击范围内，你复原。当你翻面或复原后，选择并永久删除一项，令一名角色执行：①随机使用牌堆或弃牌堆中的一张装备牌；②自行弃置一张手牌或装备牌；③失去1点体力。每删除一项，其余项的数值均加1。',
    bjgy_mxy_zl_turn: '筑栏', bjgy_mxy_zl_link: '筑栏',
    [G]: '孤栅',
    [G + '_info']: '觉醒技，每名角色的回合结束时，若“筑栏”的三项均已删除，你复原并获得“愍锋”，且此后“分援”只能令你获得“驰”。'
  };
  const dynamicTranslate = {
    [Z](player) {
      const data = state(player);
      const items = [0, 1, 2].map(index => {
        const item = `${['①', '②', '③'][index]}${describe(index, data.numbers[index])}`;
        return data.removed.includes(index) ? `<span style="text-decoration:line-through;opacity:0.5">${item}</span>` : item;
      }).join('；');
      return '锁定技，若你背面朝上，你不能响应其他角色使用的【杀】；当你成为其他角色使用的伤害牌的唯一目标后，若你在其攻击范围内，你复原。当你翻面或复原后，选择并永久删除一项，令一名角色执行：' + items + '。每删除一项，其余项的数值均加1。';
    }
  };
  return { skills, translate, dynamicTranslate };
};
    const createFenyuan=function (lib, game, ui, get, ai, _status, api) {
  const FY = "bjgy_mxy_fenyuan";
  const CHI = "bjgy_mxy_chi";
  const PHASE = "bjgy_mxy_fy_phase";
  const SKIP = "bjgy_mxy_fy_skip";
  const END = "bjgy_mxy_fy_end";
  const PHASES = ["phaseZhunbei", "phaseJudge", "phaseDraw", "phaseUse", "phaseDiscard", "phaseJieshu"];
  const LABELS = ["准备阶段", "判定阶段", "摸牌阶段", "出牌阶段", "弃牌阶段", "结束阶段"];
  const turns = new WeakMap();
  const playerTurns = new WeakMap();
  const chiCard = { name: "sha", isCard: true, storage: { [CHI]: true } };

  api.isChiCard = card => !!card && card.name === "sha" && card.storage?.[CHI] === true;

  function isIn(player) {
    return !!player && typeof player.isIn === "function" && player.isIn();
  }

  function maximum(player) {
    return Math.max(0, Math.min(6, Math.floor(Number(player.maxHp) || 0)));
  }

  function selectedPhases(list, player) {
    return [...new Set(Array.isArray(list) ? list : [])].filter(name => PHASES.includes(name)).slice(0, maximum(player));
  }

  function actualTurn(event) {
    if (!event) return null;
    if (event.name === "phase") return event;
    return typeof event.getParent === "function" ? event.getParent("phase", true, true) : null;
  }

  function turnState(event, player) {
    const turn = actualTurn(event);
    const state = turn && turns.get(turn);
    return state?.player === player ? state : null;
  }

  function phaseName(entry) {
    if (typeof entry !== "string") return null;
    const name = entry.split("|")[0].split("-")[0];
    return name.startsWith("skip") ? `phase${name.slice(4)}` : name;
  }

  function clearTurn(turn) {
    const state = turns.get(turn);
    if (!state) return null;
    turns.delete(turn);
    state.pending.clear();
    const owned = playerTurns.get(state.player);
    owned?.delete(turn);
    if (!owned?.size) {
      playerTurns.delete(state.player);
      for (const name of [PHASE, SKIP, END]) state.player.removeSkill(name);
    }
    return state;
  }

  function currentChiContext(player) {
    const event = typeof get.event === "function" ? get.event() : _status.event;
    if (!event) return null;
    const context = event.name === "chooseToUse" || event.name === "chooseToRespond" ? event :
      typeof event.getParent === "function" ? event.getParent(evt => evt.name === "chooseToUse" || evt.name === "chooseToRespond", true, true) : null;
    // hasSha can be queried for another character before their own chooser is
    // created (Borrowed Sword). Do not apply the original user's card filter.
    return context && (!context.player || context.player === player) ? context : null;
  }

  function canUseChi(event, player) {
    if (player.countMark(CHI) < 1) return false;
    if (event?.name === "chooseToRespond") {
      if (lib.filter.cardRespondable(chiCard, player, event) === false) return false;
    } else if (lib.filter.cardEnabled(chiCard, player, event || "forceEnable") === false) {
      return false;
    }
    return !event || typeof event.filterCard !== "function" || event.filterCard(chiCard, player, event) !== false;
  }

  const skills = {
    [FY]: {
      trigger: { player: "phaseBegin" },
      popup: false,
      filter(event, player) {
        return isIn(player) && maximum(player) > 0 && !turns.has(actualTurn(event));
      },
      async cost(event, trigger, player) {
        const result = await player
          .chooseButton(["分援：选择要跳过的阶段（不选视为取消）", [PHASES.map((name, i) => [name, LABELS[i]]), "textbutton"]], [0, maximum(player)])
          .set("ai", button => ["phaseJudge", "phaseDiscard", "phaseJieshu"].includes(button.link) ? 1 : 0)
          .forResult();
        const phases = result?.bool ? selectedPhases(result.links, player) : [];
        event.result = { bool: phases.length > 0, cost_data: phases };
      },
      async content(event, trigger, player) {
        const turn = actualTurn(trigger);
        const phases = selectedPhases(event.cost_data, player);
        if (!turn || !phases.length || !isIn(player) || turns.has(turn)) return;
        const allocation = new Map();
        if (api.isAwakened(player)) {
          allocation.set(player, phases.length);
        } else {
          for (let index = 0; index < phases.length; index++) {
            const given = [...allocation].map(([target, count]) => `${get.translation(target)}${count}枚`).join("、");
            const result = await player
              .chooseTarget(true, `分援：将第${index + 1}/${phases.length}枚“驰”交给一名角色${given ? `（已分配：${given}）` : ""}`, (card, source, target) => isIn(target))
              .set("ai", target => get.attitude(player, target))
              .forResult();
            const target = result?.targets?.[0];
            // This is a forced selection. Guard malformed/custom UI results without
            // silently granting fewer marks than the number of selected stages.
            if (!result?.bool || !isIn(target)) return;
            allocation.set(target, (allocation.get(target) || 0) + 1);
          }
        }
        const state = { player, pending: new Set(phases), allocation, flip: [...allocation.values()].some(count => count >= 2) };
        turns.set(turn, state);
        if (!playerTurns.has(player)) playerTurns.set(player, new Set());
        playerTurns.get(player).add(turn);
        for (const name of [PHASE, SKIP, END]) player.addSkill(name);
        // Keep the cleanup on the actual turn's after queue, including turns that
        // are finished early without a normal phaseEnd notification.
        turn.insertAfter(async function () {
          clearTurn(turn);
        }, {});
        player.logSkill(FY, [...allocation.keys()]);
        for (const [target, count] of allocation) {
          target.addSkill(CHI);
          target.addMark(CHI, count);
        }
        game.log(player, "本回合跳过", "#y" + phases.map(name => LABELS[PHASES.indexOf(name)]).join("、"));
      },
      ai: { threaten: 2 },
    },

    [PHASE]: {
      charlotte: true,
      forced: true,
      popup: false,
      lastDo: true,
      priority: -100000,
      trigger: { player: "phaseChange" },
      filter(event, player) {
        const state = turnState(event, player);
        return !!state && state.pending.has(phaseName(event.phaseList?.[event.num]));
      },
      async content(event, trigger, player) {
        const state = turnState(trigger, player);
        const entry = trigger.phaseList?.[trigger.num];
        const name = phaseName(entry);
        if (!state?.pending.has(name)) return;
        state.pending.delete(name);
        // The phase list belongs to this turn. Never add/remove skipList entries,
        // so another source's unconsumed skip cannot be deleted by our cleanup.
        if (!entry.startsWith("skip")) {
          trigger.phaseList = trigger.phaseList.slice();
          trigger.phaseList[trigger.num] = `skip${entry.slice(5)}`;
        }
      },
    },

    [SKIP]: {
      charlotte: true,
      forced: true,
      popup: false,
      firstDo: true,
      priority: 100000,
      trigger: { player: PHASES.flatMap(name => [`${name}Before`, `${name}Skipped`]) },
      filter(event, player) {
        return !!turnState(event, player)?.pending.has(event.name);
      },
      async content(event, trigger, player) {
        const state = turnState(trigger, player);
        if (!state?.pending.has(trigger.name)) return;
        state.pending.delete(trigger.name);
        if (event.triggername?.endsWith("Skipped")) return;
        // A skill can directly insert a phase before its normal phaseList slot.
        // Native cancel records skipped history and stops the rest of Before.
        // Do not await checkSkipped()/trigger() on this ancestor: its waitNext
        // queue is currently waiting for this very skill to finish.
        trigger.cancel();
      },
    },

    [END]: {
      charlotte: true,
      forced: true,
      popup: false,
      firstDo: true,
      priority: 100000,
      trigger: { player: "phaseEnd" },
      filter(event, player) {
        return !!turnState(event, player);
      },
      async content(event, trigger, player) {
        const state = clearTurn(actualTurn(trigger));
        if (!state || !isIn(player)) return;
        if (state.flip) await player.turnOver();
        // Awaiting the native turnOver event also completes its nested zhulan
        // settlement. Its last deletion can therefore awaken guzha this phaseEnd.
        await api.checkAwaken(player, { skill: FY, event: trigger, reason: "phaseEnd" });
      },
    },

    [CHI]: {
      charlotte: true,
      enable: ["chooseToUse", "chooseToRespond"],
      mark: true,
      marktext: "驰",
      intro: { name: "驰", name2: "驰", content: "mark" },
      filter: canUseChi,
      viewAs: chiCard,
      filterCard: () => false,
      selectCard: -1,
      viewAsFilter(player) {
        return player.countMark(CHI) > 0;
      },
      hiddenCard(player, name) {
        return name === "sha" && canUseChi(currentChiContext(player), player);
      },
      prompt: "移去1枚“驰”，视为使用或打出一张普通【杀】（使用时无距离、次数限制且不计次）",
      async precontent(event, trigger, player) {
        if (event.bjgy_mxy_fy_chiCommitted) return;
        const original = event.getParent();
        if (!event.result?.bool || !canUseChi(original, player)) {
          if (event.result) event.result.bool = false;
          return;
        }
        event.bjgy_mxy_fy_chiCommitted = true;
        player.removeMark(CHI, 1);
        if (event.result.card) {
          event.result.card.storage ??= {};
          event.result.card.storage[CHI] = true;
        }
        if (original.name === "chooseToUse") original.addCount = false;
        player.logSkill(CHI);
      },
      mod: {
        targetInRange(card) {
          if (api.isChiCard(card)) return true;
        },
        cardUsable(card) {
          if (api.isChiCard(card)) return Infinity;
        },
      },
      ai: {
        respondSha: true,
        freeSha: true,
        skillTagFilter(player) {
          return canUseChi(currentChiContext(player), player);
        },
        order(item, player) {
          return get.order({ name: "sha" }, player) + 0.1;
        },
        result: { player: 1 },
      },
    },
  };

  const baseInfo = "回合开始时，你可以选择至多体力上限个不同的常规阶段，令任意存活角色获得共计等量的“驰”，然后本回合你跳过这些阶段各一次。若有角色本次获得不少于两枚“驰”，本回合结束时你翻面一次。“驰”无数量上限及期限，拥有者需要使用或打出【杀】时，可以移去一枚“驰”，视为使用或打出一张普通【杀】，以此法使用的【杀】无距离和次数限制且不计入使用次数。";
  const translate = {
    [FY]: "分援",
    [`${FY}_info`]: baseInfo,
    [CHI]: "驰",
    [`${CHI}_info`]: "你需要使用或打出【杀】时，可以移去一枚“驰”，视为使用或打出一张普通【杀】；以此法使用的【杀】无距离和次数限制且不计次。“驰”不限数量与期限，其使用权不受分援来源存亡、失技或觉醒影响。",
    [PHASE]: "分援·阶段",
    [SKIP]: "分援·跳过",
    [END]: "分援·回合末",
  };
  const dynamicTranslate = {
    [FY](player) {
      return api.isAwakened(player) ? baseInfo.replace("令任意存活角色获得", "仅令自己获得") : baseInfo;
    },
  };
  return { skills, translate, dynamicTranslate };
};
    const createMinfeng=function createMinfeng(lib, game, ui, get, ai, _status, api) {
  const MAIN='bjgy_mxy_minfeng', EFFECT='bjgy_mxy_mf_effect', LATE='bjgy_mxy_mf_late', USE='_bjgy_mxy_mf';
  const active=new WeakMap();
  function stageOf(event) {
    if (!event) return null;
    return event.name==='phaseUse' ? event : event.getParent?.('phaseUse',true,true) || null;
  }
  function hasStage(player,event) { const stage=stageOf(event); return !!stage && active.get(player)?.has(stage); }
  function unlimited(use,player) {
    if (use.addCount===false || api.isChiCard?.(use.card)) return true;
    const info=get.info(use.card);
    if (!info) return false;
    let limit=info.usable;
    if (typeof limit==='function') limit=limit(use.card,player);
    limit=game.checkMod(use.card,player,limit,'cardUsable',player);
    return typeof limit==='number' ? limit===Infinity : limit!==false;
  }
  function clear(player,stage) {
    const stages=active.get(player);
    if (!stages) return;
    stages.delete(stage);
    if (!stages.size) { active.delete(player); player.removeSkill(EFFECT); }
  }
  function applyDamage(use,player) {
    const saved=use[USE] || (use[USE]={eligible:false,applied:false});
    if (saved.applied) return;
    saved.eligible ||= unlimited(use,player);
    if (!saved.eligible) return;
    saved.applied=true;
    if (typeof use.baseDamage!=='number') use.baseDamage=get.info(use.card).baseDamage || 1;
    use.baseDamage++;
  }
  const description='限定技，出牌阶段，你可以摸体力上限张牌，然后失去当前所有体力。本阶段你使用无次数限制或不计次的【杀】时，此牌伤害+1。包括驰、诸葛连弩、咆哮及其他技能的无限制杀；只增加有限次数不算。';
  return {
    skills:{
      [MAIN]:{
        name:'愍锋',enable:'phaseUse',limited:true,skillAnimation:true,animationColor:'thunder',
        filter(event,player) { const stage=stageOf(event); return !player.storage[MAIN] && !!stage && stage.player===player; },
        async content(event,trigger,player) {
          if (player.storage[MAIN]) return;
          const stage=stageOf(event) || stageOf(_status.event);
          if (!stage || stage.player!==player) return;
          player.storage[MAIN]=true;
          player.awakenSkill(MAIN);
          let stages=active.get(player);
          if (!stages) active.set(player,stages=new Set());
          stages.add(stage);
          player.addSkill(EFFECT);
          const cleanup=game.createEvent('bjgy_mxy_mf_cleanup',false);
          const parent=cleanup.getParent?.() || _status.event;
          const index=parent?.next?.indexOf(cleanup);
          if (index>=0) parent.next.splice(index,1);
          cleanup.player=player; cleanup.forceDie=true; cleanup.includeOut=true; cleanup.bjgyMxyStage=stage;
          cleanup.setContent(async function(event,trigger,player) { clear(player,event.bjgyMxyStage); });
          stage.after.push(cleanup);
          const count=Math.max(0,Math.floor(Number(player.maxHp)||0));
          if (count>0) await player.draw(count);
          if (!player.isIn()) return;
          const hp=Math.max(0,player.getHp());
          if (hp>0) await player.loseHp(hp);
        },
        ai:{order:8,result:{player(player) { return player.hp>1 ? -1 : 1; }}},
      },
      [EFFECT]:{
        charlotte:true,forced:true,popup:false,firstDo:true,priority:-100,
        group:[LATE],
        trigger:{player:['useCardBefore','useCard0']},
        filter(event,player,name) {
          if (!event.card || get.name(event.card,player)!=='sha' || !hasStage(player,event)) return false;
          return name==='useCardBefore' || !event[USE]?.applied;
        },
        async content(event,trigger,player) {
          if (!trigger.card || get.name(trigger.card,player)!=='sha' || !hasStage(player,trigger)) return;
          const saved=trigger[USE] || (trigger[USE]={eligible:unlimited(trigger,player),applied:false});
          if (event.triggername==='useCard0') applyDamage(trigger,player);
        },
        mark:true,marktext:'愍',intro:{content:'本次出牌阶段，使用无限次数或不计次的杀时伤害+1。普通或仅有限额外次数的杀不享有此效果。'},
        onremove(player) { active.delete(player); },
      },
      [LATE]:{
        charlotte:true,forced:true,popup:false,lastDo:true,priority:-10000,
        trigger:{player:['useCard1','useCard2','useCard']},
        filter(event,player) {
          // Other skills may grant addCount=false later in this same timing.
          // Do not pre-filter by eligibility before their content resolves.
          return !!event.card && get.name(event.card,player)==='sha' && hasStage(player,event) && !event[USE]?.applied;
        },
        async content(event,trigger,player) { applyDamage(trigger,player); },
      },
    },
    translate:{[MAIN]:'愍锋',[MAIN+'_info']:description,[EFFECT]:'愍锋',[LATE]:'愍锋'},
    dynamicTranslate:{},
  };
};
    const api={};
    const modules=[createZhulan(lib,game,ui,get,ai,_status,api),createFenyuan(lib,game,ui,get,ai,_status,api),createMinfeng(lib,game,ui,get,ai,_status,api)];
    const skills=Object.assign({},...modules.map(item=>item.skills));
    const translate=Object.assign({},...modules.map(item=>item.translate));
    const dynamicTranslate=Object.assign({},...modules.map(item=>item.dynamicTranslate || {}));
    return {
        name:"谋夏侯渊",editable:true,connect:false,
        content:async function(){},precontent:async function(){},help:{},config:{},
        package:{
            character:{
                character:{bjgy_mouxiahouyuan:["male","wei",4,["bjgy_mxy_fenyuan","bjgy_mxy_zhulan","bjgy_mxy_guzha"],["die:false","ext:辅翼谙计/bjgy_mouxiahouyuan.jpg"]]},
                translate:{bjgy_mouxiahouyuan:"谋夏侯渊"},
                characterIntro:{bjgy_mouxiahouyuan:"原创谋夏侯渊。技能设计：辟境归元。魏势力，男性，体力及体力上限4/4。分援、筑栏、孤栅，觉醒后获得愍锋。"},
                dynamicTranslate:dynamicTranslate
            },
            card:{card:{},translate:{},list:[]},
            skill:{skill:skills,translate:translate},
            intro:"谋夏侯渊：魏、男、4/4。分援、筑栏、孤栅及衍生愍锋，依据设计者确认的结算制作，适配无名杀1.11.6供实测。",
            author:"辟境归元",diskURL:"",forumURL:"",version:"0.1.0"
        },
        files:{character:["bjgy_mouxiahouyuan.jpg"],card:[],skill:[],audio:[]}
    };
})(lib,game,ui,get,ai,_status),
(function(lib, game, ui, get, ai, _status) {
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
                character:{bjgy_mouzhaoyun:["male","shu",4,["bjgy_mzy_kongying","bjgy_mzy_zhishe","bjgy_mzy_guju"],["die:false","ext:辅翼谙计/bjgy_mouzhaoyun.jpg"]]},
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
})(lib,game,ui,get,ai,_status)];
 const merge=(objects)=>{
  const result={};
  for(const object of objects)for(const [key,value] of Object.entries(object||{})){
   if(Object.prototype.hasOwnProperty.call(result,key))throw new Error('辅翼谙计：重复登记 '+key);
   result[key]=value;
  }
  return result;
 };
 const character={};
 for(const key of ['character','translate','characterIntro','characterSubstitute','dynamicTranslate'])
  character[key]=merge(parts.map(part=>part.package.character[key]));
 const skills=merge(parts.map(part=>part.package.skill.skill));
 const translate=merge(parts.map(part=>part.package.skill.translate));
 const portraits=parts.flatMap(part=>part.files.character);
 return {
  name:'辅翼谙计',editable:true,connect:false,
  async content(...args){for(const part of parts)if(part.content)await part.content.apply(this,args);},
  async precontent(...args){for(const part of parts)if(part.precontent)await part.precontent.apply(this,args);},
  help:{},config:{},
  package:{character,card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'谋法正、谋黄忠、谋夏侯渊、谋赵云四将合包。保留法正双形态与赵云最新修复，面向无名杀1.11.6。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'1.0.0'},
  files:{character:portraits,card:[],skill:[],audio:[]}
 };
});
