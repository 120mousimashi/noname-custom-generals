game.import("extension", function(lib, game, ui, get, ai, _status) {
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
                character: {"bjgy_wuduanjiong":["male","qun",5,["平羌","追剿","烈贤"],["die:false","ext:自制武段颎/bjgy_wuduanjiong.jpg"]]},
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
});
