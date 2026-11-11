// 魔笮融 v0.1.0 测试版。技能设计：恭喜我称地；原画署名：KayaK；代码实现：OpenAI Codex。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const api={}, factories=[function createGuifo(lib, game, ui, get, ai, _status, api) {
 const ID = '魔笮融_皈佛';
 const KEY = ID + '_state';
 const IDS = {main:ID, tracker:ID+'_tracker', bonus:ID+'_bonus', targets:ID+'_targets', deaths:ID+'_deaths',wine:ID+'_wine'};
 const deaths = new WeakMap();
 const seenGains = new WeakMap();
 const seenDamage = new WeakMap();
 const initialDrawGains = new WeakMap();
 function firstFor(map,event,player) {let set=map.get(event);if(!set){set=new WeakSet();map.set(event,set);}if(set.has(player))return false;set.add(player);return true;}
 function state(player) {
  if (!player.storage[KEY]) player.storage[KEY] = {
   reached:[false,false,false,false,true,false], removed:[false,false,false,false,false,false],
   gained:0,dealt:0,suffered:0,roundGained:0,roundDealt:0,roundStarted:(game.roundNumber||0)>0,killed:false,
  };
  return player.storage[KEY];
 }
 function isAllRemoved(player) { return state(player).removed.every(Boolean); }
 function reward(player,n) { return !!state(player).removed[n-1]; }
 function update(player) {
  const s=state(player);
  if(s.gained>=10)s.reached[1]=true;
  if(s.dealt>=3)s.reached[2]=true;
  if(s.dealt===s.suffered||s.killed)s.reached[4]=true;
  if(s.roundGained>=20&&s.roundDealt>=10)s.reached[5]=true;
  player.markSkill?.(ID);
 }
 function markPhaseBonus(event,player,cards) {
  const draw=event.getParent?.();
  const phase=draw?.name==='draw'&&draw.getParent?.();
  if(phase?.name==='phaseDraw'&&phase.player===player&&phase._guifoBaseDraw!=null)
   api.jingtu?.markGain(player,cards.slice(phase._guifoBaseDraw,phase._guifoBaseDraw+6));
 }
 function recordGain(event,player) {
  if (!event) return;
  // A nested gain may later be exposed by the enclosing loseAsyncAfter.
  if(event.name==='gain'&&event.getParent?.()?.name==='loseAsync')return;
  const cards=event.getg?.(player) || (event.player===player ? event.cards : null) || [];
  if(!cards.length)return;
  if(!firstFor(seenGains,event,player))return;
  const initial=event.getParent?.('gameDraw',true);
  if(initial?.name==='gameDraw'){
   let byPlayer=initialDrawGains.get(initial);if(!byPlayer)initialDrawGains.set(initial,byPlayer=new WeakMap());
   let counted=byPlayer.get(player);if(!counted)byPlayer.set(player,counted=new Set());
   for(const card of cards)counted.add(card);
  }
  // The gain event belongs directly to the phase's own draw event. Mark the
  // bonus cards before subsequent gain-triggered effects can move them away.
  markPhaseBonus(event,player,cards);
  const s=state(player);s.gained+=cards.length;s.roundGained+=cards.length;update(player);
 }
 function recordDamage(event,player) {
  if(!event||!(event.num>0)||event.unreal||event.cancelled||!firstFor(seenDamage,event,player))return;
  const s=state(player);
  if(event.source===player){s.dealt+=event.num;s.roundDealt+=event.num;}
  if(event.player===player)s.suffered+=event.num;
  update(player);
 }
 function nextIndex(player) { const s=state(player);return s.removed.findIndex(x=>!x); }
 function unlock(player) {
  const s=state(player), i=nextIndex(player);
  if(i<0||!s.reached[i])return -1;
  s.removed[i]=true;
  // Rewards are independent long-lived effects, not subskills of 皈佛.
  // Once acquired, disabling or losing the original skill does not erase them.
  player.addSkill?.([IDS.bonus,IDS.targets,IDS.deaths,IDS.wine]);
  player.markSkill?.(ID);
  return i;
 }
 function gainable(skill) {
  const info=get.info(skill);
  return !!info && !info.equipSkill&&!info.charlotte&&!info.hiddenSkill&&!info.zhuSkill &&
   !info.juexingji&&!info.limited&&!info.dutySkill&&!(info.unique&&!info.gainable);
 }
 function eligibleExtra(use,player,target) {
  if (!target?.isIn()||use.targets?.includes(target))return false;
  if(!lib.filter.targetEnabled2(use.card,player,target))return false;
  if(use.card.name==='tao')return target.isDamaged();
  if(use.card.name==='jiu')return true;
  return lib.filter.targetInRange(use.card,player,target);
 }
 api.guifo={state,isAllRemoved,ids:IDS,nextIndex,unlock,recordGain,recordDamage,update};
 return {skills:{
  [ID]:{
   audio:false, direct:true,
   init(player){state(player);},
   group:[IDS.tracker],
   trigger:{player:['phaseJieshuBegin','damageEnd'],source:'damageSource'},
   filter(event,player){return player.isIn() && (event.name==='phaseJieshu'||event.num>0);},
   content:[async function(event,trigger,player){
    const result=await player.chooseBool('皈佛：摸等同于体力上限的牌，然后检查当前第一项').set('ai',()=>true).forResult();
    if(!result.bool||!player.isIn())return;
    const num=Math.max(0,player.maxHp);
    if(num){const drawn=await player.draw({num,gaintag:['魔笮融_皈佛来源']}).forResult();api.jingtu?.markGain(player,drawn?.cards||[]);}
    if(!player.isIn())return;
    update(player);
    const index=unlock(player);
    if(index>=0){game.log(player,'完成了','#y皈佛','的第',get.cnNumber(index+1),'项');await player.loseMaxHp(1);}
   }],
   mark:true,
   intro:{content(storage,player){const s=state(player);return '当前首项：'+(nextIndex(player)+1)+'；已达成：'+s.reached.map((v,i)=>v?'①②③④⑤⑥'[i]:'').join('')+'；已删除：'+s.removed.map((v,i)=>v?'①②③④⑤⑥'[i]:'').join('');}},
  },
  [IDS.tracker]:{
   charlotte:true, forced:true, silent:true, firstDo:true, priority:100,
   trigger:{player:['phaseUseBegin','gainAfter','damageEnd'],source:'damageSource',global:['roundStart','gameDrawAfter','loseAsyncAfter','useCardToPlayered','dieAfter']},
   filter(event,player){return !!player&&player.isIn();},
   content:[async function(event,trigger,player){
    const s=state(player);
    if(event.triggername==='roundStart'){
     if(s.roundStarted){s.roundGained=0;s.roundDealt=0;}else s.roundStarted=true;
    }
    else if(event.triggername==='gameDrawAfter'&&trigger.targets?.includes(player)){
     const already=initialDrawGains.get(trigger)?.get(player);
     const cards=(player._start_cards||[]).filter(c=>!already?.has(c));
     s.gained+=cards.length;s.roundGained+=cards.length;
    }
    else if(trigger.name==='phaseUse'&&trigger.player===player)s.reached[0]=true;
    else if(trigger.name==='damage')recordDamage(trigger,player);
    else if(trigger.name==='gain'||trigger.name==='loseAsync')recordGain(trigger,player);
    else if(event.triggername==='useCardToPlayered'&&trigger.player!==player&&trigger.target===player)s.reached[3]=true;
    else if(trigger.name==='die'&&trigger.source===player&&trigger.player!==player)s.killed=true;
    update(player);
   }],
  },
  [IDS.bonus]:{
   charlotte:true, forced:true, silent:true,
   trigger:{source:'damageBegin1',player:['phaseDrawBegin2','phaseDrawAfter','gainAfter']},
   filter(event,player){return (event.name==='damage'&&reward(player,3))||((event.name==='phaseDraw'||event.name==='gain')&&reward(player,6));},
   content:[async function(event,trigger,player){
    if(trigger.name==='damage')trigger.num++;
    else if(trigger.name==='gain')markPhaseBonus(trigger,player,trigger.getg?.(player)||trigger.cards||[]);
    else if(event.triggername==='phaseDrawBegin2') {trigger._guifoBaseDraw=trigger.num;trigger.num+=6;}
    else if(trigger._guifoBaseDraw!=null)api.jingtu?.markGain(player,(trigger.cards||[]).slice(trigger._guifoBaseDraw,trigger._guifoBaseDraw+6));
   }],
   mod:{
    cardUsable(card,player,num){if(card.name==='sha')return num+(reward(player,1)?1:0)+(reward(player,6)?6:0);},
    maxHandcard(player,num){return num+(reward(player,2)?2:0)+(reward(player,6)?6:0);},
    attackRange(player,num){return num+(reward(player,6)?6:0);},
   },
  },
  [IDS.targets]:{
   charlotte:true,direct:true,trigger:{player:'useCard2'},
   filter(event,player){const type=get.type(event.card),info=get.info(event.card);return reward(player,4)&&(type==='basic'||type==='trick')&&!info.notarget&&info.allowMultiple!==false&&!info.multitarget&&game.hasPlayer(t=>eligibleExtra(event,player,t));},
   content:[async function(event,trigger,player){
    const result=await player.chooseTarget('皈佛：你可以为此牌额外指定一个目标',(_card,_player,target)=>eligibleExtra(trigger,player,target)).set('ai',t=>get.effect(t,trigger.card,player,player)).forResult();
    if(result.bool&&result.targets?.[0]){trigger.targets.push(result.targets[0]);player.line?.(result.targets[0]);}
   }],
  },
  [IDS.wine]:{
   charlotte:true,forced:true,popup:false,trigger:{player:'jiuBefore'},
   filter(event,player){const use=event.getParent();return reward(player,4)&&use?.name==='useCard'&&use.player===player;},
   content:[async function(event,trigger,player){trigger.setContent([async function(e,_trigger,source){
    const target=e.target,num=typeof e.baseDamage==='number'?e.baseDamage:1;
    if(target.isDying()){await target.recover(num);const use=e.getParent();if(target===source&&_status.currentPhase===source&&use.addCount!==false){const stat=source.getStat().card;if(typeof stat.jiu==='number')stat.jiu--;}return;}
    target.storage.jiu=(target.storage.jiu||0)+num;game.addVideo('jiuNode',target,true);
    game.broadcastAll(function(t){t.addSkill('jiu');if(!t.node.jiu&&lib.config.jiu_effect){t.node.jiu=ui.create.div('.playerjiu',t.node.avatar);t.node.jiu2=ui.create.div('.playerjiu',t.node.avatar2);}},target);
   }]);}],
  },
  [IDS.deaths]:{
   charlotte:true,direct:true,trigger:{global:['dieBegin','dieAfter']},
   filter(event,player){return reward(player,5)&&event.player!==player;},
   content:[async function(event,trigger,player){
    if(event.triggername==='dieBegin'){deaths.set(trigger,(trigger.player.getSkills(null,false,false)||[]).filter(gainable));return;}
    let options=[...new Set(deaths.get(trigger)||[])].filter(s=>!player.hasSkill(s));
    while(options.length&&player.isIn()){
     const chosen=await player.chooseControl(options,'cancel2').set('prompt','皈佛：选择获得一项技能，或取消结束').set('choiceList',options.map(s=>get.translation(s)+'：'+get.translation(s+'_info'))).forResult();
     if(!options.includes(chosen.control))break;
     await player.addSkills(chosen.control);options=options.filter(s=>s!==chosen.control);
    }
   }],
  },
 },translate:{[ID]:'皈佛',[ID+'_info']:'结束阶段开始时、你造成或受到伤害后，你可以摸X张牌（X为你的体力上限），然后若已满足当前第一项条件，你获得对应效果，删除此项并减1点体力上限。①执行过出牌阶段：出牌阶段使用【杀】的次数+1；②获得过至少10张牌：手牌上限+2；③造成过至少3点伤害：造成的伤害+1；④成为过其他角色使用牌的目标：使用基本牌或普通锦囊牌时可以额外指定一个目标；⑤造成和受到的伤害相等，或杀死过其他角色：一名角色死亡时，你可以获得其武将牌上的任意个技能；⑥一轮内获得过至少20张牌且造成至少10点伤害：摸牌阶段摸牌数、出牌阶段使用【杀】的次数、手牌上限与攻击范围均+6。条件达成后持续记录，每次发动至多完成一项。'}};
},
function(lib, game, ui, get, ai, _status, api) {
  const MAIN = '魔笮融_魔宗';
  const canGive = (card, from, to) => (!lib.filter.cardGiftable || lib.filter.cardGiftable(card, from, to)) && (!lib.filter.canBeGained || lib.filter.canBeGained(card, to, from));
  const eligible = (from, to) => from.getCards('he').filter(card => canGive(card, from, to));
  const skills = {
    [MAIN]: {
      zhuanhuanji: true,
      mark: true,
      locked: true,
      forced: true,
      trigger: { global: ['phaseZhunbeiBegin', 'phaseJieshuBegin'] },
      filter(event, player) {
        const target = event.player;
        if (!target || target === player || !target.isIn() || !player.isIn()) return false;
        if (event.name === 'phaseZhunbei') return !player.storage[MAIN];
        if (event.name === 'phaseJieshu') return !!player.storage[MAIN] && eligible(player, target).length >= 2;
        return false;
      },
      content: [async function(event, trigger, player) {
        const target = trigger.player;
        const yang = trigger.name === 'phaseZhunbei';
        player.changeZhuanhuanji(MAIN);
        if (yang) {
          const gainable = target.getGainableCards(player, 'he');
          if (gainable.length) await player.gainPlayerCard(target, 'he', [1, Math.min(2, gainable.length)], true);
          if (player.isIn() && target.isIn()) await target.damage(1, 'fire', player);
          return;
        }
        const selection = player.chooseToGive({target, position:'he', selectCard:[2,Infinity], forced:true, filterCard:card => canGive(card,player,target)}).set('prompt', '魔宗：交给该角色至少两张牌');
        const given = await selection.forResult();
        const moved = selection.done?.getg(target).filter(card =>
          given.cards?.includes(card) && selection.done?.getl(player)?.cards2?.includes(card)) || [];
        const n = moved.length;
        if (n < 2 || !player.isIn() || !target.isIn()) return;
        const returnText = '交给其' + (2 * n) + '张牌';
        const damageText = '受到' + n + '点伤害';
        let answer = damageText;
        if (eligible(target, player).length >= 2 * n) {
          const result = await target.chooseControl(returnText, damageText)
            .set('prompt', '魔宗：选择一项')
            .set('ai', () => get.attitude(target, player) > 0 ? returnText : damageText).forResult();
          answer = result.control === returnText ? returnText : damageText;
        }
        if (!player.isIn() || !target.isIn()) return;
        if (answer === returnText && eligible(target, player).length >= 2 * n) {
          await target.chooseToGive({target:player, position:'he', selectCard:[2*n,2*n], forced:true, filterCard:card => canGive(card,target,player)}).set('prompt', '魔宗：交给其' + (2 * n) + '张牌').forResult();
        } else await target.damage(n, player);
      }],
      intro: { content(storage) { return storage ? '阴：其他角色结束阶段，交给其至少两张牌，令其交还两倍数量的牌或受到等量伤害。' : '阳：其他角色准备阶段，获得其两张牌并对其造成一点火焰伤害。'; } }
    }
  };
  api.mozong = { ids: { main: MAIN } };
  return {skills, translate: {
    [MAIN]: '魔宗',
    [MAIN+'_info']: '转换技，锁定技。阳：其他角色的准备阶段开始时，你获得其至多两张牌并对其造成1点火焰伤害；阴：其他角色的结束阶段开始时，若你能交给其至少两张牌，你交给其至少两张牌，然后其须选择交给你两倍数量的牌或受到等量伤害。'
  }};
},
function fotuFactory(lib, game, ui, get, ai, _status, api) {
  const MAIN = '魔笮融_佛图';
  const PURE = '魔笮融_净土';
  const USED = '魔笮融_佛图已发动';

  // 原文是“调整至”，一次同步调整两个数值，避免体力上限为零的死亡事件
  // 中，等待一个单独的回复/上限变化事件时再次进入死亡流程。
  function setLife(player, amount) {
    game.broadcastAll(function (target, value) {
      target.maxHp = value;
      target.hp = value;
      target.update();
    }, player, amount);
  }

  const skills = {
    [MAIN]: {
      trigger: { player: 'dieBegin' },
      forceDie: true,
      forced: true,
      limited: true,
      skillAnimation: true,
      animationColor: 'fire',
      filter(event, player) {
        return !player.storage[USED] && !player.awakenedSkills.includes(MAIN);
      },
      content: [async function (event, trigger, player) {
        // 先终止当前死亡，再推进有限技；不拦截执行过程中出现的新死亡。
        player.storage[USED] = true;
        player.awakenSkill(MAIN);
        trigger.cancel();
        const complete = !!api.guifo?.isAllRemoved(player);
        if (complete) {
          player.addSkill('olrumo');
          setLife(player, 6);
          const difference = player.countCards('h') - 6;
          if (difference > 0) await player.chooseToDiscard('h', difference, true);
          else if (difference < 0) await player.draw(-difference);
          if (player.isIn()) player.addSkill(PURE);
        } else {
          setLife(player, 4);
          if (player.isIn()) player.addSkill('dccansi');
        }
      }],
    },
  };
  const translate = {
    [MAIN]: '佛图',
    [MAIN + '_info']: '锁定技，限定技，当你死亡时，若“皈佛”的所有选项均已删除，你入魔，将体力上限、体力值与手牌数调整至6，然后获得“净土”；否则，你将体力上限和体力值调整至4，然后获得“残肆”。',
  };
  api.fotu = { MAIN, PURE, USED };
  return { skills, translate };
},
function jingtuFactory(lib, game, ui, get, ai, _status, api) {
  const MAIN = '魔笮融_净土';
  const WATCH = '魔笮融_净土留踪';
  const CLEAN = '魔笮融_净土轮末清理';
  const SOURCE = '魔笮融_皈佛来源';
  const owners = new WeakMap();
  const altered = new Map();
  const turns = new WeakMap();
  const seenLoss = new WeakMap();
  function state(p) {
    let s = owners.get(p);
    if (!s) { s = { pending: new Set(), completed: false, disabled: false }; owners.set(p,s); }
    return s;
  }
  function inHand(p,c) { return p.getCards('h').includes(c); }
  function tagged(c) { return !!(c && (typeof c.hasGaintag === 'function' ? c.hasGaintag(SOURCE) : Array.isArray(c.gaintag) && c.gaintag.includes(SOURCE))); }
  function markGain(p,cards) {
    for (const c of cards || []) if (inHand(p,c)) {
      if (typeof c.addGaintag === 'function') c.addGaintag(SOURCE);
      else { c.gaintag ||= []; if (!c.gaintag.includes(SOURCE)) c.gaintag.push(SOURCE); }
    }
  }
  function materials(card) {
    if (!card) return [];
    if (Array.isArray(card.cards)) return card.cards;
    return card.cardid || card.physical || card.classList ? [card] : [];
  }
  function qualifies(p,card) {
    const list=materials(card);
    return list.length>0 && list.every(c=>tagged(c) && inHand(p,c));
  }
  function cardType(card,p) {
    const t=get.type2(card,p);
    return ['basic','trick','equip'].includes(t) ? t : null;
  }
  function turnOf(e) {
    const turn=e && typeof e.getParent==='function' ? e.getParent('phase', true) : null;
    return turn && turn.name==='phase' ? turn : (_status.currentPhase || null);
  }
  function usedTypes(p,e) {
    let turn=turnOf(e); if (!turn || typeof turn!=='object') turn=p;
    let m=turns.get(turn); if(!m){m=new WeakMap();turns.set(turn,m);}
    let a=m.get(p);if(!a){a=new Set();m.set(p,a);}return a;
  }
  function identity(card,name,nature) {
    const oldSubtype=lib.card[card.name]?.subtype;
    if(oldSubtype && card.classList) card.classList.remove(oldSubtype);
    card.name=name;
    if(typeof card.$init==='function') card.$init([card.suit,card.number,name,nature]);
    if(nature==null) delete card.nature; else card.nature=nature;
  }
  function change(card) {
    game.addGlobalSkill(CLEAN);
    if(!altered.has(card)) altered.set(card,{name:card.name,nature:card.nature});
    identity(card,'sha',undefined);
  }
  function restoreAll() {
    for (const [card,old] of altered) if(card.name === 'sha' && !card.nature) identity(card,old.name,old.nature);
    altered.clear();
  }
  function lost(e,p) {
    if(!e || typeof e.getl!=='function')return [];
    const l=e.getl(p); return l ? (l.hs || []) : [];
  }
  function losing(e,p) {
    const s=state(p);return !s.completed && s.pending.size>0 && lost(e,p).some(c=>s.pending.has(c));
  }
  const skills={
    [MAIN]: {
      locked:true,
      group:[MAIN+'_draw',MAIN+'_use'],
      mod:{
        ignoredHandcard(card,p){if(!state(p).disabled && tagged(card))return true;},
        cardUsable(card,p){if(!state(p).disabled && qualifies(p,card))return Infinity;},
        targetInRange(card,p){if(!state(p).disabled && qualifies(p,card))return true;},
      },
      subSkill:{
        use:{
          charlotte:true,forced:true,popup:false,firstDo:true,
          trigger:{player:'useCardBefore'},
          filter(e,p){return !state(p).disabled && qualifies(p, e.cards?.length ? {cards:e.cards} : e.card);},
          content:[async function(event,trigger,player){trigger.addCount=false;}],
        },
        draw:{
          charlotte:true,forced:true,popup:false,
          trigger:{player:'useCardAfter'},
          filter(e,p){const t=cardType(e.card,p);return !state(p).disabled && !!t && !usedTypes(p,e).has(t);},
          content:[async function(event,trigger,player){
            const type=cardType(trigger.card,player);
            if(!type || state(player).disabled || usedTypes(player,trigger).has(type))return;
            usedTypes(player,trigger).add(type);
            await player.draw();
            if(!player.isIn())return;
            const next=player.chooseCard('h',[1,Infinity], '净土：展示任意张同类型手牌（可取消）');
            next.set('filterCard',function(card,player){return get.type2(card,player)===type;});
            next.set('jingtuType',type);
            const result=await next.forResult();
            if(!result.bool || !result.cards?.length)return;
            const cards=result.cards.filter(c=>inHand(player,c));
            if(!cards.length)return;
            await player.showCards(cards,'净土');
            const s=state(player);
            for(const c of cards){change(c);if(inHand(player,c))s.pending.add(c);}
            player.addSkill(WATCH);
          }],
        },
      },
    },
    [CLEAN]:{
      charlotte:true,forced:true,popup:false,forceDie:true,firstDo:true,
      trigger:{global:'roundEnd'},
      filter(){return altered.size>0;},
      content:[async function(event,trigger,player){restoreAll();}],
    },
    [WATCH]:{
      charlotte:true,forced:true,popup:false,forceDie:true,
      trigger:{global:['loseAfter','gainAfter','loseAsyncAfter','equipAfter','addJudgeAfter','addToExpansionAfter','roundEnd']},
      filter(e,p,name){return name==='roundEnd' || e.name==='round' || losing(e,p);},
      content:[async function(event,trigger,player){
        if(event.triggername==='roundEnd' || trigger.name==='round') {
          restoreAll();const s=state(player);s.pending.clear();s.completed=false;s.disabled=false;player.removeSkill(WATCH);return;
        }
        const s=state(player);
        for(const c of lost(trigger,player))s.pending.delete(c);
        if(s.pending.size===0 && !s.completed){
          s.completed=true;
          await player.draw(3);
          s.disabled=true;
        }
      }],
    },
  };
  const translate={
    [MAIN]:'净土',
    [MAIN+'_info']:'锁定技，你因“皈佛”获得且仍在手中的牌不计入手牌上限且使用无距离和次数限制；每回合每种类型限一次，你使用一种类型的牌结算完成后，摸一张牌，然后可以展示任意张此类型的手牌，这些牌视为【杀】直到本轮结束。当你失去本轮以此法展示的所有牌后，摸三张牌，然后此技能本轮失效。',
    [WATCH]:'净土',
  };
  api.jingtu={MAIN,WATCH,CLEAN,SOURCE,markGain,state,qualifies,change,restoreAll,lost};
  return {skills,translate};
}];
 const modules=factories.map(f=>f(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(m=>m.skills||{}));
 const translate=Object.assign({},...modules.map(m=>m.translate||{}));
 let installed=false;
 return {name:'魔笮融',editable:true,connect:false,
  content(){ if(installed)return; for(const id of Object.keys(skills))if(!lib.skill[id])game.addSkill(id,skills[id],translate[id],translate[id+'_info']);
   Object.assign(lib.translate,translate);for(const service of Object.values(api))if(typeof service?.install==='function')service.install();installed=true; },
  precontent(){},help:{},config:{},
  package:{character:{character:{mo_zerong:['male','qun',6,['魔笮融_皈佛','魔笮融_魔宗','魔笮融_佛图'],['die:false','ext:魔笮融/mo_zerong.jpg']]},
    translate:{mo_zerong:'魔笮融'},characterIntro:{mo_zerong:'魔笮融，男性，6点体力上限。技能设计：恭喜我称地；原画署名：KayaK；代码实现：OpenAI Codex。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},intro:'魔笮融测试版：皈佛、魔宗、佛图及衍生技能净土。适配无名杀1.11.6单机。',
   author:'恭喜我称地',diskURL:'',forumURL:'',version:'0.1.0'},
  files:{character:['mo_zerong.jpg'],card:[],skill:[],audio:[]}
 };
});
