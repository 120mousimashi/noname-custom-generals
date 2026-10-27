game.import("extension", function(lib, game, ui, get, ai, _status) {
    "use strict";
    return {
        name: "李牧",
        editable: true,
        connect: false,
        content: function(config, pack) {},
        precontent: function() {},
        help: {},
        config: {},
        package: {
            character: {
                character: {"bjgy_limu":["male","qun",4,["收保","飨士","连却"],["die:false","ext:李牧/bjgy_limu.jpg"]]},
                translate: {"bjgy_limu":"李牧"}
            },
            card: {card:{}, translate:{}, list:[]},
            skill: {
                skill: {
                    "收保": {
    trigger: {
        player: ["chooseToUseAfter", "chooseToRespondAfter"],
        global: ["_wuxieAfter", "useCardToBegin", "shaHit", "damageBefore", "gainBefore", "useCardToEnd"],
    },
    direct: true,
    lastDo: true,
    priority: -100,
    mark: true,
    marktext: "保",
    intro: {
        content(storage, player) {
            const limit = 1 + (player.storage.limu_shoubao_limit_bonus || 0);
            const used = player.storage.limu_shoubao_turn === game.phaseNumber
                ? (player.storage.limu_shoubao_used || 0) : 0;
            return "每回合可发动" + limit + "次，本回合已发动" + used + "次";
        },
    },
    hasInnerResponse(card) {
        return ["sha", "nanman", "wanjian", "juedou", "jiedao"].includes(get.name(card)) ||
            !!get.tag(card, "respondSha") || !!get.tag(card, "respondShan");
    },
    canRespond(card) {
        if (get.name(card) === "sha") return true;
        const info = get.info(card);
        return !!info.wuxieable || (get.type(card) === "trick" && info.wuxieable !== false) ||
            lib.skill["收保"].hasInnerResponse(card);
    },
    getUseEvent(event, card, source) {
        let current = event;
        const visited = new Set();
        while (current && !visited.has(current)) {
            visited.add(current);
            if (current.name === "useCard" && (!card || current.card === card) &&
                (!source || current.player === source)) return current;
            current = current.parent;
        }
        return null;
    },
    getContext(trigger, player, triggername) {
        const skill = lib.skill["收保"];
        const limit = 1 + (player.storage.limu_shoubao_limit_bonus || 0);
        if (player.storage.limu_shoubao_turn === game.phaseNumber &&
            (player.storage.limu_shoubao_used || 0) >= limit) return null;
        if (!player.isIn()) return null;
        let effect, use;
        if (triggername === "chooseToUseAfter" || triggername === "chooseToRespondAfter") {
            if (trigger.type === "wuxie" || trigger.result?.bool || !trigger.respondTo) return null;
            use = skill.getUseEvent(trigger.parent, trigger.respondTo[1], trigger.respondTo[0]);
        } else if (triggername === "_wuxieAfter") {
            effect = trigger._trigger;
            if (!effect || effect.name === "phaseJudge" || get.name(effect.card) === "wuxie") return null;
            use = skill.getUseEvent(effect, effect.card, effect.player);
            if (skill.hasInnerResponse(effect.card) && !effect._neutralized &&
                !effect.directHit && !effect.directHit2) return null;
        } else if (triggername === "useCardToBegin" || triggername === "shaHit") {
            effect = trigger;
            use = skill.getUseEvent(effect, effect.card, effect.player);
            if (triggername === "useCardToBegin" && skill.hasInnerResponse(effect.card) &&
                !effect.directHit && !effect.directHit2) return null;
        } else if (triggername === "damageBefore") {
            effect = trigger.parent;
            if (trigger.player !== player || !trigger.card || effect?.type !== "card" ||
                effect.card !== trigger.card || !skill.hasInnerResponse(effect.card)) return null;
            use = skill.getUseEvent(effect, trigger.card);
        } else if (triggername === "gainBefore" || triggername === "useCardToEnd") {
            effect = triggername === "useCardToEnd" ? trigger :
                trigger.getParent(current => current.type === "card" && current.name === "jiedao", true);
            if (!effect || effect.name !== "jiedao") return null;
            if (triggername === "gainBefore" && (trigger.parent !== effect || trigger.player !== effect.player)) return null;
            use = skill.getUseEvent(effect, effect.card, effect.player);
        } else return null;
        if (!use || use.player === player || !use.targets?.includes(player) || !skill.canRespond(use.card)) return null;
        if (effect && effect.target !== player && !(effect.multitarget && effect.targets?.includes(player))) return null;
        if (use._limu_shoubao_checked?.[player.playerid] || use._limu_shoubao_responded?.[player.playerid]) return null;
        return use;
    },
    filter(event, player, triggername) {
        return !!lib.skill["收保"].getContext(event, player, triggername);
    },
    async content(event, trigger, player) {
        const use = lib.skill["收保"].getContext(trigger, player, event.triggername);
        if (!use) return;
        use._limu_shoubao_checked ??= {};
        use._limu_shoubao_checked[player.playerid] = true;
        const result = await player.chooseBool("是否发动〖收保〗？")
            .set("prompt2", "摸两张牌，并令使用的下一张伤害牌伤害+1（可叠加）")
            .set("ai", () => true).forResult();
        if (!result.bool) return;
        if (player.storage.limu_shoubao_turn !== game.phaseNumber) {
            player.storage.limu_shoubao_turn = game.phaseNumber;
            player.storage.limu_shoubao_used = 0;
        }
        player.storage.limu_shoubao_used = (player.storage.limu_shoubao_used || 0) + 1;
        player.storage.limu_shoubao_damage = (player.storage.limu_shoubao_damage || 0) + 1;
        player.addSkill("收保_增伤");
        player.markSkill("收保");
        player.markSkill("收保_增伤");
        player.logSkill("收保");
        await player.draw(2);
    },
    group: ["收保_记录"],
    subSkill: {
        记录: {
            trigger: { player: ["useCard", "respond", "chooseToUseAfter", "chooseToRespondAfter"] },
            forced: true,
            silent: true,
            firstDo: true,
            priority: 100,
            filter(event, player) {
                if (!event.respondTo) return false;
                if (event.type === "wuxie" && ["chooseToUse", "chooseToRespond"].includes(event.name)) return false;
                return !["chooseToUse", "chooseToRespond"].includes(event.name) || !!event.result?.bool;
            },
            content(event, trigger, player) {
                if (!trigger.respondTo) return;
                if (trigger.type === "wuxie" && ["chooseToUse", "chooseToRespond"].includes(trigger.name)) return;
                const skill = lib.skill["收保"];
                const uses = new Set();
                const direct = skill.getUseEvent(trigger.parent, trigger.respondTo[1], trigger.respondTo[0]);
                if (direct) uses.add(direct);
                let current = trigger.parent;
                const visited = new Set();
                while (current && !visited.has(current)) {
                    visited.add(current);
                    if (current.name === "_wuxie" && current._info_map) {
                        const map = current._info_map._source || current._info_map;
                        const sourceUse = skill.getUseEvent(current.parent, map.card, map.player);
                        if (sourceUse) uses.add(sourceUse);
                    }
                    current = current.parent;
                }
                for (const use of uses) {
                    if (use.player === player || !use.targets?.includes(player)) continue;
                    use._limu_shoubao_responded ??= {};
                    use._limu_shoubao_responded[player.playerid] = true;
                }
            },
        },
        增伤: {
            charlotte: true,
            mark: true,
            marktext: "锋",
            intro: {
                content(storage, player) {
                    return "使用的下一张伤害牌伤害+" + (player.storage.limu_shoubao_damage || 0);
                },
            },
            trigger: { player: "useCard1" },
            forced: true,
            popup: false,
            firstDo: true,
            priority: 100,
            filter(event, player) {
                return (player.storage.limu_shoubao_damage || 0) > 0 && !!get.tag(event.card, "damage");
            },
            content(event, trigger, player) {
                const bonus = player.storage.limu_shoubao_damage || 0;
                delete player.storage.limu_shoubao_damage;
                trigger.baseDamage = (typeof trigger.baseDamage === "number" ? trigger.baseDamage : 1) + bonus;
                player.removeSkill("收保_增伤");
            },
        },
    },
},
                    "飨士": {
    enable: "phaseUse",
    usable: 1,
    position: "he",
    filter(event, player) {
        return player.hasCard(card => lib.filter.cardRecastable(card, player), "he");
    },
    filterCard(card, player) {
        return lib.filter.cardRecastable(card, player);
    },
    selectCard() {
        return [1, game.countPlayer()];
    },
    selectTarget() {
        return ui.selected.cards.length;
    },
    filterTarget(card, player, target) {
        return target.isIn();
    },
    complexCard: true,
    discard: false,
    lose: false,
    delay: false,
    multitarget: true,
    multiline: true,
    check(card) {
        return 6.5 - get.value(card);
    },
    async content(event, trigger, player) {
        const cards = event.cards.slice();
        const targets = event.targets.slice();
        await player.recast(cards);
        targets.sortBySeat();
        for (const target of targets) {
            if (target.isIn()) await target.draw(2);
        }
        if (targets.length >= 2) {
            const bonus = player.storage.limu_shoubao_limit_bonus;
            player.storage.limu_shoubao_limit_bonus =
                (typeof bonus === "number" && Number.isFinite(bonus) ? bonus : 0) + 1;
            player.markSkill("飨士");
            player.addSkill("飨士_无应");
        }
    },
    intro: {
        content(storage, player) {
            return "本局游戏〖收保〗每回合可发动次数上限：" +
                (1 + (player.storage.limu_shoubao_limit_bonus || 0)) + "次";
        },
    },
    ai: {
        order: 7,
        result: {
            target: 1,
        },
    },
    subSkill: {
        无应: {
            charlotte: true,
            mark: true,
            marktext: "飨",
            intro: { content: "下一张使用的牌不能被响应" },
            trigger: { player: "useCard1" },
            forced: true,
            popup: false,
            firstDo: true,
            priority: 100,
            content(event, trigger, player) {
                trigger.directHit.addArray(game.filterPlayer());
                player.removeSkill("飨士_无应");
            },
        },
    },
},
                    "连却": {
    audio: false,
    trigger: {
        target: "shaMiss",
        global: "eventNeutralized",
    },
    direct: true,
    lastDo: true,
    priority: -Infinity,
    filter(event, player, name) {
        if (event.type !== "card" || !event.player || event.player === player || !event.player.isIn()) return false;
        if (name === "shaMiss") {
            // 最后处理：贯石斧若已强中，shaMiss 会被取消或结果已改为 false。
            if (!event.responded?.bool || !event._result?.bool) return false;
            if (event._result.result !== "shaned" && !game.hasNature(event.card, "stab")) return false;
        } else {
            if (!event._neutralized || event._neutralize_event?.player !== player) return false;
        }
        return player.hasCard(card => !get.info(card, player)?.notarget && player.canUse(card, event.player, false, false), "h");
    },
    async content(event, trigger, player) {
        const source = trigger.player;
        await player.chooseToUse({
            position: "h",
            prompt: `连却：是否对${get.translation(source)}使用一张手牌（无距离和次数限制）？`,
            连却来源: source,
            filterCard(card, player) {
                const source = _status.event.连却来源;
                // 只允许直接使用实体手牌，禁止此时发动其他技能转化。
                return get.itemtype(card) === "card" && player.getCards("h").includes(card) && source?.isIn() && !get.info(card, player)?.notarget && player.canUse(card, source, false, false);
            },
            filterTarget(card, player, target) {
                // 保留借刀杀人等牌的追加目标规则，但不进入次数/距离检查。
                const info = get.info(card, player);
                if (info.singleCard && !ui.selected.targets.length && target !== _status.event.连却来源) return false;
                if (info.singleCard && info.filterAddedTarget && ui.selected.targets.length) {
                    return !!info.filterAddedTarget(card, player, target, ui.selected.targets[ui.selected.targets.length - 1]);
                }
                return lib.filter.targetEnabled(card, player, target);
            },
            filterOk() {
                const card = get.card();
                if (card && get.info(card, _status.event.player)?.singleCard) {
                    return ui.selected.targets[0] === _status.event.连却来源;
                }
                return ui.selected.targets.includes(_status.event.连却来源);
            },
            targetRequired: true,
            complexSelect: true,
            complexTarget: true,
            addCount: false,
            addCount_extra: false,
            _skillChoice: [],
            logSkill: ["连却", source],
        });
    },
    ai: {
        threaten: 1.3,
    },
}
                },
                translate: {"收保":"收保","收保_info":"每回合限一次，其他角色对你使用牌时，若你没有响应此牌，你可以摸两张牌且使用的下一张伤害牌伤害+1（可叠加）。","飨士":"飨士","飨士_info":"出牌阶段限一次，你可以重铸任意张牌并令等量名角色摸两张牌，若本次摸牌的角色数不少于2，本局游戏“收保”每回合可发动的次数上限+1，且你使用的下一张牌不能被响应。","连却":"连却","连却_info":"你抵消其他角色的牌后，可以对其使用一张手牌（无距离和次数限制）。"}
            },
            intro: "原创武将李牧，群势力男性，4点体力，包含技能〖收保〗、〖飨士〗、〖连却〗。适配无名杀1.11.6。",
            author: "辟境归元",
            diskURL: "",
            forumURL: "",
            version: "1.0.0"
        },
        files: {character:["bjgy_limu.jpg"], card:[], skill:[], audio:[]}
    };
});
