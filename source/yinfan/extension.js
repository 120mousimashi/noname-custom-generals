game.import("extension", function(lib, game, ui, get, ai, _status) {
    "use strict";
    return {
        name: "隐蕃",
        editable: true,
        connect: false,
        content: function(config, pack) {},
        precontent: function() {},
        help: {},
        config: {},
        package: {
            character: {
                character: {"bjgy_yinfan":["male","wu",3,["结交","构间"],["die:false","ext:隐蕃/bjgy_yinfan.jpg"]]},
                translate: {"bjgy_yinfan":"隐蕃"}
            },
            card: {card:{}, translate:{}, list:[]},
            skill: {
                skill: {
                    "结交": {
    enable: "phaseUse",
    usable: 1,
    filterTarget(card, player, target) {
        return target !== player && target.isIn();
    },
    async content(event, trigger, player) {
        const target = event.target;
        const ownDraw = player.draw(2);
        const targetDraw = target.draw(2);
        await Promise.all([ownDraw, targetDraw]);
        if (!player.isIn() || !target.isIn()) return;

        // 只记录结交这一次摸到的牌，不合并自书等技能另摸的牌。
        const drawn = (targetDraw.result?.cards || []).slice();
        let given = false;
        if (target.countCards("he", card => lib.filter.canBeGained(card, player, target)) >= 3) {
            const result = await target.chooseToGive(player, 3, "he", false)
                .set("prompt", "结交：交给" + get.translation(player) + "三张牌，或取消并标记本次摸到的牌")
                .set("prompt2", "可以交手牌或装备牌；取消则将本次摸到且仍在手牌区的牌标记为“谊”。")
                .set("ai", function(card) {
                    const evt = _status.event;
                    return (get.attitude(evt.player, evt.target) > 0 ? 7 : 3.5) - get.value(card, evt.player);
                })
                .forResult();
            given = result.bool && result.cards?.length === 3;
        }
        if (given || !target.isIn() || !drawn.length) return;
        // 已经离手又回手的原摸牌，也不重新补上“谊”。
        const gain = targetDraw.childEvents.find(evt => evt.name === "gain" && evt.player === target);
        if (!gain) return;
        const history = game.getAllGlobalHistory("everything");
        const index = history.indexOf(gain);
        if (index < 0) return;
        const leftHand = new Set();
        for (const evt of history.slice(index + 1)) {
            if (evt.name === "lose" && evt.player === target) {
                for (const card of evt.hs || []) leftHand.add(card);
            }
        }
        const hand = target.getCards("h");
        const cards = drawn.filter(card => hand.includes(card) && !leftHand.has(card));
        if (cards.length) {
            target.addGaintag(cards, "谊");
            game.log(target, "将本次摸到的", get.cnNumber(cards.length), "张牌标记为“谊”");
        }
    },
    ai: {
        order: 7,
        result: {
            player: 2,
            target(player, target) {
                return get.attitude(player, target) > 0 ? 1 : -1;
            }
        }
    }
},
                    "构间": {
    trigger: {
        global: [
            "loseAfter", "equipAfter", "addJudgeAfter",
            "gainAfter", "loseAsyncAfter", "addToExpansionAfter"
        ]
    },
    direct: true,
    getIndex(event, player) {
        return game.filterPlayer(function (target) {
            const loss = event.getl?.(target);
            return loss?.hs?.some(function (card) {
                return loss.gaintag_map?.[card.cardid]?.includes("谊");
            });
        }).sortBySeat();
    },
    filter(event, player, name, target) {
        return !!target?.isIn();
    },
    async content(event, trigger, player) {
        const target = event.indexedData;
        if (!target?.isIn()) return;
        const controls = ["造成1点伤害"];
        if (target.countDiscardableCards(player, "he") > 0) {
            controls.push("弃置两张牌");
        }
        controls.push("cancel2");
        const result = await player.chooseControl(controls)
            .set("prompt", "构间：你可以对" + get.translation(target) + "造成1点伤害，或弃置其两张牌")
            .set("构间目标", target)
            .set("ai", function () {
                const evt = _status.event;
                const target = evt.构间目标;
                if (get.damageEffect(target, evt.player, evt.player) > 0) return 0;
                if (evt.controls.includes("弃置两张牌") && get.attitude(evt.player, target) < 0) return 1;
                return evt.controls.length - 1;
            }).forResult();
        if (!target.isIn()) return;
        if (result.control === "造成1点伤害") {
            player.logSkill("构间", target);
            await target.damage({ num: 1, source: player, nocard: true });
        } else if (result.control === "弃置两张牌" && controls.includes("弃置两张牌")) {
            const num = Math.min(2, target.countDiscardableCards(player, "he"));
            if (!num) return;
            player.logSkill("构间", target);
            await player.discardPlayerCard(target, "he", num, true);
        }
    }
}
                },
                translate: {"结交":"结交","结交_info":"出牌阶段限一次，你可以和一名其他角色各摸两张牌，该角色须交给你三张牌，否则其本次摸到牌标记为“谊”。","构间":"构间","构间_info":"有角色失去“谊”时，你可以对其造成一点伤害或者弃置其两张牌。"}
            },
            intro: "原创武将隐蕃，包含技能〖结交〗、〖构间〗。适配无名杀1.11.6。",
            author: "辟境归元",
            diskURL: "",
            forumURL: "",
            version: "1.0.0"
        },
        files: {character:["bjgy_yinfan.jpg"], card:[], skill:[], audio:[]}
    };
});
