// 武张辽 v0.1.0 测试版。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助。
// 原创代码MIT；设计文字和GPT原画分别署名，见README与LICENSE。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function slotsModule(lib, game, ui, get, ai, _status, api) {
  const recordSkill = "bjgy_wuzhangliao_slot_record";
  const stageSkill = "bjgy_wuzhangliao_slot_stage";
  const clockSkill = "bjgy_wuzhangliao_slot_clock";
  const storageKey = "bjgy_wuzhangliao_temporary_slots";
  const temporaryKey = "_bjgy_wuzhangliao_temporary_slot";
  const expiryKey = "_bjgy_wuzhangliao_expiry_slot";
  const turnKey = "_bjgy_wuzhangliao_actual_turn";
  const openDisables = new WeakMap();
  const restorationBefore = new WeakMap();
  const completedTurns = new WeakSet();
  const queuedTurns = new WeakSet();
  let nextRecord = 0;
  let nextTurn = 0;
  let installed = false;

  function canonical(type) {
    if (typeof type === "number") type = "equip" + type;
    const combined = get.is.mountCombined();
    if (combined && (type === "equip4" || type === "equip3_4" || type === "horse")) return "equip3";
    return /^equip[1-5]$/.test(type) ? type : null;
  }

  function slotCount(player, type, enabled = false) {
    if (!player) return 0;
    const value = enabled ? player.countEnabledSlot(type) : player.countDisabledSlot(type);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function types(player, enabled = false) {
    const result = [];
    for (let i = 1; i <= 5; i++) {
      if (i === 4 && get.is.mountCombined()) continue;
      const type = "equip" + i;
      // Native countEnabledSlot("equip3_4") starts from a phantom base slot.
      // Always inspect its real equip3 storage key, including expanded slots.
      if (slotCount(player, type, enabled)) result.push(type);
    }
    return result;
  }

  function count(player) {
    return types(player).reduce((total, type) => total + slotCount(player, type), 0);
  }

  function countAll() {
    return game.players.reduce((total, player) => total + (player.isIn() ? count(player) : 0), 0);
  }

  function records(player) {
    player.storage ??= {};
    if (!Array.isArray(player.storage[storageKey])) player.storage[storageKey] = [];
    return player.storage[storageKey];
  }

  function snapshot(player) {
    const result = {};
    for (const type of ["equip1", "equip2", "equip3", "equip4", "equip5"]) {
      result[type] = slotCount(player, type);
    }
    return result;
  }

  function forget(player, id) {
    const entries = records(player);
    const index = entries.findIndex(record => record.id === id);
    if (index !== -1) entries.splice(index, 1);
  }

  function noticeContribution(event) {
    const marker = event[temporaryKey];
    if (!marker || marker.applied || !marker.before) return;
    if (slotCount(event.player, marker.type) <= marker.before[marker.type]) return;
    marker.applied = true;
    records(event.player).push({ id: marker.id, type: marker.type, turn: null });
  }

  function noticeOpenContributions(player) {
    const events = openDisables.get(player);
    if (events) for (const event of events) noticeContribution(event);
  }

  function observeBefore(event) {
    const player = event.player;
    // disableEquip may await the loss of equipment before its After hook.
    // Attribute its already-mutated share before any nested restoration.
    noticeOpenContributions(player);
    if (event.name === "disableEquip") {
      const marker = event[temporaryKey];
      if (!marker) return;
      marker.before = snapshot(player);
    } else {
      restorationBefore.set(event, snapshot(player));
    }
  }

  function observeContentStart(event) {
    const player = event.player;
    noticeOpenContributions(player);
    if (event.name === "disableEquip") {
      const marker = event[temporaryKey];
      if (!marker) return;
      marker.before = snapshot(player);
      let pending = openDisables.get(player);
      if (!pending) openDisables.set(player, pending = new Set());
      pending.add(event);
    } else {
      // Other skills may create or restore slots during Before / Begin.
      // The last Begin observer measures the content's own real decrement.
      const expiryId = event[expiryKey];
      if (expiryId != null && !records(player).some(record => record.id === expiryId)) {
        // A nested restoration may already have paid this exact debt. The
        // queued deadline cannot restore a subsequently disabled new share.
        event.slots = [];
      }
      restorationBefore.set(event, snapshot(player));
    }
  }

  function observeAfter(event) {
    const player = event.player;
    if (event.name === "disableEquip") {
      noticeContribution(event);
      openDisables.get(player)?.delete(event);
      return;
    }
    const before = restorationBefore.get(event);
    if (!before) return;
    restorationBefore.delete(event);
    for (const type of Object.keys(before)) {
      let restored = Math.max(0, before[type] - slotCount(player, type));
      if (!restored) continue;
      const expiryId = event[expiryKey];
      if (expiryId != null) {
        // A deadline owns one exact share. It must never cancel a different
        // temporary share whose next actual turn has not finished yet.
        const entry = records(player).find(record => record.id === expiryId && record.type === type);
        if (entry) forget(player, entry.id);
      } else {
        for (const record of records(player).slice()) {
          if (!restored) break;
          if (record.type !== type) continue;
          forget(player, record.id);
          restored--;
        }
      }
    }
  }

  function install() {
    if (installed) return;
    // Registered globally, with no owner and no onremove cleanup: death or
    // loss of the source's general skills cannot revoke another turn's debt.
    game.addGlobalSkill(recordSkill);
    game.addGlobalSkill(stageSkill);
    game.addGlobalSkill(clockSkill);
    installed = true;
  }

  async function disableTemporary(target, rawType) {
    install();
    const type = canonical(rawType);
    if (!type || !slotCount(target, type, true)) return false;
    const event = target.disableEquip(type);
    const marker = { id: ++nextRecord, type, applied: false };
    event[temporaryKey] = marker;
    await event;
    return marker.applied;
  }

  async function restoreOne(player) {
    install();
    const choices = types(player);
    if (!choices.length) return false;
    let type = choices[0];
    if (choices.length > 1) {
      const result = await player.chooseControl(choices)
        .set("prompt", "整锋：恢复你的一个装备栏")
        .set("ai", () => 0)
        .forResult();
      if (!choices.includes(result.control)) return false;
      type = result.control;
    }
    const before = slotCount(player, type);
    if (!before) return false;
    await player.enableEquip(type);
    return slotCount(player, type) < before;
  }

  async function expireTurn(phase, player) {
    const turn = phase[turnKey];
    if (turn == null) return; // Turned-over / omitted phases never began.
    if (completedTurns.has(phase)) return;
    completedTurns.add(phase);
    for (const record of records(player).slice()) {
      if (record.turn !== turn || !records(player).some(entry => entry.id === record.id)) continue;
      if (!slotCount(player, record.type)) {
        forget(player, record.id);
        continue;
      }
      const restore = player.enableEquip(record.type);
      restore[expiryKey] = record.id;
      await restore;
      // A skill can cancel an equipment event. Keep the obligation until the
      // next actual turn if its own restoration never happened.
      const remaining = records(player).find(entry => entry.id === record.id);
      if (remaining) remaining.turn = null;
    }
  }

  function queueTurnExpiry(phase, player) {
    // A phase cancelled with notrigger=true emits no phaseCancelled or
    // phaseAfter. Native GameEvent still drains its real after queue.
    if (!Array.isArray(phase.after) || queuedTurns.has(phase)) return;
    queuedTurns.add(phase);
    const expiry = game.createEvent("bjgy_wuzhangliao_slot_expiry", false, phase);
    expiry.player = player;
    expiry.forceDie = true;
    expiry._bjgy_wuzhangliao_slot_phase = phase;
    expiry.setContent(async function(event) {
      await expireTurn(event._bjgy_wuzhangliao_slot_phase, event.player);
    });
    // createEvent initially enqueues on phase.next. Move it, and never await
    // this ancestor-owned after event while its phase is still executing.
    const index = Array.isArray(phase.next) ? phase.next.indexOf(expiry) : -1;
    if (index !== -1) phase.next.splice(index, 1);
    phase.after.push(expiry);
  }

  async function updateClock(event, trigger, player) {
    if (event.triggername === "phaseBegin") {
      trigger[turnKey] ??= ++nextTurn;
      for (const record of records(player)) {
        if (record.turn == null) record.turn = trigger[turnKey];
      }
      if (records(player).some(record => record.turn === trigger[turnKey])) queueTurnExpiry(trigger, player);
      return;
    }
    await expireTurn(trigger, player);
  }

  api.slots = { count, countAll, types, disableTemporary, restoreOne, install };
  return {
    skills: {
      [recordSkill]: {
        charlotte: true, forced: true, popup: false, silent: true,
        forceDie: true, forceOut: true, firstDo: true, priority: 1000000,
        trigger: { player: ["disableEquipBefore", "disableEquipAfter", "enableEquipBefore", "enableEquipAfter"] },
        async content(event, trigger, player) {
          if (event.triggername.endsWith("Before")) observeBefore(trigger);
          else observeAfter(trigger);
        },
      },
      [clockSkill]: {
        charlotte: true, forced: true, popup: false, silent: true,
        forceDie: true, forceOut: true, firstDo: true, priority: 1000000,
        trigger: { player: ["phaseBegin", "phaseAfter", "phaseCancelled", "phaseSkipped"] },
        async content(event, trigger, player) {
          await updateClock(event, trigger, player);
        },
      },
      [stageSkill]: {
        charlotte: true, forced: true, popup: false, silent: true,
        forceDie: true, forceOut: true, lastDo: true, priority: -1000000,
        trigger: { player: ["disableEquipBegin", "enableEquipBegin"] },
        async content(event, trigger, player) {
          observeContentStart(trigger);
        },
      },
    },
    translate: {},
    async content() { install(); },
  };
},
function combatModule(lib, game, ui, get, ai, _status, api) {
  const weixi = "bjgy_wuzhangliao_weixi";
  const zhengfeng = "bjgy_wuzhangliao_zhengfeng";
  const recorder = "bjgy_wuzhangliao_card_record";
  const snapshots = new WeakMap();
  const attempted = new WeakSet();
  const rewarded = new WeakSet();
  const openDisables = new WeakMap();
  let installed = false;

  function active(player, skill) {
    // Native hasSkill uses getSkills' normal disabled/blocker filtering.
    return !!player?.hasSkill(skill);
  }

  function inPlay(player) {
    return !!player?.isIn();
  }

  function parentOf(event) {
    return event?.parent || event?.getParent?.() || null;
  }

  function ownHand(card, player) {
    return get.owner(card) === player && get.position(card) === "h";
  }

  function snapshot(use, player = use.player) {
    const saved = snapshots.get(use);
    if (saved) return saved;
    // use.cards is authoritative: a zero-material virtual use must not borrow
    // an unrelated card from viewAs metadata.
    const materials = Array.isArray(use.cards) ? use.cards.slice() :
      (Array.isArray(use.card?.cards) ? use.card.cards.slice() : []);
    const handCards = materials.filter(card => ownHand(card, player));
    let number = get.number(use.card, false);
    const disabled = api.slots.count(player);
    if (active(player, zhengfeng) && disabled > 0 && materials.length === 1 && handCards.length === 1) {
      number = disabled;
    }
    if (typeof number !== "number") number = null;
    const savedUse = Object.freeze({ player, number, fromHand: handCards.length > 0, materials: Object.freeze(materials) });
    snapshots.set(use, savedUse);
    // Player.useCard already created an event-local VCard through autoViewAs.
    // Fix only that representation; never overwrite a physical card's print.
    if (use.card && get.itemtype(use.card) !== "card") use.card.number = number;
    return savedUse;
  }

  function useAtTarget(trigger) {
    if (trigger?.name === "useCard") return trigger;
    const use = parentOf(trigger);
    return use?.name === "useCard" ? use : null;
  }

  function targetsOf(use, player) {
    return [...new Set(use.targets || [])].filter(target => target !== player && inPlay(target));
  }

  function canWeixi(use, player) {
    if (!use || use.player !== player || !inPlay(player) || !active(player, weixi) || attempted.has(use)) return false;
    const saved = snapshots.get(use);
    if (!saved?.fromHand) return false;
    const targets = targetsOf(use, player);
    if (!targets.length) return false;
    if (saved.number === 4) return targets.some(target => api.slots.types(target, true).length > 0);
    return api.slots.types(player, true).length > 0;
  }

  async function chooseSlot(player, target, cancellable) {
    const choices = api.slots.types(target, true);
    if (!choices.length) return null;
    const controls = cancellable ? choices.concat("cancel2") : choices;
    const result = await player.chooseControl(controls)
      .set("prompt", "威袭：选择废除" + (target === player ? "自己" : get.translation(target)) + "的一个装备栏")
      .set("ai", () => 0)
      .forResult();
    return choices.includes(result.control) && api.slots.types(target, true).includes(result.control) ? result.control : null;
  }

  function observeDisables(player) {
    const pending = openDisables.get(player);
    if (!pending) return;
    for (const marker of pending) {
      if (marker.before != null && player.countDisabledSlot(marker.type) > marker.before) marker.applied = true;
    }
  }

  async function disableOwnSlot(player, type) {
    install();
    const event = player.disableEquip(type);
    const marker = { type, before: null, applied: false };
    let pending = openDisables.get(player);
    if (!pending) openDisables.set(player, pending = new Set());
    pending.add(marker);
    // Native content handlers run after all Before/Begin triggers and before
    // After triggers. Skipped/cancelled content never records an increment.
    event.pushHandler((current, option) => {
      if (option.state === "begin") marker.before = player.countDisabledSlot(type);
      else observeDisables(player);
    });
    try {
      await event;
      observeDisables(player);
      return marker.applied;
    } finally {
      pending.delete(marker);
    }
  }

  async function resolveWeixi(use, player) {
    if (!canWeixi(use, player)) return false;
    // A multi-target use gets one opportunity, including a declined opportunity.
    attempted.add(use);
    const saved = snapshots.get(use);
    let target = player;
    if (saved.number === 4) {
      const candidates = targetsOf(use, player).filter(current => api.slots.types(current, true).length > 0);
      const result = await player.chooseTarget("威袭：选择本牌的一名其他目标，废除其一个装备栏至其下个实际回合结束", (card, chooser, current) => candidates.includes(current))
        .set("ai", current => -get.attitude(player, current))
        .forResult();
      target = result.bool && result.targets?.[0];
      if (!candidates.includes(target) || !inPlay(target)) return false;
    }
    const type = await chooseSlot(player, target, target === player);
    if (!type) return false;
    player.logSkill(weixi, target);
    let disabled = false;
    if (saved.number === 4) disabled = await api.slots.disableTemporary(target, type);
    else if (api.slots.types(player, true).includes(type)) {
      // Native disableEquip mutates this enabled share before its equipment-loss
      // children and After triggers. Wait for all of them before measuring X.
      disabled = await disableOwnSlot(player, type);
    }
    if (!disabled) return false;
    const amount = Math.min(4, api.slots.countAll());
    const candidates = game.players.filter(current => current !== player && inPlay(current) && current.countCards("h") > 0);
    const take = Math.min(amount, candidates.length);
    if (!take || !inPlay(player)) return true;
    let selected = candidates;
    if (candidates.length > take) {
      const result = await player.chooseTarget("威袭：选择" + take + "名有手牌的其他角色，依次获得各一张手牌", [take, take], true, (card, chooser, current) => candidates.includes(current))
        .set("ai", current => -get.attitude(player, current))
        .forResult();
      selected = [...new Set(result.targets || [])];
      if (!result.bool || selected.length !== take || selected.some(current => !candidates.includes(current))) return true;
    }
    // Keep the single measured amount and selected players even if a gain's
    // downstream triggers change slots or other hands.
    for (const current of selected) {
      if (!inPlay(player)) break;
      if (inPlay(current) && current.countCards("h") > 0) await player.gainPlayerCard(current, "h", 1, true);
    }
    return true;
  }

  function cardEffect(effect, use) {
    if (!effect || !use || use.name !== "useCard" || effect.card !== use.card || effect.player !== use.player || effect.skill !== use.skill) return false;
    if (effect.type === "card") return effect.name === use.card.name;
    if (effect.type === "precard") return effect.name === use.card.name + "ContentBefore";
    if (effect.type === "postcard") return effect.name === use.card.name + "ContentAfter";
    return false;
  }

  function frame(event, seen = new Set()) {
    if (!event || seen.has(event)) return null;
    seen.add(event);
    let parent = parentOf(event);
    if (event.name === "damage" && parent?.name === "_lianhuan") {
      // Native _lianhuan deliberately creates fresh damage events from the
      // original damage's card/cards/source. Its skill event is the sole
      // permitted skill boundary, and its own trigger must also qualify.
      const original = parent._trigger || parent.getTrigger?.();
      if (original?.name !== "damage" || original.card !== event.card || original.source !== event.source) return null;
      const origin = frame(original, seen);
      return origin ? { ...origin, linked: true } : null;
    }
    if (event.name === "gain" && parent?.name === "gainPlayerCard") parent = parentOf(parent);
    const use = parentOf(parent);
    if (!cardEffect(parent, use)) return null;
    if (event.name === "damage" && event.card !== use.card) return null;
    return { use, effect: parent, linked: false };
  }

  function fourPointFrame(event, player) {
    if (!active(player, zhengfeng)) return null;
    const origin = frame(event);
    if (!origin || origin.use.player !== player) return null;
    const saved = snapshots.get(origin.use);
    return saved?.number === 4 ? origin : null;
  }

  function qualifiesDamage(event, player) {
    return event?.name === "damage" && event.source === player && event.player !== player && event.num > 0 && !event.unreal && !!fourPointFrame(event, player);
  }

  function gainedFromOthers(event, player) {
    if (!event.cards?.length) return false;
    const others = game.players.concat(game.dead || []).filter(current => current !== player);
    for (const current of others) {
      const loss = typeof event.getl === "function" ? event.getl(current) : null;
      // Native lose.cards2 excludes judgment cards; shunshou may take those.
      const lost = loss?.cards || loss?.cards2 || event.losing_map?.[current.playerid]?.[0] || [];
      if (event.cards.some(card => lost.includes(card))) return true;
    }
    return false;
  }

  function qualifiesGain(event, player) {
    return event?.name === "gain" && event.player === player && !!fourPointFrame(event, player) && gainedFromOthers(event, player);
  }

  async function reward(player) {
    await player.draw(1);
    if (inPlay(player)) await api.slots.restoreOne(player);
  }

  function install() {
    if (installed) return;
    game.addGlobalSkill(recorder);
    installed = true;
  }

  api.combat = { snapshot, frame, qualifiesDamage, qualifiesGain, canWeixi, resolveWeixi, reward, useAtTarget, install };
  return {
    skills: {
      [recorder]: {
        charlotte: true, forced: true, silent: true, popup: false,
        firstDo: true, priority: 1000000, forceDie: true, forceOut: true,
        trigger: { player: ["useCardBefore", "disableEquipBefore", "disableEquipBegin", "enableEquipBefore", "enableEquipBegin"] },
        async content(event, trigger, player) {
          if (trigger.name === "useCard") snapshot(trigger, player);
          // An equipment-loss trigger can restore an already disabled share
          // before disableEquip finishes. Witness that increment first.
          else observeDisables(player);
        },
      },
      [weixi]: {
        trigger: { player: "useCardToPlayer" },
        direct: true,
        filter(event, player) { return event.target !== player && canWeixi(useAtTarget(event), player); },
        async content(event, trigger, player) {
          await resolveWeixi(useAtTarget(trigger), player);
        },
        ai: { threaten: 2.2 },
      },
      [zhengfeng]: {
        forced: true,
        trigger: { source: "damageEnd", player: "gainAfter" },
        filter(event, player) {
          return !rewarded.has(event) && (qualifiesDamage(event, player) || qualifiesGain(event, player));
        },
        async content(event, trigger, player) {
          if (rewarded.has(trigger) || !(qualifiesDamage(trigger, player) || qualifiesGain(trigger, player))) return;
          rewarded.add(trigger);
          await reward(player);
        },
        mod: {
          cardnumber(card, player, number) {
            if (ownHand(card, player)) {
              const count = api.slots.count(player);
              if (count > 0) return count;
            }
          },
        },
        ai: { threaten: 1.5 },
      },
    },
    translate: {
      [weixi]: "威袭",
      [weixi + "_info"]: "当你使用包含本人手牌的牌指定目标时，每张牌限一次，你可以废除自己的一个装备栏；若此牌使用时的点数为4，改为废除此牌一名其他目标的一个装备栏至其下个实际回合结束。然后令X为所有存活在场角色的废栏总数（至多为4），你选择X名有手牌的不同其他角色（不足则全选），依次获得各一张手牌。",
      [zhengfeng]: "整锋",
      [zhengfeng + "_info"]: "锁定技，若你有废除的装备栏，你的手牌点数视为你的废栏数（使用时固定，单手牌转化继承，多材料转化按其原规则）。你使用的4点牌本身每对其他角色造成一次实际伤害，或本身效果每获得一次其他角色的牌后，你摸一张牌，然后恢复自己的一个废栏。",
    },
    async content() { install(); },
  };
},
function zhenxianModule(lib, game, ui, get, ai, _status, api) {
  const ids = {
    main: "bjgy_wuzhangliao_zhenxian",
    seal: "bjgy_wuzhangliao_zhenxian_seal",
    kill: "bjgy_wuzhangliao_zhenxian_kill",
    snapshot: "bjgy_wuzhangliao_zhenxian_snapshot",
    turn: "bjgy_wuzhangliao_zhenxian_turn",
  };
  const usedKey = "bjgy_wuzhangliao_zhenxian_used";
  const windows = new Set();
  const deathSkills = new WeakMap();
  const cleanupScheduled = new WeakSet();
  let installed = false;

  function currentTurn(event) {
    // The real phase is distinct from phaseUse and also from a turned-over
    // phase that never set currentPhase. A detached editor event has no lease.
    const phase = event?.getParent?.("phase", true, true);
    if (!phase || phase.name !== "phase" || phase.finished || phase.player !== _status.currentPhase) return null;
    return phase;
  }

  function canActivate(event, player) {
    return !!player && player.isIn() && !player.storage[usedKey] &&
      !player.awakenedSkills.includes(ids.main) && !!currentTurn(event);
  }

  function isSkillBlocked(skill, player) {
    const info = get.info(skill);
    if (!info || info.charlotte || info.persevereSkill || info.equipSkill) return false;
    // filterSkills normally excludes these itself. Keep that provenance when
    // the engine asks get.is.blocked directly, including equipment-granted
    // normal skill IDs whose definitions do not carry equipSkill.
    if (player.getSkills("e", true, false).includes(skill)) return false;
    return true;
  }

  function install() {
    if (installed) return;
    api.slots.install();
    game.addGlobalSkill(ids.snapshot);
    game.addGlobalSkill(ids.turn);
    installed = true;
  }

  function scheduleCleanup(phase) {
    if (cleanupScheduled.has(phase)) return;
    cleanupScheduled.add(phase);
    // cancel() can suppress phaseAfter, including its silent notrigger form.
    // Native GameEvent.loop still drains after when a running phase finishes.
    // createEvent first joins the current event's next queue: detach it before
    // moving it to the real phase's after queue, and never await it here.
    const cleanup = game.createEvent(ids.main + "_cleanup", false);
    cleanup.parent?.next.remove(cleanup);
    cleanup.parent = phase;
    cleanup.player = phase.player;
    cleanup.forceDie = true;
    cleanup.forceOut = true;
    cleanup.zhenxianPhase = phase;
    cleanup.setContent(async function (event) { cleanupTurn(event.zhenxianPhase); });
    phase.after.push(cleanup);
  }

  async function activate(event, player) {
    if (!canActivate(event, player)) return null;
    install();
    const phase = currentTurn(event);
    const targets = game.players.filter(target => target !== player && target.isIn() && api.slots.count(target) > 0);
    const window = { owner: player, phase, targets, offered: new WeakSet() };
    player.storage[usedKey] = true;
    player.awakenSkill(ids.main);
    windows.add(window);
    scheduleCleanup(phase);
    // These charlotte skills are owned independently. Losing the original
    // general skill, restoring a slot or killing the source does not revoke it.
    player.addSkill(ids.kill);
    for (const target of targets) target.addSkill(ids.seal);
    return window;
  }

  function captureDeath(event) {
    if (!event?.player || !windows.size) return;
    // Last dieBegin observes current skill ownership, including skills gained
    // or lost by earlier dying/death skills. It precedes Content.die cleanup.
    deathSkills.set(event, event.player.getSkills(null, false, false).slice());
  }

  function gainable(skill) {
    const info = get.info(skill);
    return !!info && !info.equipSkill && !info.charlotte && !info.hiddenSkill &&
      !info.zhuSkill && !info.juexingji && !info.limited && !info.dutySkill &&
      !(info.unique && !info.gainable);
  }

  function candidates(event, player) {
    const snapshot = deathSkills.get(event);
    if (!snapshot) return [];
    const owned = player.getSkills("invisible", false, false);
    return [...new Set(snapshot)].filter(skill => gainable(skill) && !owned.includes(skill));
  }

  function activeWindow(event, player) {
    if (!player || player.isDead() || !player.isIn() || !event || event.source !== player || !event.player?.isDead()) return null;
    const phase = currentTurn(event);
    if (!phase || !deathSkills.has(event)) return null;
    for (const window of windows) {
      if (window.owner === player && window.phase === phase && !window.offered.has(event)) return window;
    }
    return null;
  }

  function canReward(event, player) {
    return !!activeWindow(event, player) && candidates(event, player).length > 0;
  }

  async function rewardKill(event, player) {
    const window = activeWindow(event, player);
    if (!window) return null;
    const skills = candidates(event, player);
    window.offered.add(event);
    if (!skills.length) return null;
    const result = await player.chooseControl(skills, "cancel2")
      .set("prompt", "震贤：你可以获得" + get.translation(event.player) + "阵亡时拥有的一项技能")
      .set("choiceList", skills.map(skill => get.translation(skill) + "：" + get.translation(skill + "_info")))
      .set("ai", () => 0)
      .forResult();
    const skill = result.control;
    // Recheck the lease and the owner's current ownership after the choice;
    // the deceased's cleanup must never replace the recorded death snapshot.
    if (player.isDead() || !player.isIn() || !windows.has(window) || currentTurn(event) !== window.phase || event.source !== player ||
      !event.player.isDead() || !skills.includes(skill) || !candidates(event, player).includes(skill)) return null;
    await player.addSkills(skill);
    return skill;
  }

  function cleanupTurn(phase) {
    const removed = [...windows].filter(window => window.phase === phase);
    for (const window of removed) windows.delete(window);
    const targets = new Set(removed.flatMap(window => window.targets));
    const owners = new Set(removed.map(window => window.owner));
    for (const target of targets) {
      if (![...windows].some(window => window.targets.includes(target))) target.removeSkill(ids.seal);
    }
    for (const owner of owners) {
      if (![...windows].some(window => window.owner === owner)) owner.removeSkill(ids.kill);
    }
  }

  api.zhenxian = { ids, currentTurn, canActivate, isSkillBlocked, activate, captureDeath, candidates, canReward, rewardKill, cleanupTurn, install };
  return {
    skills: {
      [ids.main]: {
        enable: "phaseUse", limited: true, skillAnimation: true,
        animationColor: "thunder", selectCard: -1, selectTarget: -1,
        filter(event, player) { return canActivate(event, player); },
        async content(event, trigger, player) { await activate(event, player); },
        ai: { order: 10, result: { player: 1 } },
      },
      [ids.seal]: {
        charlotte: true, mark: true, marktext: "震",
        init(player, skill) { player.addSkillBlocker(skill); },
        onremove(player, skill) { player.removeSkillBlocker(skill); },
        skillBlocker(skill, player) { return isSkillBlocked(skill, player); },
        intro: { content: "普通武将技能失效至震贤发动的回合结束（持恒与独立机制除外）" },
      },
      [ids.kill]: {
        charlotte: true, mark: true, marktext: "贤",
        forceDie: true, forceOut: true, forced: true, popup: false,
        trigger: { source: "dieAfter" },
        filter(event, player) { return canReward(event, player); },
        async content(event, trigger, player) { await rewardKill(trigger, player); },
        intro: { content: "本回合击杀角色后，可永久获得其阵亡时拥有的一项可获得武将技能" },
      },
      [ids.snapshot]: {
        charlotte: true, forced: true, popup: false, silent: true,
        forceDie: true, forceOut: true, lastDo: true, priority: -1000000,
        trigger: { player: "dieBegin" },
        filter(event) { return windows.size > 0; },
        async content(event, trigger, player) { captureDeath(trigger); },
      },
      [ids.turn]: {
        charlotte: true, forced: true, popup: false, silent: true,
        forceDie: true, forceOut: true, lastDo: true, priority: -1000000,
        trigger: { player: ["phaseAfter", "phaseCancelled", "phaseSkipped"] },
        filter(event) { return [...windows].some(window => window.phase === event); },
        async content(event, trigger, player) { cleanupTurn(trigger); },
      },
    },
    translate: {
      [ids.main]: "震贤",
      [ids.main + "_info"]: "限定技，出牌阶段，你令所有有已废除装备栏的其他角色的普通武将技能失效至本回合结束（持恒技、独立机制与装备效果除外）。本回合你每击杀一名角色后，可以永久获得其阵亡时拥有且你尚未拥有的一项可获得武将技能。",
      [ids.seal]: "震贤·失效",
      [ids.kill]: "震贤·取贤",
    },
    async content() { install(); },
  };
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills));
 const translate=Object.assign({},...modules.map(module=>module.translate));
 let scheduled=false;
 return {
  name:'武张辽',editable:true,connect:false,
  async content(){
   // Native loadExtension invokes content before registering package.skill.
   // arenaReady is after registration and before the first game events.
   if(scheduled)return;
   scheduled=true;
   (lib.arenaReady??=[]).push(async function installWuzhangliao(){for(const module of modules)if(module.content)await module.content();});
  },
  async precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_wuzhangliao:['male','wei',4,['bjgy_wuzhangliao_weixi','bjgy_wuzhangliao_zhengfeng','bjgy_wuzhangliao_zhenxian'],['die:false','ext:武张辽/bjgy_wuzhangliao.jpg']]},
    translate:{bjgy_wuzhangliao:'武张辽'},characterIntro:{bjgy_wuzhangliao:'武张辽，魏、男性、4/4。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画：设计者提供的GPT生成图。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'武张辽：魏、男、4/4。威袭、整锋、震贤，按确认规则制作，面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_wuzhangliao.jpg'],card:[],skill:[],audio:[]}
 };
});
