// 谋夏侯渊 v0.1.0 测试版。设计：辟境归元；代码与打包：OpenAI Codex协助。
// 原创实现见LICENSE；参考本体接口适用各自原有许可。
game.import("extension", function(lib, game, ui, get, ai, _status) {
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
                character:{bjgy_mouxiahouyuan:["male","wei",4,["bjgy_mxy_fenyuan","bjgy_mxy_zhulan","bjgy_mxy_guzha"],["die:false","ext:谋夏侯渊/bjgy_mouxiahouyuan.jpg"]]},
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
});
