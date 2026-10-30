// 自制武庙 v1.0.0。技能设计：辟境归元；代码实现与整合：OpenAI Codex协助。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const parts=[(function(lib, game, ui, get, ai, _status) {
    "use strict";
    return {
        name: "自制武段颎",
        editable: true,
        connect: false,
        content: function(config, pack) {},
        precontent: function() {},
        help: {},
        config: {},
        package: {
            character: {
                character: {"bjgy_wuduanjiong":["male","qun",5,["平羌","追剿","烈贤"],["die:false","ext:自制武庙/bjgy_wuduanjiong.jpg"]]},
                translate: {"bjgy_wuduanjiong":"武段颎"}
            },
            card: {card:{}, translate:{}, list:[]},
            skill: {
                skill: {
                    "平羌": {
    trigger: {player: "damageEnd"},
    direct: true,
    group: ["平羌_结束", "平羌_次数"],
    init(player) {
        game.addGlobalSkill("平羌_保留点数");
        if (!_status.postReconnect) _status.postReconnect = {};
        if (!_status.postReconnect.平羌删点) {
            _status.postReconnect.平羌删点 = [function(infos) {
                for (const info of infos) {
                    lib.skill.平羌.applyDeleted(get.infoCard(info));
                }
            }, []];
        }
    },
    marked(card) {
        return !!card && !!(
            card.storage && card.storage.平羌删点 ||
            typeof card.hasGaintag === "function" && card.hasGaintag("eternal_平羌删点") ||
            Array.isArray(card.gaintag) && card.gaintag.includes("eternal_平羌删点")
        );
    },
    hasNumber(card) {
        if (!card || lib.skill.平羌.marked(card)) return false;
        const number = get.number(card, false);
        return typeof number === "number" && Number.isFinite(number) && number > 0;
    },
    entities(cards) {
        const result = [];
        for (const card of cards) {
            const list = card.isViewAsCard ? card[card.cardSymbol]?.cards || card.cards || [] : [card];
            for (const original of list) if (!result.includes(original)) result.push(original);
        }
        return result;
    },
    applyDeleted(card) {
        if (!card || typeof card !== "object") return;
        card.number = null;
        if (!card.storage) card.storage = {};
        card.storage.平羌删点 = true;
        if (typeof card.addGaintag === "function") card.addGaintag("eternal_平羌删点");
        if (!game.平羌删点记录) game.平羌删点记录 = {};
        if (card.cardid) game.平羌删点记录[card.cardid] = true;
        // 只刷新牌面，不调用会重新分配实体ID的 init。
        if (typeof card.$init === "function") card.$init([card.suit, null, card.name, card.nature]);
    },
    video(player, info) {
        lib.skill.平羌.applyDeleted(get.infoCard(info));
    },
    async eraseContent(event, trigger, player) {
        const removed = [];
        for (const card of event.cards.slice()) {
            if (!lib.skill.平羌.hasNumber(card)) continue;
            game.broadcastAll(function(card) {
                lib.skill.平羌.applyDeleted(card);
            }, card);
            const info = get.cardInfo(card);
            game.addVideo("skill", player, ["平羌", info]);
            const reconnect = _status.postReconnect && _status.postReconnect.平羌删点;
            if (reconnect && card.cardid) {
                const old = reconnect[1].findIndex(data => data[4] === card.cardid);
                if (old < 0) reconnect[1].push(info);
                else reconnect[1][old] = info;
            }
            removed.push(card);
        }
        // 追剿只读取此次真正删点成功的牌，不包括原本无点数的牌。
        event.cards = removed;
    },
    filter(event, player) {
        return player.countCards("he", card => lib.filter.cardDiscardable(card, player, "平羌")) > 0;
    },
    async content(event, trigger, player) {
        const result = await player.chooseCard("he", 1, "平羌：是否弃置一张牌？有点数则永久删除其点数")
            .set("filterCard", card => lib.filter.cardDiscardable(card, get.player(), "平羌"))
            .set("ai", card => {
                const p = get.player();
                return 6 - get.value(card) + (lib.skill.平羌.hasNumber(card) && p.hasSkill("追剿") ? get.cardNameLength(get.name(card, false)) : 0);
            }).forResult();
        if (!result.bool) return;
        const originals = lib.skill.平羌.entities(result.cards);
        player.logSkill("平羌");
        const discard = player.discard(result.cards);
        await discard;
        const lost = discard.done?.cards2 || [];
        const cards = originals.filter(card => lost.includes(card) && lib.skill.平羌.hasNumber(card));
        if (!cards.length) return;
        const next = game.createEvent("平羌删点");
        next.player = player;
        next.cards = cards;
        next.forceDie = true;
        next.setContent(lib.skill.平羌.eraseContent);
        await next;
    },
    usedNames(player) {
        const record = player.storage.平羌用牌;
        return record && record.turn === game.phaseNumber ? record.names : [];
    },
    recordUse(player, name) {
        let record = player.storage.平羌用牌;
        if (!record || record.turn !== game.phaseNumber) {
            record = {turn: game.phaseNumber, names: []};
            player.storage.平羌用牌 = record;
        }
        if (!record.names.includes(name)) record.names.push(name);
        if (player.syncStorage) player.syncStorage("平羌用牌");
    },
    makeCard(data) {
        return get.autoViewAs({name: data.name, nature: data.nature || undefined,
            suit: "none", color: "none", number: null, isCard: false,
            storage: {平羌印牌: true}});
    },
    getCandidates(player) {
        const result = [];
        const used = lib.skill.平羌.usedNames(player);
        const history = game.getGlobalHistory("cardMove", event =>
            event.name === "cardsDiscard" || event.name === "lose" && event.position === ui.discardPile);
        for (const event of history) {
            for (const card of event.cards || []) {
                const name = get.name(card, false), type = get.type(card, null, false);
                const nature = get.nature(card, false) || "";
                if (!["basic", "trick"].includes(type) || used.includes(name)) continue;
                if (result.some(data => data.name === name && data.nature === nature)) continue;
                const data = {name: name, nature: nature, type: type};
                if (player.hasUseTarget(lib.skill.平羌.makeCard(data), true, true)) result.push(data);
            }
        }
        return result;
    },
    toRestore(event) {
        let cards = (event.cards || []).slice();
        if (event.card) cards.push(event.card);
        if (event.name === "phase") {
            for (const node of [ui.cardPile, ui.discardPile, ui.ordering, ui.special]) {
                if (node) cards.push(...Array.from(node.childNodes));
            }
            for (const player of game.players.concat(game.dead || [])) cards.push(...player.getCards("hejsx"));
        }
        return cards.filter((card, index) => card && cards.indexOf(card) === index &&
            (lib.skill.平羌.marked(card) || card.cardid && game.平羌删点记录?.[card.cardid]) &&
            (card.number !== null || !card.storage?.平羌删点));
    },
    subSkill: {
        结束: {
            trigger: {global: "phaseJieshuBegin"},
            direct: true,
            filter(event, player) {
                return player.getDamagedHp() > 0 && lib.skill.平羌.getCandidates(player).length > 0;
            },
            async content(event, trigger, player) {
                const limit = player.getDamagedHp();
                for (let i = 0; i < limit && player.isIn(); i++) {
                    const candidates = lib.skill.平羌.getCandidates(player);
                    if (!candidates.length) break;
                    const list = candidates.map(data => [data.type, "", data.name, data.nature || undefined]);
                    const result = await player.chooseButton([
                        "平羌：视为使用第" + (i + 1) + "/" + limit + "张牌（每牌名限一次，可取消）", [list, "vcard"]
                    ]).set("ai", button => get.player().getUseValue(lib.skill.平羌.makeCard({name: button.link[2], nature: button.link[3]}))).forResult();
                    if (!result.bool) break;
                    const link = result.links[0];
                    const data = candidates.find(item => item.name === link[2] && item.nature === (link[3] || ""));
                    if (!data) break;
                    const used = await player.chooseUseTarget(lib.skill.平羌.makeCard(data)).forResult();
                    if (!used.bool) break;
                    // 真正useCard1已记录；此处兼容自定义用牌流程，再次记录不重复消耗。
                    lib.skill.平羌.recordUse(player, data.name);
                    player.logSkill("平羌");
                }
            }
        },
        次数: {
            trigger: {player: "useCard1"},
            forced: true,
            popup: false,
            filter(event, player) {
                return event.card.storage && event.card.storage.平羌印牌 === true;
            },
            content(event, trigger, player) {
                lib.skill.平羌.recordUse(player, get.name(trigger.card, false));
            }
        },
        保留点数: {
            charlotte: true,
            trigger: {global: ["useCardBefore", "respondBefore", "loseAfter", "gainAfter", "cardsDiscardAfter", "phaseBefore"]},
            forced: true,
            silent: true,
            popup: false,
            firstDo: true,
            filter(event, player) {
                return lib.skill.平羌.toRestore(event).length > 0;
            },
            content(event, trigger, player) {
                for (const card of lib.skill.平羌.toRestore(trigger)) lib.skill.平羌.applyDeleted(card);
            }
        }
    }
},
                    "追剿": {
    locked: true,
    forced: true,
    trigger: { global: "平羌删点After" },
    filter(event, player) {
        return Array.isArray(event.cards) && event.cards.length > 0;
    },
    async content(event, trigger, player) {
        if (!Array.isArray(trigger.cards) || !trigger.cards.length) return;
        // cards 只含本次实际删除点数成功的原实体，不限制删点人。
        const number = trigger.cards.reduce((sum, card) => {
            // false 绕过持有者改名，属性杀仍以正式牌名“杀”计一字。
            return sum + get.cardNameLength(card, false);
        }, 0);
        if (number > 0) await player.draw(number);
    },
    无点(card, player) {
        if (!card || typeof card !== "object") return false;
        const marked = card => {
            return !!(card.storage && card.storage["平羌删点"]) ||
                (typeof card.hasGaintag === "function" && card.hasGaintag("eternal_平羌删点")) ||
                (Array.isArray(card.gaintag) && card.gaintag.includes("eternal_平羌删点"));
        };
        if (marked(card)) return true;
        // 原实体包装的 VCard 不一定复制 gaintag，只追溯这一张实体。
        // 新转化牌若显式保有点数，不因所用材料的删点标记改变点数。
        if (card.isCard === true && Array.isArray(card.cards) && card.cards.length === 1 &&
            card.cards[0] && marked(card.cards[0])) return true;
        const number = get.number(card, player);
        return number === null || number === undefined || number === 0;
    },
    mod: {
        cardUsable(card, player, number) {
            if (lib.skill["追剿"].无点(card, player)) return Infinity;
        },
        targetInRange(card, player, target) {
            if (lib.skill["追剿"].无点(card, player)) return true;
        },
    },
    group: ["追剿_次数"],
    subSkill: {
        次数: {
            charlotte: true,
            forced: true,
            popup: false,
            trigger: { player: "useCard1" },
            filter(event, player) {
                return event.addCount !== false && lib.skill["追剿"].无点(event.card, player);
            },
            content(event, trigger, player) {
                // 1.11.6 在 useCard1 前已累计 stat.card；只扣回本次计入的次数。
                if (trigger.addCount === false) return;
                trigger.addCount = false;
                const stat = player.getStat("card");
                const name = trigger.card.name;
                if (typeof stat[name] === "number" && stat[name] > 0) stat[name]--;
            },
        },
    },
},
                    "烈贤": {
    enable: "phaseUse",
    limited: true,
    skillAnimation: true,
    animationColor: "fire",
    isNumberless(card, player = false) {
        if (!card) return false;
        const marked = current => !!current && (
            current.storage && current.storage["平羌删点"] === true ||
            typeof current.hasGaintag === "function" && current.hasGaintag("eternal_平羌删点")
        );
        if (marked(card)) return true;
        // 实体牌生成的单牌包装可追溯永久标记，新转化牌的显式点数仍有效。
        if (card.isCard && card.cards && card.cards.length === 1 && marked(card.cards[0])) return true;
        const number = get.number(card, player);
        return number == null || number === 0;
    },
    async content(event, trigger, player) {
        player.awakenSkill("烈贤");
        // 单独赋予，避免 addTempSkill 在 phaseAfter 收集触发前自动移除。
        player.addSkill("烈贤_effect");
        const groups = new Map();
        const cards = Array.from(ui.cardPile.childNodes).concat(Array.from(ui.discardPile.childNodes));
        for (const card of cards) {
            if (!lib.skill.烈贤.isNumberless(card)) continue;
            const name = get.name(card, false);
            if (!name) continue;
            if (!groups.has(name)) groups.set(name, []);
            groups.get(name).push(card);
        }
        const gained = Array.from(groups.values(), group => group.randomGet());
        if (gained.length) await player.gain(gained, "gain2");
    },
    ai: {
        order: 9,
        result: {
            player(player) {
                const available = Array.from(ui.cardPile.childNodes).concat(Array.from(ui.discardPile.childNodes));
                if (available.some(card => lib.skill.烈贤.isNumberless(card))) return 1;
                return player.hasCard(card => lib.skill.烈贤.isNumberless(card, player) && get.tag(card, "damage"), "h") ? 1 : 0;
            }
        }
    },
    subSkill: {
        effect: {
            charlotte: true,
            trigger: {source: "damageSource"},
            direct: true,
            popup: false,
            group: "烈贤_clear",
            mark: true,
            marktext: "烈",
            intro: {
                content: "本回合，你使用的无点数牌每次造成伤害后，可对至多该牌正式牌名字数名其他角色各造成1点普通伤害"
            },
            filter(event, player) {
                if (event.source !== player || event.num <= 0 || !event.card) return false;
                const use = event.getParent("useCard");
                if (!use || use.name !== "useCard" || use.player !== player || use.card !== event.card) return false;
                if (!lib.skill.烈贤.isNumberless(event.card, player)) return false;
                // 传牌名字符串，避免火杀等附带属性、牌面文字影响字数。
                if (get.cardNameLength(get.name(event.card, false)) <= 0) return false;
                return game.hasPlayer(target => target !== player && target.isIn());
            },
            async content(event, trigger, player) {
                const limit = get.cardNameLength(get.name(trigger.card, false));
                const result = await player.chooseTarget(
                    get.prompt("烈贤"),
                    "对至多" + get.cnNumber(limit) + "名其他角色各造成1点普通伤害",
                    [1, limit],
                    (card, player, target) => target !== player && target.isIn()
                ).set("ai", target => get.damageEffect(target, player, player)).forResult();
                if (!result.bool || !result.targets || !result.targets.length) return;
                const targets = result.targets.filter((target, index, all) => target !== player && target.isIn() && all.indexOf(target) === index).slice(0, limit);
                if (!targets.length) return;
                targets.sortBySeat();
                player.logSkill("烈贤", targets);
                for (const target of targets) {
                    if (target.isIn()) {
                        // nocard 同时阻止从父事件继承 card 与 cards，普通技能伤害不再触发烈贤。
                        await target.damage(1, player, "nocard");
                    }
                }
            }
        },
        clear: {
            charlotte: true,
            trigger: {global: "phaseAfter"},
            forced: true,
            silent: true,
            popup: false,
            lastDo: true,
            content(event, trigger, player) {
                player.removeSkill("烈贤_effect");
            }
        }
    }
}
                },
                translate: {"平羌":"平羌","平羌_info":"当你受到伤害后，你可以弃置一张牌，若此牌有点数，则删除其点数。每名角色的结束阶段开始时，你可以依次视为使用至多X张本回合进入过弃牌堆的基本牌或普通锦囊牌（每回合每种牌名限一次，X为发动此效果时你的已损失体力值）。","追剿":"追剿","追剿_info":"锁定技，你使用无点数牌无距离和次数限制。当一张牌的点数被删除时，你摸此牌牌名字数张牌。","烈贤":"烈贤","烈贤_info":"限定技，出牌阶段，你可以随机获得牌堆、弃牌堆中每种牌名的无点数牌各一张。本回合，当你使用的无点数牌造成伤害后，你可以对至多此牌牌名字数名其他角色各造成1点伤害。"}
            },
            intro: "原创武将武段颎，包含技能〖平羌〗、〖追剿〗、〖烈贤〗。适配无名杀1.11.6。",
            author: "辟境归元",
            diskURL: "",
            forumURL: "",
            version: "1.0.0"
        },
        files: {character:["bjgy_wuduanjiong.jpg"], card:[], skill:[], audio:[]}
    };
})(lib,game,ui,get,ai,_status),
(function(lib,game,ui,get,ai,_status){
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
    content() { install(); },
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
    content() { install(); },
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
    content() { install(); },
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
   (lib.arenaReady??=[]).push(function installWuzhangliao(){for(const module of modules)if(module.content)module.content();});
  },
  async precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_wuzhangliao:['male','wei',4,['bjgy_wuzhangliao_weixi','bjgy_wuzhangliao_zhengfeng','bjgy_wuzhangliao_zhenxian'],['die:false','ext:自制武庙/bjgy_wuzhangliao.jpg']]},
    translate:{bjgy_wuzhangliao:'武张辽'},characterIntro:{bjgy_wuzhangliao:'武张辽，魏、男性、4/4。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画：设计者提供的GPT生成图。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'武张辽：魏、男、4/4。威袭、整锋、震贤，按确认规则制作，面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_wuzhangliao.jpg'],card:[],skill:[],audio:[]}
 };
})(lib,game,ui,get,ai,_status),
(function(lib,game,ui,get,ai,_status){
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
   character:{character:{bjgy_wuzhouyu:['male','wu',4,['bjgy_wuzhouyu_guqu','bjgy_wuzhouyu_chouju','bjgy_wuzhouyu_xiongxian'],['die:false','ext:自制武庙/bjgy_wuzhouyu.jpg']]},
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
})(lib,game,ui,get,ai,_status),
(function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function(lib,game,ui,get,ai,_status,api){
 const RECORD='bjgy_wulvmeng_record',CLOCK='bjgy_wulvmeng_clock';
 const frames=new WeakMap(),turns=new WeakMap(),completed=new WeakSet(),queued=new WeakSet(),callbacks=[];
 let installed=false;
 function inPlay(player){return Boolean(player&&typeof player.isIn==='function'&&player.isIn());}
 function ancestor(event,name){
  if(!event||typeof event!=='object')return null;if(event.name===name)return event;
  if(typeof event.getParent==='function'){const found=event.getParent(name,true,true);if(found?.name===name)return found;}
  const seen=new Set();for(let p=event.parent;p&&!seen.has(p);p=p.parent){if(p.name===name)return p;seen.add(p);}return null;
 }
 function turnOf(event){return ancestor(event||_status.event,'phase');}
 function phaseUseOf(event){return ancestor(event||_status.event,'phaseUse');}
 function useOf(event){return ancestor(event||_status.event,'useCard');}
 function frame(event){const use=useOf(event);return use?frames.get(use)||null:null;}
 function data(turn){if(!turn)return null;let value=turns.get(turn);if(!value){value={damageUsers:new Set()};turns.set(turn,value);}return value;}
 function usedDamage(player,event){return data(turnOf(event))?.damageUsers.has(player)||false;}
 function capture(use){
  if(frames.has(use)||!use.player)return;
  const player=use.player,limit=player.getHandcardLimit(),hp=player.hp,raw=get.number(use.card,player);
  const number=typeof raw==='number'&&Number.isFinite(raw)?raw:0;
  const branch=limit>hp?(number<limit?'low':number===limit?'equal':'high'):null;
  frames.set(use,Object.freeze({use,player,limit,hp,number,branch}));
 }
 function onTurnEnd(fn){if(!callbacks.includes(fn))callbacks.push(fn);}
 async function finishTurn(turn){if(!turn||completed.has(turn))return;completed.add(turn);for(const fn of callbacks)await fn(turn);}
 function queueCleanup(turn){
  if(!turn||!Array.isArray(turn.after)||queued.has(turn))return;queued.add(turn);data(turn);
  const event=game.createEvent('bjgy_wulvmeng_turn_cleanup',false,turn);
  event.player=turn.player;event.forceDie=true;event.includeOut=true;event._bjgy_wulvmeng_turn=turn;
  event.setContent(async function(event){await finishTurn(event._bjgy_wulvmeng_turn);});
  const at=turn.next?.indexOf(event)??-1;if(at>=0)turn.next.splice(at,1);turn.after.push(event);
 }
 function install(){if(installed)return;installed=true;game.addGlobalSkill(RECORD);game.addGlobalSkill(CLOCK);}
 api.core={inPlay,turnOf,phaseUseOf,usedDamage,frame,useOf,onTurnEnd,finishTurn,install};
 return {skills:{
  [RECORD]:{charlotte:true,silent:true,forced:true,popup:false,forceDie:true,forceOut:true,firstDo:true,priority:10000000,
   trigger:{global:['useCardBefore','useCard1']},
   async content(event,trigger){
    capture(trigger);
    if(event.triggername==='useCard1'&&get.tag(trigger.card,'damage'))data(turnOf(trigger))?.damageUsers.add(trigger.player);
   }},
  [CLOCK]:{charlotte:true,silent:true,forced:true,popup:false,forceDie:true,forceOut:true,lastDo:true,priority:-10000000,
   trigger:{global:['phaseBegin','phaseAfter','phaseCancelled','phaseSkipped']},
   async content(event,trigger){if(event.triggername==='phaseBegin')queueCleanup(trigger);else await finishTurn(trigger);}},
 },translate:{},content:install};
},
function createLimits(lib, game, ui, get, ai, _status, api) {
  const STATE = 'bjgy_wulvmeng_limit_state';
  const UNLIMITED = 'bjgy_wulvmeng_unlimited';
  const DRAW_SIX = 'bjgy_wulvmeng_compensation';
  const VIDEO_SIX = 'bjgy_wulvmeng_permanent_six';
  const KEXIAN = 'bjgy_wulvmeng_kexian';
  const unlimited = new Map();
  let installed = false;

  function state(player) {
    player.storage ??= {};
    return player.storage[STATE] ??= { delta: 0, fixedSix: false };
  }

  function syncState(player) {
    const snapshot = { ...state(player) };
    game.broadcastAll(function (target, key, value) {
      target.storage ??= {};
      target.storage[key] = value;
    }, player, STATE, snapshot);
    player.syncStorage?.(STATE);
  }

  function value(player) {
    return player.getHandcardLimit();
  }

  function adjust(player, delta) {
    if (!Number.isFinite(delta)) throw new TypeError('Hand limit delta must be finite');
    const data = state(player);
    data.delta += delta;
    syncState(player);
    return value(player);
  }

  function lockSix(player) {
    const before = value(player);
    state(player).fixedSix = true;
    syncState(player);
    return Math.max(0, before - 6);
  }

  // This function is sent through broadcastAll, so it must be self-contained.
  // Only change the physical rank and its visible rank nodes: Card.init would
  // erase gaintags, vanish tags, custom storage and other extensions' marks.
  function writePhysicalSix(cards, oldLabels, suitLabels) {
    cards.forEach(function (card, index) {
      if (!card || typeof card !== 'object') return;
      card.number = 6;
      const node = card.node;
      if (!node) return;
      if (node.number) node.number.textContent = '6';
      const spans = node.info?.querySelectorAll?.('span');
      if (spans?.length) spans[spans.length - 1].textContent = '6';
      if (node.name2 && typeof node.name2.innerHTML === 'string') {
        const prefix = suitLabels[index] + oldLabels[index];
        if (node.name2.innerHTML.startsWith(prefix)) {
          node.name2.innerHTML = suitLabels[index] + '6' + node.name2.innerHTML.slice(prefix.length);
        }
      }
    });
  }

  function permanentSix(cards) {
    const physical = Array.from(new Set(cards || [])).filter(card => get.itemtype(card) === 'card');
    if (!physical.length) return;
    const oldLabels = physical.map(card => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[card.number] || String(card.number ?? '')));
    const suitLabels = physical.map(card => get.translation(card.suit));
    game.broadcastAll(writePhysicalSix, physical, oldLabels, suitLabels);
    game.addVideo(VIDEO_SIX, null, [get.cardsInfo(physical), oldLabels, suitLabels]);
  }

  function grantUnlimited(player, event) {
    const turn = api.core.turnOf(event || _status.event);
    if (turn) unlimited.set(player, turn);
  }

  function hasUnlimited(player, event) {
    const turn = api.core.turnOf(event || _status.event);
    return !!turn && unlimited.get(player) === turn;
  }

  function compensationDraw(event) {
    // Native Content.draw creates its gain as a direct child. A later draw or
    // gain inside one of its reactions is a separate effect, not compensation.
    const draw = event?.parent;
    return draw?.name === 'draw' && draw[DRAW_SIX] ? draw : null;
  }

  function install() {
    if (installed) return;
    installed = true;
    game.addGlobalSkill(STATE);
    game.addGlobalSkill(UNLIMITED);
    game.addGlobalSkill(DRAW_SIX);
    game.videoContent[VIDEO_SIX] = function (record) {
      writePhysicalSix(get.infoCards(record[0]), record[1], record[2]);
    };
    api.core.onTurnEnd(function (turn) {
      for (const [player, activeTurn] of unlimited) {
        if (activeTurn === turn) unlimited.delete(player);
      }
    });
  }

  api.limits = { value, adjust, lockSix, permanentSix, grantUnlimited, hasUnlimited, install };

  const skills = {
    [STATE]: {
      charlotte: true,
      forced: true,
      silent: true,
      forceDie: true,
      // Player.getModableSkills sorts mods by increasing priority. Apply this
      // permanent final delta/lock after the engine's ordinary limit modifiers.
      priority: 1e9,
      mod: {
        maxHandcardFinal(player, number) {
          const data = player.storage?.[STATE];
          if (data?.fixedSix) return 6;
          if (data?.delta) return number + data.delta;
        },
      },
    },
    [UNLIMITED]: {
      charlotte: true,
      forced: true,
      silent: true,
      forceDie: true,
      firstDo: true,
      priority: 1e8,
      trigger: { global: ['useCardBefore', 'useCard1'] },
      filter(event, player) {
        return event.player === player && hasUnlimited(event.player, event);
      },
      async content(event, trigger, player) {
        // Before catches the native counter before it increments. useCard1 is
        // a fallback for uses already counted or altered by another skill.
        if (event.triggername === 'useCard1' && trigger.addCount !== false) {
          const counts = trigger.player.getStat().card;
          const name = trigger.card?.name;
          if (typeof counts[name] === 'number' && counts[name] > 0) counts[name]--;
        }
        trigger.addCount = false;
      },
      mod: {
        targetInRange(card, player) {
          if (hasUnlimited(player, _status.event)) return true;
        },
        cardUsable(card, player) {
          if (hasUnlimited(player, _status.event)) return Infinity;
        },
      },
    },
    [DRAW_SIX]: {
      charlotte: true,
      forced: true,
      silent: true,
      forceDie: true,
      firstDo: true,
      priority: 1e8,
      trigger: { global: 'gainBefore' },
      filter(event, player) {
        return event.player === player && !!compensationDraw(event);
      },
      async content(event, trigger, player) {
        permanentSix(trigger.cards);
      },
    },
    [KEXIAN]: {
      enable: 'phaseUse',
      limited: true,
      unique: true,
      skillAnimation: true,
      animationColor: 'wood',
      filter(event, player) {
        return !player.storage[KEXIAN];
      },
      async content(event, trigger, player) {
        if (player.storage[KEXIAN]) return;
        player.awakenSkill(KEXIAN);
        player.storage[KEXIAN] = true;
        player.syncStorage?.(KEXIAN);
        const reduction = lockSix(player);
        grantUnlimited(player, event);
        if (reduction > 0) {
          const draw = player.draw(reduction);
          draw[DRAW_SIX] = true;
          const result = await draw.forResult();
          permanentSix(result?.cards || []);
        }
      },
      ai: { order: 10, result: { player: 1 } },
    },
  };

  const translate = {
    [KEXIAN]: '克贤',
    [KEXIAN + '_info']: '限定技，出牌阶段，你将本局的最终手牌上限固定为6。若此前手牌上限大于6，你摸等同于减少值的牌，此次实际摸到的牌永久变为6点。本实际回合内，你使用牌无距离和次数限制，且不计入使用次数。',
    [STATE]: '克贤·上限',
    [UNLIMITED]: '克贤·畅用',
    [DRAW_SIX]: '克贤·六点',
  };

  return { skills, translate, content: install };
},
function createZhiji(lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wulvmeng_zhiji';

  // Choose uniformly among matching cards, keeping the draw pile strictly
  // ahead of the discard pile. A random traversal start would bias matches.
  function findSix() {
    for (const pile of [ui.cardPile, ui.discardPile]) {
      const cards = Array.from(pile.childNodes).filter(card => get.number(card) === 6);
      if (cards.length) return cards[get.rand(0, cards.length - 1)];
    }
    return null;
  }

  return {
    skills: {
      [ID]: {
        trigger: { global: 'phaseEnd' },
        filter(event, player) {
          return api.core.inPlay(player) && !api.core.usedDamage(player, event);
        },
        check() {
          return true;
        },
        async content(event, trigger, player) {
          await player.recover(1);
          const card = findSix();
          if (card) await player.gain(card, 'gain2');
          api.limits.adjust(player, 1);
        },
        ai: { threaten: 1.6 },
      },
    },
    translate: {
      [ID]: '制己',
      [`${ID}_info`]: '每个回合结束时，若你本回合未使用过伤害牌，你可以回复1点体力，然后优先从牌堆、其次从弃牌堆中随机获得一张当前点数为6的牌，并令你本局游戏的手牌上限永久+1。满体力或未找到符合条件的牌不影响后续效果。若“克贤”已将你的最终手牌上限固定为6，此增量不改变最终上限。',
    },
  };
},
function fujingModule(lib, game, ui, get, ai, _status, api) {
  const main = 'bjgy_wulvmeng_fujing';
  const effects = main + '_effects';
  const confirmed = new WeakMap();
  const damaged = new WeakSet();
  const targetRecords = new WeakMap();
  let installed = false;

  function inPlay(player) {
    return !!api.core.inPlay(player);
  }

  function parentOf(event) {
    return event?.parent || event?.getParent?.() || null;
  }

  function canActivate(use, player) {
    const frame = api.core.frame(use);
    return !!frame?.branch && frame.use === use && frame.player === player && inPlay(player) && !confirmed.has(use);
  }

  function lockResponses(use) {
    if (!Array.isArray(use.directHit)) use.directHit = [];
    // The installed standard _wuxie checks this same useCard.directHit list
    // before asking any player for 无懈. Include the user as well as targets.
    for (const player of game.players.concat(game.dead || [])) {
      if (!use.directHit.includes(player)) use.directHit.push(player);
    }
  }

  async function activate(use, player) {
    if (!canActivate(use, player)) return false;
    const frame = api.core.frame(use);
    confirmed.set(use, frame);
    install();
    if (frame.branch === 'low') lockResponses(use);
    else if (frame.branch === 'high') {
      if (frame.limit > 6) {
        api.limits.adjust(player, -1);
        await player.draw(2);
      } else await player.draw(1);
    }
    return true;
  }

  function cardEffect(effect, use) {
    if (!effect || use?.name !== 'useCard' || effect.card !== use.card || effect.player !== use.player || effect.skill !== use.skill) return false;
    if (effect.type === 'card') return effect.name === use.card.name;
    if (effect.type === 'precard') return effect.name === use.card.name + 'ContentBefore';
    if (effect.type === 'postcard') return effect.name === use.card.name + 'ContentAfter';
    return false;
  }

  function damageOrigin(event, seen = new Set()) {
    if (event?.name !== 'damage' || seen.has(event)) return null;
    seen.add(event);
    const parent = parentOf(event);
    if (parent?.name === '_lianhuan') {
      // Native chain damage is the one skill boundary allowed to inherit a
      // card's damage. A descendant skill carrying that card is insufficient.
      const original = parent._trigger || parent.getTrigger?.();
      if (original?.name !== 'damage' || original.num <= 0 || original.unreal || original.card !== event.card || original.source !== event.source) return null;
      return damageOrigin(original, seen);
    }
    const use = parentOf(parent);
    return cardEffect(parent, use) && event.card === use.card ? use : null;
  }

  function qualifiesDamage(event, player) {
    if (event?.name !== 'damage' || !(event.num > 0) || event.unreal || damaged.has(event) || !inPlay(player)) return false;
    const use = damageOrigin(event);
    const frame = use && confirmed.get(use);
    // Damage source may be the opponent in 决斗, or the recipient may be self.
    return frame?.branch === 'low' && frame.player === player;
  }

  function canTakeHeart(card, player, victim) {
    return get.suit(card, victim) === 'heart' && lib.filter.canBeGained(card, player, victim, main);
  }

  async function resolveDamage(event, player) {
    if (!qualifiesDamage(event, player)) return false;
    damaged.add(event);
    const victim = event.player;
    if (!victim?.getCards) return true;
    // viewHandcards uses the native private viewCards event; showCards would
    // publish the victim's hand to every player. Viewing still happens if the
    // hand has no heart (or is empty).
    await player.viewHandcards(victim);
    // Native gain records statistics before discarding cards already in the
    // recipient's hand. Self damage must not create a redundant gain event.
    if (!inPlay(player) || victim === player) return true;
    const hearts = victim.getCards('h').filter(card => canTakeHeart(card, player, victim));
    if (!hearts.length) return true;
    const result = await player.choosePlayerCard(victim, 'h', 'visible', true)
      .set('prompt', '复荆：获得' + get.translation(victim) + '的一张红桃手牌')
      .set('filterButton', button => canTakeHeart(button.link, player, victim))
      .set('ai', button => get.value(button.link, player))
      .forResult();
    const card = result.cards?.[0];
    if (result.bool && card && inPlay(player) && victim.getCards('h').includes(card) && canTakeHeart(card, player, victim)) {
      await player.gain([card], victim, 'giveAuto');
    }
    return true;
  }

  function targetFrame(event, player) {
    if (event?.name !== 'useCardToPlayered' || !inPlay(player)) return null;
    const frame = api.core.frame(event);
    if (frame?.player !== player || confirmed.get(frame.use)?.branch !== 'equal') return null;
    return frame;
  }

  function canTarget(event, player) {
    const frame = targetFrame(event, player);
    const target = event?.target;
    return !!frame && !!target && inPlay(target) && !!frame.use.targets?.includes(target) && !targetRecords.get(frame.use)?.has(target);
  }

  async function resolveTarget(event, player) {
    if (!canTarget(event, player)) return false;
    const frame = api.core.frame(event);
    let settled = targetRecords.get(frame.use);
    if (!settled) targetRecords.set(frame.use, settled = new WeakSet());
    const target = event.target;
    settled.add(target);
    let recover = false;
    if (target.isDamaged()) {
      const result = await player.chooseControl(['失去1点体力', '回复1点体力'])
        .set('prompt', '复荆：令' + get.translation(target) + '失去或回复1点体力')
        .set('ai', () => get.attitude(player, target) > 0 ? 1 : 0)
        .forResult();
      recover = result.control === '回复1点体力';
    }
    if (!inPlay(player) || !inPlay(target)) return true;
    if (recover && target.isDamaged()) await target.recover(1);
    else await target.loseHp(1);
    return true;
  }

  function install() {
    if (installed) return;
    game.addGlobalSkill(effects);
    installed = true;
  }

  api.fujing = { activate, damageOrigin, qualifiesDamage, canTarget, resolveTarget, resolveDamage, install };
  return {
    skills: {
      [main]: {
        forced: true,
        trigger: { player: 'useCard' },
        filter(event, player) { return canActivate(event, player); },
        async content(event, trigger, player) { await activate(trigger, player); },
        ai: { threaten: 2.2 },
      },
      [effects]: {
        charlotte: true, forced: true, silent: true, popup: false,
        // Global registration keeps a confirmed card's effects after skill
        // removal. The stored user check prevents every other holder from
        // resolving the same global trigger. Death still stops user actions.
        trigger: { global: ['damageEnd', 'useCardToPlayered'] },
        filter(event, player) { return qualifiesDamage(event, player) || canTarget(event, player); },
        async content(event, trigger, player) {
          if (trigger.name === 'damage') await resolveDamage(trigger, player);
          else await resolveTarget(trigger, player);
        },
      },
    },
    translate: {
      [main]: '复荆',
      [main + '_info']: '锁定技，你使用牌时，记录当前手牌上限M、体力值及此牌点数N（无点数视为0）。若M大于体力值：N小于M，此牌不能被响应，此牌每次实际造成伤害后，你观看受伤角色的全部手牌并获得其中一张红桃；N等于M，你分别令此牌每名目标失去或回复1点体力（满体力只能失去）；N大于M，若M大于6，你本局手牌上限增量减1并摸两张牌，否则摸一张牌。各分支以使用时记录为准。',
    },
    async content() { install(); },
  };
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills));
 const translate=Object.assign({},...modules.map(module=>module.translate));
 let scheduled=false;
 return {
  name:'武吕蒙',editable:true,connect:false,
  async content(){
   if(scheduled)return;scheduled=true;
   // Native loading registers package skills after content; arenaReady is
   // drained synchronously, so install every helper without awaiting between.
   (lib.arenaReady??=[]).push(function installWulvmeng(){api.core.install();api.limits.install();api.fujing.install();});
  },
  async precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_wulvmeng:['male','wu','3/6',['bjgy_wulvmeng_zhiji','bjgy_wulvmeng_fujing','bjgy_wulvmeng_kexian'],['die:false','ext:自制武庙/bjgy_wulvmeng.jpg']]},
    translate:{bjgy_wulvmeng:'武吕蒙'},characterIntro:{bjgy_wulvmeng:'武吕蒙，吴、男性、初始体力3，体力上限6。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画：设计者提供的GPT生成图。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'武吕蒙：吴、男、3/6。制己、复荆、克贤，含手牌上限成长、固定为六及永久六点牌，面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_wulvmeng.jpg'],card:[],skill:[],audio:[]}
 };
})(lib,game,ui,get,ai,_status),
(function(lib,game,ui,get,ai,_status){
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
   character:{character:{bjgy_wudengai:['male','wei',4,['bjgy_wudengai_kaichou','bjgy_wudengai_yuxian','bjgy_wudengai_bixian'],['die:false','ext:自制武庙/bjgy_wudengai.jpg']]},
    translate:{bjgy_wudengai:'武邓艾'},characterIntro:{bjgy_wudengai:'武邓艾，魏、男性、初始体力4，体力上限4。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画：设计者提供的GPT生成图。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'武邓艾：魏、男、4/4。开畴、逾险、辟贤，包含五谷丰登转畴、九点手牌与永久实体牌强化。面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_wudengai.jpg'],card:[],skill:[],audio:[]}
 };
})(lib,game,ui,get,ai,_status),
(function(lib,game,ui,get,ai,_status){
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
   character:{character:{bjgy_wuwangjun:['male','qun',4,['bjgy_wuwangjun_xiajiang','bjgy_wuwangjun_quanou','bjgy_wuwangjun_quxian'],['die:false','ext:自制武庙/bjgy_wuwangjun.jpg']]},
    translate:{bjgy_wuwangjun:'武王濬'},characterIntro:{bjgy_wuwangjun:'武王濬，群、男性、初始体力4，体力上限4。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由设计者提供。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'武王濬：群、男、4/4。下江、全瓯、驱贤。面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_wuwangjun.jpg'],card:[],skill:[],audio:[]}
 };
})(lib,game,ui,get,ai,_status),
(function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function createDexin(lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wuyanghu_dexin';
  const EFFECT = ID + '_effect';
  // A real phaseUse event, including an inserted one, owns its own allowance.
  const phaseStates = new WeakMap();
  const uses = new WeakSet();
  const increased = new WeakSet();
  const paid = new WeakSet();

  function phaseOf(event, player) {
    const phase = event?.name === 'phaseUse' ? event : event?.getParent?.('phaseUse', true, true);
    return phase?.name === 'phaseUse' && phase.player === player ? phase : null;
  }

  function stateOf(phase, player, create = false) {
    let states = phaseStates.get(phase);
    if (!states && create) phaseStates.set(phase, states = new Map());
    let state = states?.get(player);
    if (!state && create) states.set(player, state = { used: 0, limit: 1 });
    return state || { used: 0, limit: 1 };
  }

  function available(event, player) {
    const phase = phaseOf(event, player);
    if (!phase) return false;
    const state = stateOf(phase, player);
    return state.used < state.limit && game.hasPlayer(target =>
      target !== player && target.isIn() && (player.countCards('he') > 0 || target.countCards('he') > 0));
  }

  function relatedDamage(event) {
    if (!event.card || event.unreal || event.num <= 0) return false;
    // Nearest useCard prevents unrelated nested card uses from borrowing the buff.
    // Duel counterdamage and native chain propagation retain this card and ancestry.
    const use = event.getParent('useCard', true, true);
    return !!use && uses.has(use) && event.card === use.card;
  }

  function randomJacks() {
    const cards = [];
    for (const pile of [ui.cardPile, ui.discardPile]) {
      const candidates = Array.from(pile.childNodes).filter(card => get.number(card, false) === 11);
      while (candidates.length && cards.length < 2) {
        cards.push(candidates.splice(get.rand(0, candidates.length - 1), 1)[0]);
      }
      if (cards.length === 2) break;
    }
    return cards;
  }

  const skills = {
    [ID]: {
      enable: 'phaseUse',
      filter: available,
      selectTarget: 1,
      filterTarget(card, player, target) {
        return target !== player && target.isIn() && (player.countCards('he') > 0 || target.countCards('he') > 0);
      },
      async content(event, trigger, player) {
        const phase = phaseOf(event, player);
        if (!phase || !available(event, player)) return;
        const target = event.target || event.targets?.[0];
        if (!target?.isIn() || target === player) return;
        const choices = [];
        if (player.countCards('he')) choices.push('交给对方');
        if (target.countCards('he')) choices.push('令其交给你');
        if (!choices.length) return;
        let direction = choices[0];
        if (choices.length > 1) {
          const result = await player.chooseControl(choices)
            .set('prompt', '德信：选择交牌方向')
            .set('ai', () => 0).forResult();
          direction = result.control;
        }
        if (!choices.includes(direction)) return;
        const giver = direction === '交给对方' ? player : target;
        const receiver = giver === player ? target : player;
        const selected = await giver.chooseCard('he', 1, true)
          .set('prompt', '德信：交给' + get.translation(receiver) + '一张牌')
          .set('ai', card => (get.tag(card, 'damage') ? 0 : 8) - get.value(card))
          .forResult();
        const card = selected.cards?.[0];
        if (!selected.bool || !card || !giver.getCards('he').includes(card) || !giver.isIn() || !receiver.isIn()) return;

        // These are properties of the offered card before its owner/zone changes.
        const snapshot = { damage: !!get.tag(card, 'damage'), name: get.name(card, giver), nature: get.nature(card, giver) };
        const state = stateOf(phase, player, true);
        state.used++;
        await giver.give(card, receiver);
        if (snapshot.damage) {
          const count = Math.min(Math.max(0, giver.hp), giver.countCards('h'));
          if (count > 0 && giver.isIn()) {
            await giver.chooseToDiscard('h', count, true).set('prompt', '德信：弃置等同于当前体力值的手牌（不足则全部弃置）');
          }
          if (!giver.isIn() || !receiver.isIn()) return;
          const virtual = { name: snapshot.name, suit: 'none', color: 'none', number: null, isCard: true };
          if (snapshot.name === 'sha') virtual.nature = snapshot.nature;
          // Native canUse(false, false) skips range/use count only; prohibitions,
          // card enable checks, target filters and multicheck remain effective.
          if (!giver.canUse(virtual, receiver, false, false)) return;
          const use = giver.useCard(virtual, [receiver], false);
          // Native useCard can run a card's changeTarget synchronously. The rule
          // starts with precisely the recipient; later skill target changes work.
          use.targets = [receiver];
          uses.add(use);
          await use;
        } else {
          state.limit = 2;
          if (giver.isIn()) await giver.draw(2);
          if (receiver.isIn()) await receiver.draw(2);
          if (player.isIn()) {
            const jacks = randomJacks();
            if (jacks.length) await player.gain(jacks, 'gain2');
          }
        }
      },
      ai: {
        order: 7,
        result: { target(player, target) { return get.attitude(player, target); } },
      },
    },
    [EFFECT]: {
      charlotte: true,
      forced: true,
      silent: true,
      popup: false,
      forceDie: true,
      forceOut: true,
      trigger: { global: ['damageBegin1', 'damageAfter'] },
      filter(event, player, name) {
        if (event.player !== player || !relatedDamage(event)) return false;
        return name === 'damageBegin1' ? !increased.has(event) : !paid.has(event) && !!event.source?.isIn();
      },
      async content(event, trigger) {
        if (event.triggername === 'damageBegin1') {
          if (!increased.has(trigger)) {
            increased.add(trigger);
            trigger.num++;
          }
        } else if (!paid.has(trigger) && trigger.num > 0 && !trigger.unreal && trigger.source?.isIn()) {
          paid.add(trigger);
          await trigger.source.loseHp(1);
        }
      },
    },
  };

  function install() {
    game.addGlobalSkill(EFFECT);
  }
  api.dexin = { install };
  return {
    skills,
    translate: {
      [ID]: '德信',
      [EFFECT]: '德信',
      [ID + '_info']: '出牌阶段限一次，你可以交给一名其他角色一张牌，或令一名其他角色交给你一张牌（由给牌者从手牌和装备区选择）。若此牌为伤害牌，给牌者弃置等同于其当前体力值的手牌（不足则全部弃置），然后视为对获牌者使用一张同名牌（若为【杀】，属性相同），此牌无色无点数、无距离和次数限制且不计入次数，其每次伤害+1，每次造成伤害后，伤害来源失去1点体力；否则双方各摸两张牌，你从牌堆中随机获得两张J（不足则从弃牌堆补足），本出牌阶段此技能改为限两次。',
    },
  };
},
function (lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wuyanghu_huangshi';
  const TAG = 'visible_' + ID;
  const useStates = new WeakMap();
  const compareStates = new WeakMap();
  const active = player => !!player?.hasSkill(ID);
  const shown = player => player.getShownCards();
  function comparison(event) {
    if (!event) return null;
    if (event.name === 'chooseToCompareEffect') return event.parentEvent || event;
    if (event.name?.startsWith('chooseToCompare') && event.name !== 'chooseToCompareLose') return event;
    const parent = event.relatedEvent || event.getParent?.();
    return parent && parent !== event ? comparison(parent) : null;
  }
  function participants(root) {
    const entries = new Map();
    for (const [player, cards] of root.lose_list || []) if (cards?.[0]) entries.set(player, cards[0]);
    if (root.card1 && (root.player || root.tempplayer)) entries.set(root.player || root.tempplayer, root.card1);
    if (root.cardlist && root.targets) root.targets.forEach((p, i) => entries.set(p, root.cardlist[i]));
    else if (root.card2 && get.itemtype(root.target) === 'player') entries.set(root.target, root.card2);
    return entries;
  }
  function snapshotCompare(root) {
    if (!root || compareStates.has(root)) return;
    const entries = participants(root);
    if (!entries.size) return;
    // Capture every participant before the first material leaves hand. In a
    // multiple comparison the qualifying player can be a later target.
    compareStates.set(root, [...entries].filter(([p, c]) => active(p) && get.number(c, p) === 11).map(([p]) => p));
  }
  function forceTie(event) {
    event.num1 = event.num2 = 11;
    delete event.forceWinner;
    event.winner = null;
    if (event.compareMeanwhile) event.maxNum = 11;
    const result = event.result;
    if (!result) return;
    for (const key of ['num1', 'num2']) {
      if (Array.isArray(result[key])) result[key] = (event.targets || result[key]).map(() => 11);
      else result[key] = 11;
    }
    if (event.compareMeanwhile) result.winner = null;
    else delete result.winner;
    result.bool = false;
    result.tie = true;
  }
  const skills = {
    [ID]: {
      locked: true, forced: true,
      trigger: { global: 'phaseUseBegin' },
      group: [ID + '_effect'],
      filter(event, player) { return active(player) && player.countCards('h') > 0; },
      async content(event, trigger, player) {
        const result = await player.chooseCard('h', [0, 1], '煌势：你可以明置一张手牌（直至其离开手牌区）')
          .set('ai', card => get.is.shownCard(card) ? 0 : 7 - get.value(card)).forResult();
        const card = result.cards?.[0];
        if (result.bool && card && player.getCards('h').includes(card)) await player.addShownCards([card], TAG);
      },
      mod: {
        cardnumber(card, player, number) {
          if (!active(player)) return;
          if (shown(player).includes(card)) return 11;
          // Native get.number inherits only when the virtual card does not
          // declare number at all. Explicit null and multi-material cards
          // keep their native no-number result.
          if (!('number' in card) && card.cards?.length === 1 && number !== null && shown(player).includes(card.cards[0])) return 11;
        },
      },
      ai: { threaten: 1.7 },
    },
    [ID + '_effect']: {
      charlotte: true, forced: true, popup: false,
      trigger: { player: 'useCardToPlayered' },
      filter(event, player) {
        const use = event.getParent('useCard');
        return active(player) && event.target !== player && useStates.get(use)?.jack && !useStates.get(use).applied;
      },
      async content(event, trigger, player) {
        const use = trigger.getParent('useCard');
        const state = useStates.get(use);
        state.applied = true;
        state.count = Math.min(3, shown(player).length);
        if (state.count) {
          player.logSkill(ID);
          use.effectCount += state.count;
        }
      },
    },
    [ID + '_snapshot']: {
      charlotte: true, forced: true, silent: true, popup: false,
      firstDo: true, priority: Infinity,
      trigger: { global: ['useCardBefore', 'loseAsyncBefore', 'loseBefore', 'compareCardShowBefore'] },
      filter(event, player) {
        if (!active(player)) return false;
        if (event.name === 'useCard') return event.player === player;
        return !!comparison(event);
      },
      async content(event, trigger, player) {
        if (trigger.name === 'useCard') useStates.set(trigger, { jack: get.number(trigger.card, player) === 11, applied: false });
        else snapshotCompare(comparison(trigger));
      },
    },
    [ID + '_compare']: {
      charlotte: true, forced: true, popup: false,
      lastDo: true, priority: -Infinity,
      trigger: { global: 'compareFixing' },
      filter(event, player) {
        const qualified = compareStates.get(comparison(event)) || [];
        return qualified.find(active) === player;
      },
      async content(event, trigger, player) {
        player.logSkill(ID);
        forceTie(trigger);
      },
    },
  };
  let installed = false;
  function install() {
    if (installed) return;
    installed = true;
    const nativeAutoViewAs = get.autoViewAs;
    get.autoViewAs = function (card, cards, owner) {
      const result = nativeAutoViewAs.apply(this, arguments);
      // Player.useCard calls autoViewAs without owner. Native VCard then
      // freezes the physical printed number for a one-card conversion,
      // before useCardBefore can recover whether that number was inherited.
      // Resolve only genuinely inherited numbers while the source still
      // exists, and let explicit numbers/null and owner=false remain native.
      if (owner !== false && card && typeof card === 'object' && !('number' in card)) {
        const materials = Array.isArray(cards) ? cards : card.cards;
        if (materials?.length === 1) {
          const player = owner || get.owner(materials[0]);
          if (active(player) && shown(player).includes(materials[0])) {
            const number = get.number({ ...card, cards: materials }, player);
            if (number === 11) result.number = number;
          }
        }
      }
      return result;
    };
    game.addGlobalSkill(ID + '_snapshot');
    game.addGlobalSkill(ID + '_compare');
  }
  api.huangshi = { install };
  return { skills, translate: {
    [ID]: '煌势',
    [ID + '_effect']: '煌势',
    [ID + '_compare']: '煌势',
    [TAG]: '煌势',
    [ID + '_info']: '锁定技，你的明置手牌点数视为J。每名角色的出牌阶段开始时，你可以明置一张手牌，直至其离开手牌区。你使用J牌指定其他角色为目标时，该牌额外结算X次（X为此时你剩余的明置手牌数，至多为3）。你以J牌参与拼点时，此次拼点均视为平局。',
  } };
},
function (lib, game, ui, get, ai, _status, api) {
  const ID = 'bjgy_wuyanghu_mingxian';
  const TAG = 'visible_bjgy_wuyanghu_mingxian';
  const stages = new Map();
  const exposed = new Map();
  const synced = new WeakSet();
  const targeted = new WeakSet();
  let installed = false;

  function phaseUseOf(event) {
    const seen = new Set();
    while (event && !seen.has(event)) {
      if (event.name === 'phaseUse') return event;
      seen.add(event);
      event = event.parent || event.getParent?.();
    }
    return null;
  }

  function inPlay(player) {
    return Boolean(player && !player.removed && (!player.isIn || player.isIn()));
  }

  async function syncShown() {
    const eligible = new Map();
    for (const player of stages.values()) {
      if (inPlay(player)) for (const card of player.getCards('h')) eligible.set(card, player);
    }
    // Explicit card lists also clean cards that have left their old hand.
    // Never remove another skill's visible_ tag.
    for (const [card, player] of exposed) {
      if (eligible.get(card) !== player) {
        player.removeGaintag(TAG, [card]);
        exposed.delete(card);
      }
    }
    const pending = new Map();
    for (const [card, player] of eligible) {
      exposed.set(card, player);
      if (card.hasGaintag(TAG)) continue;
      if (!pending.has(player)) pending.set(player, []);
      pending.get(player).push(card);
    }
    for (const [player, cards] of pending) await player.addShownCards(cards, TAG);
  }

  function eligibleTarget(event, player) {
    const phase = phaseUseOf(event);
    const target = event.target;
    return stages.get(phase) === player && inPlay(player) && inPlay(target) && target !== player &&
      get.color(event.card, player) === 'black' && target.countCards('h') > player.countCards('h');
  }

  function install() {
    if (installed) return;
    installed = true;
    game.addGlobalSkill(ID + '_shown');
    game.addGlobalSkill(ID + '_discard');
  }

  const skills = {
    [ID]: {
      enable: 'phaseUse', limited: true,
      skillAnimation: true, animationColor: 'orange',
      filter(event, player) {
        const phase = phaseUseOf(event);
        return Boolean(inPlay(player) && !player.storage?.[ID] && phase && phase.player === player);
      },
      async content(event, trigger, player) {
        const phase = phaseUseOf(event);
        if (!phase || phase.player !== player || !inPlay(player) || player.storage?.[ID]) return;
        install();
        player.storage[ID] = true;
        player.awakenSkill(ID);
        stages.set(phase, player);
        // Attach to the exact phase, not a temporary skill expiring on the
        // next phaseUseAfter. Nested phases must not end this effect. The
        // cleanup has no player so death, removal or being out cannot skip it.
        phase.insertAfter(async function () {
          stages.delete(phase);
          await syncShown();
        }, {});
        await syncShown();
      },
      ai: { order: 9, result: { player: 1 }, threaten: 1.5 },
    },
    [ID + '_shown']: {
      trigger: { global: ['gainAfter', 'loseAfter', 'loseAsyncAfter', 'equipAfter', 'addJudgeAfter', 'addToExpansionAfter', 'hideShownCardsAfter', 'dieAfter'] },
      forced: true, charlotte: true, silent: true, popup: false,
      firstDo: true, priority: 100000, forceDie: true, forceOut: true,
      filter(event) { return (stages.size > 0 || exposed.size > 0) && !synced.has(event); },
      async content(event, trigger) {
        if (synced.has(trigger)) return;
        synced.add(trigger);
        await syncShown();
      },
    },
    [ID + '_discard']: {
      trigger: { player: 'useCardToPlayered' },
      forced: true, charlotte: true, popup: false,
      filter(event, player) { return !targeted.has(event) && eligibleTarget(event, player); },
      async content(event, trigger, player) {
        // Native effectCount returns to card resolution after the target
        // declaration steps; each original declaration has one event here.
        if (targeted.has(trigger) || !eligibleTarget(trigger, player)) return;
        targeted.add(trigger);
        await player.discardPlayerCard({ target: trigger.target, position: 'he', selectButton: 1, forced: true });
      },
    },
  };
  const translate = {
    [ID]: '明贤',
    [ID + '_info']: '限定技。出牌阶段，你可以令本阶段你的所有手牌始终明置（包括此后获得的手牌）。本阶段你使用黑色牌指定其他角色为目标后，若其手牌数大于你，你弃置其一张牌。',
    [ID + '_discard']: '明贤',
    [TAG]: '明贤',
  };
  api.mingxian = { install, tag: TAG };
  return { skills, translate };
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills));
 const translate=Object.assign({},...modules.map(module=>module.translate));
 let scheduled=false;
 return {
  name:'武羊祜',editable:true,connect:false,
  async content(){
   if(scheduled)return;scheduled=true;
   (lib.arenaReady??=[]).push(function installWuyanghu(){
    api.dexin.install();api.huangshi.install();api.mingxian.install();
   });
  },
  async precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_wuyanghu:['male','qun',3,['bjgy_wuyanghu_dexin','bjgy_wuyanghu_huangshi','bjgy_wuyanghu_mingxian'],['die:false','ext:自制武庙/bjgy_wuyanghu.jpg']]},
    translate:{bjgy_wuyanghu:'武羊祜'},characterIntro:{bjgy_wuyanghu:'武羊祜，群、男性、初始体力3，体力上限3。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由设计者提供。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'武羊祜：群、男、3/3。德信、煌势、明贤。面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_wuyanghu.jpg'],card:[],skill:[],audio:[]}
 };
})(lib,game,ui,get,ai,_status),
(function(lib,game,ui,get,ai,_status){
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
   character:{character:{bjgy_wuduyu:['male','qun',4,['bjgy_wuduyu_pozhu','bjgy_wuduyu_bocai','bjgy_wuduyu_beixian'],['die:false','ext:自制武庙/bjgy_wuduyu.jpg']]},
    translate:{bjgy_wuduyu:'武杜预'},characterIntro:{bjgy_wuduyu:'武杜预，群、男性、初始体力4，体力上限4。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由设计者提供。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'武杜预：群、男、4/4。破竹、博才、备贤。面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_wuduyu.jpg'],card:[],skill:[],audio:[]}
 };
})(lib,game,ui,get,ai,_status)];
 const merge=(objects)=>{
  const result={};
  for(const object of objects)for(const [key,value]of Object.entries(object||{})){
   if(Object.prototype.hasOwnProperty.call(result,key))throw new Error('自制武庙：重复登记 '+key);
   result[key]=value;
  }
  return result;
 };
 const character={};
 for(const key of ['character','translate','characterIntro','characterSubstitute','dynamicTranslate'])character[key]=merge(parts.map(part=>part.package.character[key]));
 const skills=merge(parts.map(part=>part.package.skill.skill));
 const translate=merge(parts.map(part=>part.package.skill.translate));
 const portraits=parts.flatMap(part=>part.files.character);
 return {
  name:'自制武庙',editable:true,connect:false,
  async content(...args){for(const part of parts)if(part.content)await part.content.apply(this,args);},
  async precontent(...args){for(const part of parts)if(part.precontent)await part.precontent.apply(this,args);},
  help:{},config:{},
  package:{character,card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'武段颎、武张辽、武周瑜、武吕蒙、武邓艾、武王濬、武羊祜、武杜预八将整合包，面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'1.0.0'},
  files:{character:portraits,card:[],skill:[],audio:[]}
 };
});
