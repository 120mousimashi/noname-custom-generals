// 谋黄忠 v0.1.0 测试版。设计：辟境归元；实现与打包：OpenAI Codex协助。
// 原创代码见LICENSE，参考的本体接口适用原有许可。
game.import("extension", function(lib, game, ui, get, ai, _status) {
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
                character: {bjgy_mouhuangzhong: ["male", "shu", 5, ["bjgy_mhz_liedi", "bjgy_mhz_cuifeng"], ["die:false", "ext:谋黄忠/bjgy_mouhuangzhong.jpg"]]},
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
});
