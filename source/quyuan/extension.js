game.import("extension", function(lib, game, ui, get, ai, _status) {
    "use strict";
    return {
        name: "自制屈原",
        editable: true,
        connect: false,
        content: function(config, pack) {},
        precontent: function() {},
        config: {},
        help: {},
        package: {
            character: {
                character: {"bjgy_quyuan":["male","qun",3,["裁荷","作辞"],["die:false","ext:自制屈原/bjgy_quyuan.jpg"]]},
                translate: {"bjgy_quyuan":"屈原"}
            },
            card: {card:{}, translate:{}, list:[]},
            skill: {
                skill: {
                    "裁荷": {
    locked: true,
    forced: true,
    popup: false,
    trigger: {player: "useCard1"},
    group: ["裁荷_置入", "裁荷_减伤", "裁荷_目标", "裁荷_酒"],
    mark: true,
    marktext: "荷",
    intro: {
        content(storage, player) {
            const names = {spade: "黑桃", heart: "红桃", club: "梅花", diamond: "方块", none: "无花色"};
            const suits = lib.skill.裁荷.suitsOf(player);
            const record = player.storage.裁荷摸牌;
            const used = record && record.turn === game.phaseNumber ? record.suits : [];
            return "装备区花色：" + (suits.map(s => names[s]).join("、") || "无牌") +
                "<br>当前花色数：" + suits.length +
                "<br>本回合已触发摸牌：" + (used.map(s => names[s]).join("、") || "无");
        }
    },
    suitOf(card, player) {
        const suit = get.suit(card, player);
        if (lib.suits.includes(suit)) return suit;
        const cards = card.cards;
        if (cards && cards.length > 1) {
            const first = get.suit(cards[0], player);
            if (lib.suits.includes(first) && cards.every(c => get.suit(c, player) === first)) return first;
        }
        return "none";
    },
    suitsOf(player) {
        return [...new Set(player.getCards("e").map(c => lib.skill.裁荷.suitOf(c, player)))];
    },
    countFor(card, player) {
        let event = get.event();
        while (event) {
            if (event.name === "useCard" && event.player === player && event.card === card &&
                typeof event.裁荷花色数 === "number") return event.裁荷花色数;
            const parent = event.getParent ? event.getParent() : null;
            if (parent === event) break;
            event = parent;
        }
        return lib.skill.裁荷.suitsOf(player).length;
    },
    realBasic(event) {
        if (!event.card || !get.is.ordinaryCard(event.card) || event.cards.length !== 1) return null;
        const card = event.cards[0];
        if (get.type(event.card, null, false) !== "basic" || get.type(card, null, false) !== "basic") return null;
        if (event.card.name !== card.name || (get.nature(event.card, false) || "") !== (get.nature(card, false) || "")) return null;
        return card;
    },
    slotsOf(player) {
        return [1, 2, 3, 4, 5].filter(i => player.hasEquipableSlot(i));
    },
    collectable(event, player) {
        const parent = event.getParent();
        const use = parent && parent.relatedEvent;
        if (!parent || parent.name !== "orderingDiscard" || !use || use.name !== "useCard" || use.player !== player || use.裁荷已置入) return null;
        const card = use.裁荷实体;
        if (!card || !event.cards.includes(card) || get.position(card, true) !== "d") return null;
        if (!lib.skill.裁荷.slotsOf(player).length) return null;
        return card;
    },
    firstDamage(event, player) {
        return game.getGlobalHistory("everything", e => e.name === "damage" && e.player === player, event)[0] === event;
    },
    canAdd(event, player, target) {
        if (event.targets.includes(target) || !target.isIn()) return false;
        if (!lib.filter.targetEnabled2(event.card, player, target)) return false;
        if (event.card.name === "tao") return target.isDamaged();
        if (event.card.name === "jiu") return true;
        return event.裁荷花色数 >= 4 || lib.filter.targetInRange(event.card, player, target);
    },
    async content(event, trigger, player) {
        const info = lib.skill.裁荷;
        const suits = info.suitsOf(player);
        const count = suits.length;
        trigger.裁荷花色数 = count;
        trigger.裁荷实体 = info.realBasic(trigger);
        if (count >= 3 && get.type(trigger.card, null, false) === "basic") {
            trigger.baseDamage = (typeof trigger.baseDamage === "number" ? trigger.baseDamage : 1) + 1;
        }
        if (count >= 4) {
            for (const target of game.players) {
                if (!trigger.directHit.includes(target)) trigger.directHit.push(target);
            }
            if (trigger.addCount !== false) {
                trigger.addCount = false;
                const stat = player.getStat().card;
                if (typeof stat[trigger.card.name] === "number") stat[trigger.card.name]--;
            }
        }
        const suit = info.suitOf(trigger.card, player);
        let record = player.storage.裁荷摸牌;
        if (!record || record.turn !== game.phaseNumber) {
            record = {turn: game.phaseNumber, suits: []};
            player.storage.裁荷摸牌 = record;
        }
        if (count >= 2 && suits.includes(suit) && !record.suits.includes(suit)) {
            record.suits.push(suit);
            player.syncStorage("裁荷摸牌");
            player.markSkill("裁荷");
            await player.draw();
        }
    },
    mod: {
        cardEnabled(card, player) {
            if (get.type(card, null, player) === "equip") return false;
        },
        cardUsable(card, player) {
            if (lib.skill.裁荷.countFor(card, player) >= 4) return Infinity;
        },
        targetInRange(card, player, target) {
            if (lib.skill.裁荷.countFor(card, player) >= 4) return true;
        }
    },
    async wineContent(event, trigger, player) {
        const target = event.target;
        const num = typeof event.baseDamage === "number" ? event.baseDamage : 1;
        if (target.isDying()) {
            await target.recover(num);
            const use = event.getParent();
            if (target === player && _status.currentPhase === player && use.addCount !== false) {
                const stat = player.getStat().card;
                if (typeof stat.jiu === "number") stat.jiu--;
            }
            return;
        }
        target.storage.jiu = (target.storage.jiu || 0) + num;
        game.addVideo("jiuNode", target, true);
        game.broadcastAll(function(target) {
            target.addSkill("jiu");
            if (!target.node.jiu && lib.config.jiu_effect) {
                target.node.jiu = ui.create.div(".playerjiu", target.node.avatar);
                target.node.jiu2 = ui.create.div(".playerjiu", target.node.avatar2);
            }
        }, target);
    },
    subSkill: {
        置入: {
            trigger: {global: "cardsDiscardAfter"},
            forced: true,
            popup: false,
            filter(event, player) {
                return !!lib.skill.裁荷.collectable(event, player);
            },
            async content(event, trigger, player) {
                const card = lib.skill.裁荷.collectable(trigger, player);
                if (!card) return;
                const use = trigger.getParent().relatedEvent;
                const controls = lib.skill.裁荷.slotsOf(player).map(i => "equip" + i);
                const result = await player.chooseControl(controls)
                    .set("prompt", "裁荷：将" + get.translation(card) + "置入一个装备栏（可以替换）")
                    .set("ai", () => {
                        const p = get.player();
                        const slot = [5, 3, 4, 2, 1].find(i => p.hasEmptySlot(i));
                        return slot ? "equip" + slot : get.event().controls[0];
                    }).forResult();
                if (!controls.includes(result.control) || get.position(card, true) !== "d") return;
                const vcard = get.autoViewAs({name: card.name, nature: card.nature}, [card]);
                vcard.subtypes = [result.control];
                if (!player.canEquip(vcard, true)) return;
                use.裁荷已置入 = true;
                player.logSkill("裁荷");
                await player.equip(vcard);
            }
        },
        减伤: {
            trigger: {player: "damageBegin4"},
            direct: true,
            locked: true,
            filter(event, player) {
                return event.num > 0 && lib.skill.裁荷.suitsOf(player).length >= 1 &&
                    player.countCards("h", c => lib.filter.cardDiscardable(c, player, "裁荷")) > 0 &&
                    lib.skill.裁荷.firstDamage(event, player);
            },
            async content(event, trigger, player) {
                const result = await player.chooseToDiscard("h", 1,
                    "裁荷：是否弃置一张手牌，令首次伤害-1？")
                    .set("filterCard", c => lib.filter.cardDiscardable(c, get.player(), "裁荷"))
                    .set("ai", c => get.event().getParent().getTrigger().num > 0 ? 8 - get.value(c) : 0)
                    .forResult();
                if (result.bool) {
                    player.logSkill("裁荷");
                    trigger.num--;
                }
            }
        },
        目标: {
            trigger: {player: "useCard2"},
            direct: true,
            locked: true,
            filter(event, player) {
                const info = get.info(event.card);
                return event.裁荷花色数 >= 3 && get.type(event.card, null, false) === "basic" &&
                    !info.notarget && info.allowMultiple !== false && !info.multitarget &&
                    game.hasPlayer(target => lib.skill.裁荷.canAdd(event, player, target));
            },
            async content(event, trigger, player) {
                const result = await player.chooseTarget("裁荷：是否为" + get.translation(trigger.card) + "增加一个目标？",
                    function(card, player, target) {
                        const e = get.event();
                        return lib.skill.裁荷.canAdd({card: e.裁荷牌, targets: e.裁荷原目标, 裁荷花色数: e.裁荷层数}, player, target);
                    }).set("裁荷牌", trigger.card).set("裁荷原目标", trigger.targets.slice())
                    .set("裁荷层数", trigger.裁荷花色数)
                    .set("ai", target => get.effect(target, get.event().裁荷牌, get.player(), get.player()))
                    .forResult();
                if (result.bool && result.targets.length) {
                    player.logSkill("裁荷", result.targets);
                    trigger.targets.push(result.targets[0]);
                }
            }
        },
        酒: {
            trigger: {player: "jiuBefore"},
            forced: true,
            popup: false,
            filter(event, player) {
                const use = event.getParent();
                return use && use.name === "useCard" && use.player === player && use.裁荷花色数 >= 3;
            },
            content(event, trigger, player) {
                trigger.setContent(lib.skill.裁荷.wineContent);
            }
        }
    }
},
                    "作辞": {
    enable: "phaseUse",
    usable: 1,
    position: "he",
    selectCard: [1, Infinity],
    complexCard: true,
    // 自行弃置，才能在装备牌壳被引擎移除前保存原实体信息。
    discard: false,
    lose: false,
    实体牌(cards) {
        const result = [];
        for (const card of cards) {
            const originals = card.isViewAsCard
                ? card[card.cardSymbol]?.cards || card.cards || []
                : [card];
            for (const original of originals) {
                if (!result.includes(original)) result.push(original);
            }
        }
        return result;
    },
    字数等差(cards) {
        if (!cards.length) return false;
        if (cards.length < 3) return true;
        // 对牌名字符串求翻译，不使用含属性、花色及点数的卡牌显示名。
        const lengths = cards.map(card => Array.from(get.translation(get.name(card, false))).length)
            .sort((a, b) => a - b);
        const difference = lengths[1] - lengths[0];
        return lengths.every((length, index) => index === 0 || length - lengths[index - 1] === difference);
    },
    filter(event, player) {
        return player.getCards("he").some(card => get.info("作辞").filterCard(card, player));
    },
    filterCard(card, player) {
        const originals = get.info("作辞").实体牌([card]);
        return originals.length > 0 && lib.filter.cardDiscardable(card, player, "作辞") &&
            originals.every(original => lib.filter.cardDiscardable(original, player, "作辞"));
    },
    filterOk() {
        const info = get.info("作辞");
        // 中途不限制等差，只在确认时检查整个组合，避免点击顺序改变合法性。
        return info.字数等差(info.实体牌(ui.selected.cards || []));
    },
    check(card) {
        // 保守 AI：优先换掉一张低价值牌，避免无穷选牌范围下搜索所有子集。
        if (ui.selected.cards.length) return 0;
        const info = get.info("作辞");
        if (!info.字数等差(info.实体牌([card]))) return 0;
        return 6 - get.value(card);
    },
    async content(event, trigger, player) {
        const costs = event.cards || [];
        const originals = get.info("作辞").实体牌(costs);
        const number = originals.length;
        if (!number) return;
        // 在弃牌及摸牌触发任何其他事件前完成快照，延时锦囊归入锦囊。
        const typeCount = new Set(originals.map(card => get.type2(card, false))
            .filter(type => ["basic", "trick", "equip"].includes(type))).size;
        await player.discard(costs);
        await player.draw(number);
        if (game.hasPlayer(target => target.countDiscardableCards(player, "hej") > 0)) {
            const result = await player.chooseTarget(
                "作辞：弃置一名角色区域内的一张牌", true,
                (card, player, target) => target.countDiscardableCards(player, "hej") > 0
            ).set("ai", target => {
                const player = _status.event.player;
                return get.effect(target, { name: "guohe" }, player, player);
            }).forResult();
            const target = result.targets?.[0];
            if (target && target.countDiscardableCards(player, "hej") > 0) {
                await player.discardPlayerCard(target, "hej", true);
            }
        }
        if (typeCount >= 2) await player.draw(number);
        if (typeCount >= 3) {
            const stat = player.getStat("skill");
            if (stat["作辞"] > 0) stat["作辞"]--;
        }
    },
    ai: {
        order: 6,
        result: { player: 1 },
    },
}
                },
                translate: {"裁荷":"裁荷","作辞":"作辞","裁荷_info":"锁定技，你不能使用装备牌，你使用非虚拟非转化的基本牌结算完成后将这张牌置于任意一个装备栏内，根据你装备区花色数，你获得以下效果：不少于1种：每回合首次受到伤害时可以弃置一张手牌令本次伤害-1，不少于2种：你使用装备区包含的花色的牌时摸一张牌（每回合每种花色限一次），不少于3种：你使用基本牌的数值+1且可以额外指定一个目标，不少于4种：你使用牌无距离和次数限制且不能被响应。","作辞_info":"出牌阶段限一次，你可以弃置任意张牌名字数之差相等（等差数列）的牌，然后摸等量张牌并根据这些牌中包含的类型数执行以下效果：不少于1种：弃置一名角色区域内一张牌，不少于2种：再摸等量张牌，不少于3种：该技能视为未发动过"}
            },
            intro: "原创武将屈原，包含技能〖裁荷〗、〖作辞〗。适配无名杀1.11.6。",
            author: "辟境归元",
            diskURL: "",
            forumURL: "",
            version: "1.0.1"
        },
        files: {character:["bjgy_quyuan.jpg"], card:[], skill:[], audio:[]}
    };
});
