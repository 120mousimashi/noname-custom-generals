// 玄谍既白 v1.0.0。技能设计：辟境归元；代码实现与整合：OpenAI Codex协助。
game.import('extension',function(lib,game,ui,get,ai,_status){
 'use strict';
 const parts=[(function(lib, game, ui, get, ai, _status) {
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
                character: {"bjgy_yinfan":["male","wu",3,["结交","构间"],["die:false","ext:玄谍既白/bjgy_yinfan.jpg"]]},
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
})(lib,game,ui,get,ai,_status),
(function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function createCore(lib,game,ui,get,ai,_status,api){
 const Q='bjgy_guoxiu_quhe',G='bjgy_guoxiu_guren',RULE='bjgy_guoxiu_unlimited_rule',FLAG='bjgy_guoxiu_unlimited';
 let installed=false;
 function canAct(player){return !!player&&player.isIn();}
 function turnKey(){return game.getGlobalHistory?.()||game.phaseNumber||0;}
 function isDamage(value,owner){
  if(!value)return false;
  const descriptor=typeof value==='string'?{name:value}:value;
  const name=get.name(descriptor,owner);
  const type=get.type(descriptor);return name!=='shandian'&&(type==='basic'||type==='trick')&&!!get.tag(descriptor,'damage');
 }
 function card(name,nature,unlimited=false){
  const value={name,suit:'none',color:'none',number:null,isCard:true,cards:[],storage:{}};
  if(nature)value.nature=nature;if(unlimited)value.storage[FLAG]=true;return value;
 }
 function legal(player,target,value,unlimited){return canAct(player)&&canAct(target)&&isDamage(value,player)&&player.canUse(value,target,unlimited?false:undefined,!unlimited);}
 function options(player,target,unlimited=false){
  const result=[];
  for(const name of new Set(lib.inpile||[])){
   if(!isDamage(name,player))continue;
   for(const nature of name==='sha'?[undefined,...(lib.inpile_nature||[])]:[undefined]){
    const value=card(name,nature,unlimited);if(legal(player,target,value,unlimited))result.push([get.type(value),'',name,nature]);
   }
  }
  return result;
 }
 async function choose(player,target,{unlimited=false,prompt='选择使用一张伤害牌'}={}){
  const list=options(player,target,unlimited);if(!list.length)return null;
  const answer=await player.chooseButton([prompt,[list,'vcard']],true)
   .set('ai',button=>player.getUseValue?.(card(button.link[2],button.link[3],unlimited))||1).forResult();
  const link=answer?.bool&&answer.links?.[0];if(!link||!list.some(entry=>entry[2]===link[2]&&entry[3]===link[3]))return null;
  const value=card(link[2],link[3],unlimited);return legal(player,target,value,unlimited)?value:null;
 }
 function use(player,target,value,{baseDamage,unlimited=false}={}){
  if(unlimited){value.storage??={};value.storage[FLAG]=true;}
  const event=player.useCard(value,[],[target]);
  if(typeof baseDamage==='number'&&Number.isFinite(baseDamage))event.baseDamage=baseDamage;
  if(unlimited)event.addCount=false;
  return event;
 }
 function useOf(event){
  const seen=new Set();while(event&&typeof event==='object'&&!seen.has(event)){
   if(event.name==='useCard')return event;seen.add(event);event=event.parent||(typeof event.getParent==='function'?event.getParent():null);
  }
  return null;
 }
 function unlimited(value){return !!value?.storage?.[FLAG];}
 function install(){if(installed)return;installed=true;game.addGlobalSkill(RULE);}
 api.core={Q,G,canAct,turnKey,isDamage,card,options,choose,use,useOf,legal,install};
 return{skills:{[RULE]:{charlotte:true,mod:{
  targetInRange(value){if(unlimited(value))return true;},cardUsable(value){if(unlimited(value))return Infinity;},
 } }},translate:{[RULE]:'孤刃'}};
},
function createGuoxiuProxy(lib,game,ui,get,ai,_status,api){
 const ID='bjgy_guoxiu_quhe_proxy',records=new Map(),wrapped=new Map();let installed=false;
 const live=player=>api.core.canAct(player);
 function ancestry(event,predicate){const seen=new Set();while(event&&!seen.has(event)){if(predicate(event))return event;seen.add(event);event=event.parent||event.getParent?.();}return null;}
 function sourceUse(event){return api.core.useOf(event);}
 function find(event,target){const use=sourceUse(event),record=records.get(use);return record&&record.target===target&&live(target)?record:null;}
 function next(player){return player.getNext?.()||player.nextSeat;}
 function previous(player){return player.getPrevious?.()||player.previousSeat;}
 function qualifies(record,helper){return live(helper)&&helper!==record.holder&&helper!==record.target&&(helper===next(record.target)||helper===previous(record.target)||get.distance(helper,record.target)<=1);}
 function helpers(use){
  const record=records.get(use);if(!record||!live(record.target))return[];
  const ordered=[],seen=new Set(),start=_status.currentPhase||record.target;let current=next(start);
  while(current&&!seen.has(current)&&current!==start){seen.add(current);ordered.push(current);current=next(current);}
  for(const player of game.players||[])if(player!==start&&!seen.has(player)){seen.add(player);ordered.push(player);}
  if(start!==record.target)ordered.push(start);
  return ordered.filter(helper=>qualifies(record,helper));
 }
 function blocked(event,record){
  const effect=ancestry(event,current=>current.type==='card'&&current.card===record.use.card);
  return !!(effect?.directHit||effect?.directHit2||record.use.directHit?.includes?.(record.target)||record.use.directHit?.has?.(record.target));
 }
 function response(choice,kind,record){
  if(choice.gxProxyRequest||choice.responded||choice.type==='phase'||choice.type==='wuxie'||choice.type==='dying')return false;
  if(blocked(choice,record))return false;
  if(choice.respondTo?.[1]!==record.use.card)return false;
  return kind==='chooseToRespond'||choice.type==='respondShan';
 }
 function descriptor(player,key){return Object.getOwnPropertyDescriptor(player,key);}
 function restore(player,key,own,wrapper){if(player[key]!==wrapper)return;if(own)Object.defineProperty(player,key,own);else delete player[key];}
 function account(helper,skill,event,kind){
  const info=lib.skill[skill];if(!info)return;
  if(info.log!==false)helper.logSkill?.(skill,false,null,null,[event,helper]);
  if(kind==='respond'){helper.checkShow?.(skill,true);if(!game.online)info.onrespond?.(event,helper);}
  const stat=helper.stat?.[helper.stat.length-1]?.skill;
  if(stat&&event.addSkillCount!==false){stat[skill]=(stat[skill]||0)+1;if(info.sourceSkill)stat[info.sourceSkill]=(stat[info.sourceSkill]||0)+1;}
  event.gxProxySkill=skill;
 }
 function logChoice(helper,skill){if(typeof skill==='string')helper.logSkill?.(skill);else if(Array.isArray(skill))helper.logSkill?.apply(helper,skill);}
 async function ask(choice,record,helper,kind){
  if(!records.has(record.use)||!qualifies(record,helper)||blocked(choice,record))return{bool:false};
  const options={};
  for(const key of ['type','filterCard','filterTarget','selectCard','selectTarget','position','respondTo','source','prompt2','ai','ai1','ai2','toUse','toRespond','shanRequired','shaRequired','addCount','addSkillCount','noOrdering'])if(choice[key]!==undefined)options[key]=choice[key];
  options.prompt='趋贺：是否替'+get.translation(record.target)+(kind==='chooseToUse'?'使用':'打出')+'响应牌？';options.forced=false;
  const request=helper[kind](options);request.gxProxyRequest=true;request.autochoose=()=>false;
  const oldRespond=helper.respond,oldUse=helper.useResult,respondOwn=descriptor(helper,'respond'),useOwn=descriptor(helper,'useResult'),payments=[];
  function bind(payment,mode){
   if(!payment||typeof payment.content!=='function')return payment;
   const original=payment.content;payment.gxProxyHelper=helper;payments.push(payment);
   // Keep the chosen helper and skill through the native Before/Begin events.
   // In particular, jijiang1 must recruit/pay a real allied Sha or cancel this
   // event before any response is accepted. Transfer only the actual card body.
   payment.content=async function(event){
    if(!event.gxProxyRebound){
     if(!live(record.target)){event.cancel?.();event.finish();return;}
     const skill=event.skill;
     if(skill)account(helper,skill,event,mode);
     delete event.skill;event.player=record.target;event.gxProxyRebound=true;
    }
    const result=await original.call(this,event);event.gxProxyResolved=true;return result;
   };
   return payment;
  }
  const respondWrapper=function(...args){
   if(_status.event!==request)return oldRespond.apply(this,args);
   return bind(oldRespond.apply(this,args),'respond');
  };
  const useWrapper=function(result,event){
   if(_status.event!==request)return oldUse.call(this,result,event);
   const used=oldUse.call(this,result,event);
   return used?.name==='useCard'?bind(used,'use'):used;
  };
  helper.respond=respondWrapper;helper.useResult=useWrapper;
  try{
   const result=await request.forResult();if(!result?.bool)return result;
   const paid=payments.findLast(payment=>payment.gxProxyResolved&&!payment._cancelled);
   return paid?{...result,card:paid.card,cards:paid.cards||result.cards}:{bool:false};
  }finally{restore(helper,'respond',respondOwn,respondWrapper);restore(helper,'useResult',useOwn,useWrapper);}
 }
 function wrap(target){
  if(wrapped.has(target))return;const entries={};
  for(const kind of ['chooseToUse','chooseToRespond']){
   const native=target[kind],own=descriptor(target,kind);if(typeof native!=='function')throw new Error('趋贺：缺少原生响应入口 '+kind);
   const wrapper=function(...args){
    const choice=native.apply(this,args),record=find(choice.parent||_status.event,this);if(!record||choice.gxProxyRequest)return choice;
    const original=choice.content;
    choice.content=async function(event){
     if(!records.has(record.use)||!response(event,kind,record))return original.call(this,event);
     for(const helper of helpers(record.use)){
      const result=await ask(event,record,helper,kind);
      if(result?.bool){event.result=result;event.responded=true;event.finish();return;}
     }
     if(blocked(event,record)){event.result={bool:false};event.finish();return;}
     return original.call(this,event);
    };
    return choice;
   };
   entries[kind]={native,own,wrapper};target[kind]=wrapper;
  }
  if(typeof target.hasShan==='function'){
   const native=target.hasShan,own=descriptor(target,'hasShan');
   const wrapper=function(...args){
    const result=native.apply(this,args);if(result)return result;
    const record=find(_status.event,this);
    // The native Sha shortcut asks hasShan before creating chooseToUse. Only
    // this exact marked use may advertise a helper; directHit remains native.
    return !!(record&&!blocked(_status.event,record)&&helpers(record.use).length);
   };
   entries.hasShan={native,own,wrapper};target.hasShan=wrapper;
  }
  wrapped.set(target,entries);
 }
 function attach(use,holder,target){if(!use||!target||target===holder)return false;const record={use,holder,target};records.set(use,record);wrap(target);return record;}
 function detach(use){records.delete(use);for(const[target,entries]of wrapped)if(![...records.values()].some(record=>record.target===target)){for(const[key,entry]of Object.entries(entries))restore(target,key,entry.own,entry.wrapper);wrapped.delete(target);}}
 function install(){if(installed)return;installed=true;game.addGlobalSkill(ID);}
 api.proxy={attach,detach,helpers,records,install,qualifies};
 return{skills:{[ID]:{charlotte:true,forced:true,popup:false,priority:100,trigger:{global:['useCardAfter','useCardOmitted','useCardCancelled']},filter(event){return records.has(event);},async content(event,trigger){detach(trigger);}}},translate:{[ID]:'趋贺'}};
},
function createGuoxiuQuhe(lib,game,ui,get,ai,_status,api){
 const ID='bjgy_guoxiu_quhe',DIST=ID+'_distance',CLOCK=ID+'_clock',pairs=[];let installed=false;
 function active(record){return record.key===api.core.turnKey();}
 function linked(from,to){return pairs.some(record=>active(record)&&(record.holder===from&&record.target===to||record.holder===to&&record.target===from));}
 function addDistance(holder,target){const key=api.core.turnKey();if(!pairs.some(record=>record.key===key&&record.holder===holder&&record.target===target))pairs.push({key,holder,target});}
 function closeTurn(){const key=api.core.turnKey();for(let i=pairs.length-1;i>=0;i--)if(pairs[i].key===key)pairs.splice(i,1);}
 async function begin(holder,target){
  if(!api.core.canAct(holder)||!api.core.canAct(target)||holder===target)return false;
  addDistance(holder,target);
  const card=await api.core.choose(holder,target,{prompt:'趋贺：选择对'+get.translation(target)+'使用的一张伤害牌'});
  if(!card||!api.core.canAct(holder)||!api.core.canAct(target))return false;
  const use=api.core.use(holder,target,card,{baseDamage:Number(target.hp)||0});
  use[ID]={holder,target};api.proxy.attach(use,holder,target);
  await use;return true;
 }
 function install(){if(installed)return;installed=true;game.addGlobalSkill(DIST);game.addGlobalSkill(CLOCK);}
 api.quhe={begin,linked,pairs,closeTurn,install};
 return{skills:{
  [ID]:{audio:false,trigger:{global:'phaseBegin'},
   filter(event,player){return event.player!==player&&api.core.canAct(player)&&api.core.canAct(event.player);},
   async cost(event,trigger,player){event.result=await player.chooseBool('趋贺：是否与'+get.translation(trigger.player)+'本回合相互计算距离为1，并对其使用一张伤害牌？').set('ai',()=>get.attitude(player,trigger.player)<0).forResult();},
   async content(event,trigger,player){await begin(player,trigger.player);},
  },
  [DIST]:{charlotte:true,mod:{globalFrom(from,to){if(linked(from,to))return -Infinity;}}},
  [CLOCK]:{charlotte:true,forced:true,popup:false,lastDo:true,trigger:{global:'phaseAfter'},filter(){return pairs.some(active);},async content(){closeTurn();}},
 },translate:{
  [ID]:'趋贺',[DIST]:'趋贺',[CLOCK]:'趋贺',
  [ID+'_info']:'其他角色的回合开始时，你可以令你与其本回合相互计算距离为1，然后视为对其使用一张伤害牌。此牌基础伤害为正式使用时其体力值。与其座位相邻，或计算与其距离为1且不为你的其他角色，可以代替其使用或打出响应牌；从当前回合角色下家起按座次依次询问。代响应不代受伤，火攻展示不属于响应，不能被响应的牌不能以此法响应。',
 }};
},
function createGuren(lib,game,ui,get,ai,_status,api){
 const Q='bjgy_guoxiu_quhe',G='bjgy_guoxiu_guren',ROUND=G+'_round',MARK=G+'_execution_record',EXEC=G+'_execution',REWARD=G+'_reward';
 const handled=new WeakSet();let installed=false;
 const live=player=>api.core.canAct(player);
 function sameUseDamage(damage,use,target){
  return damage.player===target&&damage.card===use.card&&api.core.useOf(damage)===use&&!damage.unreal&&!damage.cancelled&&!damage._cancelled&&Number(damage.num)>0;
 }
 function actualDamage(use,target){return(target.getAllHistory?.('damage')||target.getHistory?.('damage')||[]).some(damage=>sameUseDamage(damage,use,target));}
 function printed(use,player){return api.core.card(get.name(use.card,player),get.nature(use.card,player),true);}
 function adjacent(target,other){return target!==other&&(target.getNext?.()===other||target.getPrevious?.()===other);}
 function targets(player,use){
  if(!live(player)||use?.targets?.length!==1)return[];
  const original=use.targets[0];if(!live(original))return[];
  const card=printed(use,player);
  return game.filterPlayer(other=>other!==player&&live(other)&&adjacent(original,other)&&player.canUse(card,other,false));
 }
 function canActivate(use,player){
  return live(player)&&player.hasSkill(G)&&use?.name==='useCard'&&use.player===player&&use.targets?.length===1&&api.core.isDamage(use.card,player)&&player.storage[ROUND]!==Number(game.roundNumber||0)&&!actualDamage(use,use.targets[0])&&targets(player,use).length>0;
 }
 function record(use){return use?.[MARK];}
 async function retaliate(player,original,target){
  if(!canActivate(original,player)||!targets(player,original).includes(target))return false;
  const card=printed(original,player);
  player.storage[ROUND]=Number(game.roundNumber||0);player.syncStorage?.(ROUND);player.logSkill?.(G,target);
  const use=api.core.use(player,target,card,{unlimited:true});
  use[MARK]={owner:player,paid:false};
  await use;
  return true;
 }
 function executionRecord(damage){
  if(!damage||damage.unreal||damage.cancelled||damage._cancelled||Number(damage.num)<=0||handled.has(damage)||!live(damage.player))return null;
  const use=api.core.useOf(damage),entry=record(use);
  return entry&&damage.card===use.card?entry:null;
 }
 async function aftermath(owner){
  if(!live(owner))return;
  await owner.removeSkills([Q,G]);
  if(!live(owner))return;
  await owner.changeGroup('wei');
  if(!live(owner))return;
  owner.storage[REWARD]=true;owner.syncStorage?.(REWARD);owner.markSkill?.(REWARD);
  const hp=Math.max(0,Number(owner.hp)||0);
  if(hp>0)await owner.loseHp(hp);
 }
 async function execute(damage){
  const entry=executionRecord(damage);if(!entry)return false;
  handled.add(damage);
  const first=!entry.paid;entry.paid=true;
  // Death in damageBegin3 does not stop the native forceDie damage event.
  // Explicit cancellation prevents later damage history, HP deduction,
  // after-damage reactions and elemental chain propagation for this event.
  if(typeof damage.cancel==='function')damage.cancel();else damage.finish();
  await damage.player.die(damage);
  if(first&&live(entry.owner))await aftermath(entry.owner);
  return true;
 }
 function rewardFilter(event,player){return live(player)&&!!player.storage[REWARD]&&!event.unreal&&!event.cancelled&&!event._cancelled&&Number(event.num)>0;}
 function install(){if(installed)return;installed=true;game.addGlobalSkill(EXEC);game.addGlobalSkill(REWARD);}
 api.guren={install,targets,canActivate,actualDamage,retaliate,record,executionRecord,execute,aftermath,rewardFilter};
 return{skills:{
  [G]:{audio:false,direct:true,trigger:{player:'useCardAfter'},
   filter:canActivate,
   async content(event,trigger,player){
    const available=targets(player,trigger);
    const result=await player.chooseTarget('孤刃：对一名与原目标相邻的其他角色使用相同伤害牌',(_,owner,target)=>available.includes(target))
     .set('ai',target=>get.damageEffect?.(target,player,player)||0).forResult();
    if(result?.bool&&result.targets?.length)await retaliate(player,trigger,result.targets[0]);
   },
  },
  [EXEC]:{charlotte:true,forced:true,popup:false,forceDie:true,trigger:{global:'damageBegin3'},
   // The threatened recipient owns this global execution step. It therefore
   // also remains reachable for later targets after the original owner dies.
   filter(event,player){return event.player===player&&!!executionRecord(event);},
   async content(event,trigger,player){await execute(trigger);},
  },
  [REWARD]:{charlotte:true,forced:true,popup:false,marktext:'刃',trigger:{player:'damageEnd'},
   filter:rewardFilter,
   async content(event,trigger,player){if(rewardFilter(trigger,player))await player.draw(2);},
   intro:{content:'本局游戏每次受到实际伤害后，摸两张牌。'},
  },
 },translate:{
  [G]:'孤刃',[EXEC]:'孤刃',[REWARD]:'孤刃·余效',
  [G+'_info']:'每轮限一次，你使用的仅指定一个目标的伤害牌结算完成后，若此牌未对该目标造成实际伤害，你可以视为对一名与其相邻的其他角色使用一张同牌名的伤害牌（杀保留属性，无距离和次数限制且不计次，不继承趋贺的基础伤害与代响应效果）。此牌造成伤害时，受伤角色立即阵亡，原伤害终止；然后若你仍在场，你失去趋贺和孤刃，将势力改为魏，获得本局游戏受到伤害后摸两张牌的效果，再失去全部体力。该牌额外目标仍适用处决，你自身的后续仅执行一次。',
 }};
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills)),translate=Object.assign({},...modules.map(module=>module.translate));
 let scheduled=false;
 return {
  name:'郭脩',editable:true,connect:false,
  content(){if(scheduled)return;scheduled=true;(lib.arenaReady??=[]).push(function installGuoxiu(){
   api.core.install();api.proxy?.install?.();api.quhe.install();api.guren.install();
  });},precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_guoxiu:['male','shu',3,['bjgy_guoxiu_quhe','bjgy_guoxiu_guren'],['die:false','ext:玄谍既白/bjgy_guoxiu.jpg']]},
    translate:{bjgy_guoxiu:'郭脩'},characterIntro:{bjgy_guoxiu:'郭脩，蜀、男性、初始体力3，体力上限3。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由GPT绘制、设计者提供。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'郭脩：蜀、男、3/3。趋贺、孤刃。面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_guoxiu.jpg'],card:[],skill:[],audio:[]}
 };
})(lib,game,ui,get,ai,_status),
(function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function anonymousFactory(lib, game, ui, get, ai, _status, api) {
  // This factory is embedded verbatim by the builder: no module-level dependencies.
  const scopes = [];
  const patches = [];
  const framePatches = [];
  const preparing = [];
  let serial = 0;
  let rendering = 0;
  let mutedSkill = 0;
  const anonymousName = '匿名角色';

  function ancestry(event) {
    const queue = [event], found = new Set();
    while (queue.length && found.size < 256) {
      const current = queue.shift();
      if (!current || typeof current !== 'object' || found.has(current)) continue;
      found.add(current);
      if (current.parent) queue.push(current.parent);
      if (current._trigger) queue.push(current._trigger);
      if (current.relatedEvent) queue.push(current.relatedEvent);
      if (typeof current.getParent === 'function') {
        try { queue.push(current.getParent()); } catch (_) { /* Finished events can lose their parent. */ }
      }
    }
    return found;
  }
  function currentScopes(event) {
    if (!scopes.length) return [];
    const parents = ancestry(event || _status.event);
    return scopes.filter(scope => scope.active && parents.has(scope.event));
  }
  function hides(player, active) { return active.some(scope => scope.source === player); }
  function scrubString(value, active) {
    if (typeof value !== 'string') return value;
    let result = value;
    const names = [];
    active.forEach(scope => scope.names.forEach(name => { if (!names.includes(name)) names.push(name); }));
    names.sort((a, b) => b.length - a.length).forEach(name => { result = result.split(name).join(anonymousName); });
    return result;
  }
  function scrub(value, active, players) {
    if (players && hides(value, active)) return anonymousName;
    if (typeof value === 'string') return scrubString(value, active);
    if (Array.isArray(value)) return value.map(entry => scrub(entry, active, players));
    return value;
  }
  function isResponse() {
    const name = _status.event && _status.event.name;
    return name === 'chooseToUse' || name === 'chooseToRespond';
  }
  function wrap(object, key, handle) {
    if (!object || typeof object[key] !== 'function' || patches.some(patch => patch.object === object && patch.key === key)) return;
    const original = object[key], descriptor = Object.getOwnPropertyDescriptor(object, key);
    const wrapper = function () { return handle.call(this, original, Array.from(arguments)); };
    object[key] = wrapper;
    patches.push({ object, key, original, descriptor, wrapper });
  }
  function display(callback) {
    rendering++;
    try { return callback(); } finally { rendering--; }
  }
  function protectFrame(source) {
    const object = source && source.node;
    if (!object || !object.framebg || framePatches.some(patch => patch.object === object)) return;
    const descriptor = Object.getOwnPropertyDescriptor(object, 'framebg');
    if (descriptor && !descriptor.configurable) throw new Error('匿名来源边框槽不可保护');
    let visible = object.framebg, shadow;
    const getter = function () {
      const real = descriptor && descriptor.get ? descriptor.get.call(this) : visible;
      if (!hides(source, currentScopes())) return real;
      if (!shadow || shadow.real !== real) {
        const node = real && typeof real.cloneNode === 'function' ? real.cloneNode(true) : Object.assign({}, real, { dataset: Object.assign({}, real && real.dataset) });
        shadow = { real, node };
      }
      return shadow.node;
    };
    Object.defineProperty(object, 'framebg', {
      configurable: true, enumerable: descriptor ? descriptor.enumerable : true,
      get: getter,
      set(value) {
        if (descriptor && descriptor.set) descriptor.set.call(this, value);
        else visible = value;
      },
    });
    framePatches.push({ object, getter, descriptor, visible: () => visible });
    if (source.classList) wrap(source.classList, 'add', function (original, args) {
      if (hides(source, currentScopes())) args = args.filter(value => value !== 'topcount');
      return args.length ? original.apply(this, args) : undefined;
    });
  }
  function restorePatches() {
    if (scopes.length || preparing.length) return;
    framePatches.reverse().forEach(patch => {
      const current = Object.getOwnPropertyDescriptor(patch.object, 'framebg');
      if (!current || current.get !== patch.getter) return;
      if (patch.descriptor) {
        const descriptor = Object.assign({}, patch.descriptor);
        if ('value' in descriptor) descriptor.value = patch.visible();
        Object.defineProperty(patch.object, 'framebg', descriptor);
      } else {
        delete patch.object.framebg;
        patch.object.framebg = patch.visible();
      }
    });
    framePatches.length = 0;
    patches.reverse().forEach(patch => {
      if (patch.object[patch.key] !== patch.wrapper) return;
      if (patch.descriptor) Object.defineProperty(patch.object, patch.key, patch.descriptor);
      else delete patch.object[patch.key];
    });
    patches.length = 0;
  }
  function makeHistory(card, targets, event, id, active) {
    if (!ui.create || !ui.create.div || !ui.historybar) return;
    const node = ui.create.div('.hidden');
    node.node = {};
    node.logvid = id || (get.id ? get.id() : '马茂匿名' + ++serial);
    node.added = [];
    node.targets = Array.isArray(targets) ? targets.slice() : [];
    node.node.avatar = ui.create.div('.avatar.cardbg', '匿', node);
    node.node.avatar.style.backgroundImage = 'none';
    node.node.avatar.style.textAlign = 'center';
    node.node.avatar.style.lineHeight = '42px';
    if (Array.isArray(card)) {
      const vcard = card[0];
      node.cards = Array.isArray(card[1]) ? card[1].slice() : [];
      if (vcard && vcard.copy) vcard.copy(node, false);
      else if (vcard && ui.create.card) {
        const displayCard = ui.create.card(node, 'noclick', true).init([vcard.suit || '', vcard.number || '', vcard.name || '', vcard.nature || '']);
        if (!node.cards.length) node.cards.push(displayCard);
      }
      ui.create.div('.text', scrubString(get.translation(vcard), active), node);
    } else {
      ui.create.div('.text', scrubString(get.translation(card, 'skill'), active), node);
    }
    node._mamaoAnonymous = true;
    // No player/source reference and no clone of a real avatar is kept in this UI node.
    ui.historybar.insertBefore(node, ui.historybar.firstChild);
    const height = ui.historybar.offsetHeight || 700;
    const count = Math.max(1, Math.floor((height - 8) / 50));
    Array.from(ui.historybar.childNodes).forEach((entry, index) => {
      if (!entry.style) return;
      entry.style.transform = 'scale(1) translateY(' + (index * 50) + 'px)';
      if (index >= count) entry.style.opacity = '0';
    });
    if (ui.refresh) ui.refresh(node);
    if (node.classList) node.classList.remove('hidden');
    if (ui.click && node.addEventListener) {
      const click = lib.config && lib.config.touchscreen ? ui.click.intro : ui.click.logv;
      if (click) node.addEventListener(lib.config && lib.config.touchscreen ? 'touchstart' : 'click', click);
      if (ui.click.logvleave) node.addEventListener('mouseleave', ui.click.logvleave);
    }
    if (!game.online && event) event.logvid = node.logvid;
    return node;
  }
  function neutralCard(node) {
    if (!node) return node;
    if (node.classList) node.classList.add('thrown');
    if (node.style) {
      node.style.left = '50%';
      node.style.top = '42%';
      node.style.borderImageSource = 'none';
      node.style.transform = 'translate(-50%,-50%) scale(0.9)';
    }
    if (node.querySelectorAll) node.querySelectorAll('.used-info,.cardsetion').forEach(label => { label.textContent = anonymousName + '使用'; });
    if (ui.arena && ui.arena.appendChild) ui.arena.appendChild(node);
    if (ui.thrown && !ui.thrown.includes(node)) ui.thrown.push(node);
    if (ui.refresh) ui.refresh(node);
    if (node.style) node.style.transform = 'translate(-50%,-50%) scale(1)';
    return node;
  }
  function neutralThrow(value) {
    const cards = Array.isArray(value) ? value : typeof value === 'number' ? Array.from({ length: value }, () => null) : [value];
    let last;
    cards.forEach(card => {
      let node;
      if (card && typeof card.copy === 'function') node = card.copy('thrown');
      else if (ui.create && ui.create.card) {
        node = ui.create.card();
        if (card && node.init) node.init([card.suit || '', card.number || '', card.name || '', card.nature || '']);
        else if (node.classList) node.classList.add('infohidden');
      }
      if (node) last = neutralCard(node);
    });
    return last;
  }
  function installPatches() {
    wrap(game, 'log', function (original, args) {
      const active = currentScopes();
      if (mutedSkill && active.length && args.some(value => hides(value, active))) return;
      return active.length ? display(() => original.apply(this, args.map(value => scrub(value, active, true)))) : original.apply(this, args);
    });
    wrap(game, 'logv', function (original, args) {
      const active = currentScopes(args[3]);
      if (!active.length) return original.apply(this, args);
      const player = args[0], card = args[1];
      if (mutedSkill && hides(player, active)) return;
      if (hides(player, active)) return display(() => makeHistory(card, args[2], args[3] || _status.event, args[5], active));
      // The victim's death remains visible; only the optional killer avatar is omitted.
      if (card === 'die' && hides(args[2], active)) args[2] = undefined;
      if (typeof card === 'string') args[1] = scrubString(card, active);
      return display(() => original.apply(this, args));
    });
    wrap(get, 'translation', function (original, args) {
      const active = currentScopes();
      if (!active.length || (!rendering && !isResponse())) return original.apply(this, args);
      return scrubString(original.apply(this, args.map(value => scrub(value, active, true))), active);
    });
    wrap(get, 'skillTranslation', function (original, args) {
      const result = original.apply(this, args), active = currentScopes();
      return active.length && (rendering || isResponse()) ? scrubString(result, active) : result;
    });
    ['slimName', 'slimNameHorizontal', 'rawName', 'rawName2'].forEach(key => wrap(get, key, function (original, args) {
      const result = original.apply(this, args), active = currentScopes();
      return active.length && (rendering || isResponse()) ? scrubString(result, active) : result;
    }));
    wrap(get, 'cardsetion', function (original, args) {
      const active = currentScopes();
      if (active.length && hides(args[0], active)) return anonymousName + '使用';
      return original.apply(this, args);
    });
    wrap(ui.create, 'dialog', function (original, args) {
      const active = currentScopes();
      // Player objects in a guess chooser must retain every real candidate name/avatar.
      return original.apply(this, active.length ? args.map(value => scrub(value, active, false)) : args);
    });
    wrap(game, 'playCardAudio', function (original, args) {
      return hides(args[1], currentScopes()) ? undefined : original.apply(this, args);
    });
    wrap(game, 'trySkillAudio', function (original, args) {
      return hides(args[1], currentScopes()) ? undefined : original.apply(this, args);
    });
    wrap(game, 'playAudio', function (original, args) {
      // The decade audio hook runs synchronously before useCard returns its event.
      if (preparing.length || currentScopes().length && args.some(value => typeof value === 'string' && value.includes('audio/caidan/'))) return;
      return original.apply(this, args);
    });
    const decadeObjects = [];
    if (typeof window !== 'undefined' && window.decadeUI) decadeObjects.push(window.decadeUI);
    if (typeof globalThis !== 'undefined' && globalThis.decadeUI && !decadeObjects.includes(globalThis.decadeUI)) decadeObjects.push(globalThis.decadeUI);
    decadeObjects.forEach(decade => {
      ['kill', 'skill'].forEach(key => wrap(decade.effect, key, function (original, args) {
        if (hides(args[0], currentScopes())) return;
        return original.apply(this, args);
      }));
    });
    wrap(game, 'addVideo', function (original, args) {
      const active = currentScopes();
      if (!active.length) return original.apply(this, args);
      if (hides(args[1], active) && ['line', 'throw', 'popup', 'skill', 'card'].includes(args[0])) return;
      if (args[0] === 'log') args[2] = scrubString(args[2], active);
      // addVideo is a presentation record, never the damage event or its history.
      if (args[0] === 'damage' && active.some(scope => scope.source.dataset && scope.source.dataset.position === args[2])) args[2] = undefined;
      return original.apply(this, args);
    });
    const prototypes = [];
    if (lib.element && lib.element.Player) prototypes.push(lib.element.Player.prototype);
    if (lib.element && lib.element.player) prototypes.push(lib.element.player);
    const players = (game.players || []).concat(game.dead || [], scopes.map(scope => scope.source), preparing);
    const objects = prototypes.filter(Boolean).concat(players);
    const hideMethods = ['line', 'line2', 'popup', 'popup_old', 'tryCardAnimate', 'trySkillAnimate', '$skill', '$fullscreenpop', 'focus', '$focus'];
    objects.forEach(object => {
      if (prototypes.includes(object) || Object.prototype.hasOwnProperty.call(object, 'say')) wrap(object, 'say', function (original, args) {
        const active = currentScopes();
        if (preparing.length || hides(this, active)) return;
        if (active.length) args[0] = scrub(args[0], active, true);
        return original.apply(this, args);
      });
      hideMethods.forEach(key => {
        if (!prototypes.includes(object) && !Object.prototype.hasOwnProperty.call(object, key)) return;
        wrap(object, key, function (original, args) {
          const active = currentScopes();
          if (hides(this, active)) return;
          if ((key === 'line' || key === 'line2') && (hides(args[0], active) || Array.isArray(args[0]) && args[0].some(value => hides(value, active)))) return;
          if ((key === 'popup' || key === 'popup_old') && active.length) args[0] = scrub(args[0], active, true);
          return original.apply(this, args);
        });
      });
      if (prototypes.includes(object) || Object.prototype.hasOwnProperty.call(object, 'logSkill')) wrap(object, 'logSkill', function (original, args) {
        if (!hides(this, currentScopes())) return original.apply(this, args);
        // logSkill also records useSkill/round counters and creates real engine events.
        mutedSkill++;
        try { return original.apply(this, args); } finally { mutedSkill--; }
      });
      ['$throw', '$throwordered', '$throwordered2'].forEach(key => {
        if (!prototypes.includes(object) && !Object.prototype.hasOwnProperty.call(object, key)) return;
        wrap(object, key, function (original, args) {
          if (!hides(this, currentScopes())) return original.apply(this, args);
          // Judge/transition callers need a real node back; a centered card carries no player label.
          return key === '$throw' ? neutralThrow(args[0]) : neutralCard(args[0]);
        });
      });
      if (prototypes.includes(object) || Object.prototype.hasOwnProperty.call(object, '$damage')) wrap(object, '$damage', function (original, args) {
        if (hides(args[0], currentScopes())) args[0] = undefined;
        return original.apply(this, args);
      });
      if (prototypes.includes(object) || Object.prototype.hasOwnProperty.call(object, '$damagepop')) wrap(object, '$damagepop', function (original, args) {
        if (typeof args[0] === 'string' && hides(this, currentScopes())) return;
        return original.apply(this, args);
      });
    });
    scopes.forEach(scope => protectFrame(scope.source));
  }
  function install() {
    // Deliberately synchronous and queue-free: extension load order is settled at begin().
    return api.anonymous;
  }
  function begin(event) {
    if (!event || event.name !== 'useCard' || !event.player) throw new TypeError('匿名作用域需要真实 useCard 事件');
    const source = event.player;
    const names = [source.name, source.name1, source.name2, source.nickname];
    if (get.translation) {
      [source, source.name, source.name1, source.name2].forEach(value => { if (value) { try { names.push(get.translation(value)); } catch (_) {} } });
    }
    const scope = { event, source, names: [...new Set(names.filter(name => typeof name === 'string' && name && name !== anonymousName))], active: true, flags: [] };
    // These are existing engine presentation flags, not targeting or source rule fields.
    [['line', false], ['throw', false], ['nopopup', true], ['audio', false]].forEach(([key, value]) => {
      scope.flags.push({ key, value, descriptor: Object.getOwnPropertyDescriptor(event, key) });
      event[key] = value;
    });
    scopes.push(scope);
    try { installPatches(); } catch (error) { end(scope); throw error; }
    return scope;
  }
  function createUse(source, callback) {
    if (!source || typeof callback !== 'function') throw new TypeError('匿名用牌创建需要真实来源与同步创建函数');
    preparing.push(source);
    try {
      installPatches();
      return callback();
    } finally {
      preparing.splice(preparing.lastIndexOf(source), 1);
      restorePatches();
    }
  }
  function end(scope) {
    if (!scope || !scope.active || !scopes.includes(scope)) return;
    scope.active = false;
    scope.flags.forEach(flag => {
      if (scope.event[flag.key] !== flag.value) return;
      if (flag.descriptor) Object.defineProperty(scope.event, flag.key, flag.descriptor);
      else delete scope.event[flag.key];
    });
    scopes.splice(scopes.indexOf(scope), 1);
    // Subsequently installed third-party wrappers/descriptors are never overwritten.
    restorePatches();
  }
  api.anonymous = { install, createUse, begin, end };
  return { skills: {}, translate: {} };
},
function createMamaoSkills(lib, game, ui, get, ai, _status, api) {
  const running = new Set();
  const blocked = new WeakMap();
  const living = player => !!player && player.isIn();
  const ancestry = (event, predicate) => {
    const seen = new Set();
    while (event && !seen.has(event)) {
      if (predicate(event)) return event;
      seen.add(event);
      event = event.parent || (typeof event.getParent === 'function' && event.getParent(1, true));
    }
    return null;
  };
  function otherPlayers(player) {
    const result = game.filterPlayer(current => current !== player);
    if (typeof result.sortBySeat === 'function') return result.sortBySeat(player);
    const seats = game.players || [], offset = seats.indexOf(player);
    return result.sort((a, b) => (seats.indexOf(a) - offset + seats.length) % seats.length - (seats.indexOf(b) - offset + seats.length) % seats.length);
  }
  function usable(card, source, target) {
    return living(source) && living(target) && source !== target &&
      lib.filter.cardEnabled(card, source, 'forceEnable') !== false &&
      lib.filter.targetEnabled2(card, source, target);
  }
  function shuffle(players) {
    const list = players.slice();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }
  function restrictUntilPhaseEnd(player, phaseUse) {
    let phases = blocked.get(player);
    if (!phases) blocked.set(player, phases = new Set());
    phases.add(phaseUse || null);
    // A functional expiry is supported by GameEvent.trigger, but addTempSkill
    // only populates hookmap for object expiries. Register these gates here.
    lib.hookmap ??= {};
    for (const name of ['phaseUseAfter', 'phaseAfter', 'phaseBeforeStart']) lib.hookmap[name] = true;
    player.addTempSkill('马茂_禁牌', (event, current, name) => {
      if (name === 'phaseUseAfter') {
        phases.delete(event);
        phases.delete(null);
      } else if (name === 'phaseAfter' || name === 'phaseBeforeStart') {
        // Direct/manual test activation has no genuine phaseUse ancestor.
        phases.delete(null);
      }
      if (phases.size) return false;
      blocked.delete(player);
      return true;
    });
  }
  function damageChoices(source, target) {
    const choices = [];
    for (const name of lib.inpile || []) {
      const card = { name, isCard: true };
      const type = get.type(card);
      if (!['basic', 'trick'].includes(type) || !get.tag(card, 'damage')) continue;
      const natures = name === 'sha' ? [undefined, ...(lib.inpile_nature || [])] : [undefined];
      for (const nature of natures) {
        const candidate = nature ? { ...card, nature } : card;
        if (usable(candidate, source, target)) choices.push([type, '', name, nature]);
      }
    }
    return choices;
  }
  const fromLink = link => link && ({ name: link[2], ...(link[3] ? { nature: link[3] } : {}), isCard: true });
  function directedUse(source, target, card, damage, state) {
    const use = source.useCard(card, target, false);
    use.baseDamage = damage;
    use.forceDie = true;
    use.马茂定向 = target;
    if (state) use.马茂事觉 = state;
    // Native useCard may expand changeTarget before returning the event.
    use.targets = [target];
    use.stocktargets = [target];
    return use;
  }
  const silent = { charlotte: true, forced: true, popup: false, silent: true, forceDie: true, forceOut: true };
  const skills = {
    '联逆': {
      enable: 'phaseUse',
      usable: 1,
      forceDie: true,
      filter(event, player) { return game.filterPlayer(current => current !== player).length > 0; },
      async content(event, trigger, player) {
        const context = { owner: player, target: null, phaseUse: ancestry(event, current => current.name === 'phaseUse'), used: new Set(), dying: new Set(), same: [], different: [] };
        running.add(context);
        try {
          for (const other of otherPlayers(player)) {
            if (!living(player)) break;
            if (!living(other) || !player.countCards('h') || !other.countCards('h')) continue;
            const choice = player.chooseCardOL([player, other], 'h', 1, true, '联逆：各选择一张手牌，与对方同时交换')
              .set('ai', card => 6 - get.value(card));
            // chooseCardOL keeps both choices private until both are final.
            if (Array.isArray(choice._args) && typeof choice._args.remove === 'function') choice._args.remove('glow_result');
            const result = await choice.forResult();
            const own = result?.[0]?.cards?.[0], theirs = result?.[1]?.cards?.[0];
            if (!own || !theirs || !living(player) || !living(other) ||
                !player.getCards('h').includes(own) || !other.getCards('h').includes(theirs)) continue;
            const sameColor = get.color(own, player) === get.color(theirs, other);
            await player.swapHandcards(other, [own], [theirs]);
            (sameColor ? context.same : context.different).push(other);
          }
          if (!living(player) || !game.filterPlayer(current => current !== player).length) return;
          const result = await player.chooseTarget(true, '联逆：选择一名其他角色', (card, owner, target) => owner !== target && living(target))
            .set('ai', target => -get.attitude(player, target)).forResult();
          const target = result?.targets?.[0];
          if (!living(target) || target === player) return;
          context.target = target;
          for (const other of context.different) {
            if (other !== target && living(other)) restrictUntilPhaseEnd(other, context.phaseUse);
          }
          const queue = shuffle([player, ...context.same].filter(current => current !== target));
          for (const source of queue) {
            if (!living(target)) break;
            const card = { name: 'sha', isCard: true };
            if (!usable(card, source, target)) continue;
            const use = api.anonymous.createUse(source, () => source.useCard(card, target, false));
            use.forceDie = true;
            use.马茂联逆 = { context, target, guessed: false };
            use.马茂定向 = target;
            use.targets = [target];
            use.stocktargets = [target];
            const token = api.anonymous.begin(use);
            use.马茂匿名 = token;
            try { await use; }
            finally { api.anonymous.end(token); }
          }
        } finally {
          running.delete(context);
        }
        if (context.target) {
          const end = game.createEvent('马茂联逆结束');
          end.player = player;
          end.forceDie = true;
          end.马茂上下文 = context;
          end.setContent([async function () {}]);
          await end;
        }
      },
      ai: { order: 9, result: { player: 1 } },
    },
    '事觉': {
      trigger: { global: '马茂联逆结束After' },
      forced: true,
      locked: false,
      filter(event, player) {
        const context = event.马茂上下文;
        return !!context && context.owner === player && player.hasSkill('事觉') &&
          living(player) && living(context.target) && context.used.size > 0 && !context.dying.has(context.target);
      },
      async content(event, trigger, player) {
        const context = trigger.马茂上下文, target = context.target;
        const choices = damageChoices(target, player);
        if (!choices.length) return;
        const result = await target.chooseButton(['事觉：选择一张伤害牌，对' + get.translation(player) + '使用', [choices, 'vcard']], true)
          .set('ai', button => get.effect(player, fromLink(button.link), target, target)).forResult();
        const card = fromLink(result?.links?.[0]);
        if (!card || !living(player) || !usable(card, target, player)) return;
        const state = { owner: player, target, damaged: false, used: false };
        const use = directedUse(target, player, card, context.used.size, state);
        await use;
        if (!state.used || state.damaged || !living(player) || !living(target) || !player.hasSkill('事觉')) return;
        const reflected = { ...card };
        if (!usable(reflected, player, target)) return;
        const answer = await player.chooseButton(['事觉：是否对' + get.translation(target) + '使用同名伤害牌？', [[[get.type(reflected), '', reflected.name, reflected.nature]], 'vcard']])
          .set('prompt', '事觉：是否反击？')
          .set('ai', () => get.effect(target, reflected, player, player)).forResult();
        if (!answer?.bool || !living(player) || !usable(reflected, player, target) || !player.hasSkill('事觉')) return;
        await directedUse(player, target, reflected, target.hp);
      },
    },
    '马茂_禁牌': {
      charlotte: true,
      mark: true,
      marktext: '禁',
      intro: { content: '本出牌阶段不能使用牌（可以打出牌）' },
      mod: { cardEnabled() { return false; } },
    },
    '马茂_记濒死': {
      ...silent,
      trigger: { global: 'dying' },
      filter() { return running.size > 0; },
      async content(event, trigger) { for (const context of running) context.dying.add(trigger.player); },
    },
    '马茂_记用牌': {
      ...silent,
      trigger: { global: 'useCard1' },
      filter(event) { return !!event.马茂联逆 || !!event.马茂事觉; },
      async content(event, trigger) {
        if (trigger.马茂联逆 && trigger.card?.name === 'sha') trigger.马茂联逆.context.used.add(trigger.player);
        if (trigger.马茂事觉) trigger.马茂事觉.used = true;
      },
    },
    '马茂_猜来源': {
      ...silent,
      trigger: { global: 'useCardToPlayer' },
      priority: 100000,
      filter(event) {
        const use = ancestry(event, current => current.name === 'useCard' && current.马茂联逆);
        return !!use && use.card?.name === 'sha' && !use.马茂联逆.guessed && living(use.马茂联逆.target);
      },
      async content(event, trigger) {
        const use = ancestry(trigger, current => current.name === 'useCard' && current.马茂联逆);
        const data = use.马茂联逆, target = data.target;
        if (data.guessed) return;
        data.guessed = true;
        const result = await target.chooseTarget('联逆：可以猜测此【杀】的使用者（取消则放弃）', (card, chooser, candidate) => candidate !== chooser && living(candidate))
          .set('filterTarget', (card, chooser, candidate) => candidate !== chooser && living(candidate))
          .set('ai', () => Math.random()).forResult();
        const guess = result?.targets?.[0];
        if (guess !== use.player || !living(guess)) return;
        use.all_excluded = true;
        for (const victim of use.targets) if (!use.excluded?.includes(victim)) (use.excluded ??= []).push(victim);
        api.anonymous.end(use.马茂匿名);
        game.log(target, '猜中了此【杀】的使用者', use.player);
        if (living(target) && living(use.player)) await use.player.damage(1, target);
      },
    },
    '马茂_定向': {
      ...silent,
      trigger: { global: 'useCard2' },
      lastDo: true,
      priority: -100000,
      filter(event) { return !!event.马茂定向; },
      async content(event, trigger) {
        trigger.targets.splice(0, trigger.targets.length, ...(living(trigger.马茂定向) ? [trigger.马茂定向] : []));
      },
    },
    '马茂_记受伤': {
      ...silent,
      trigger: { global: 'damageEnd' },
      filter(event) {
        return event.num > 0 && !!ancestry(event, current => current.马茂事觉?.owner === event.player);
      },
      async content(event, trigger) {
        const use = ancestry(trigger, current => current.马茂事觉?.owner === trigger.player);
        if (use) use.马茂事觉.damaged = true;
      },
    },
  };
  // ArrayCompiler preserves these closures even if the extension is evaluated
  // in a different realm from the engine's AsyncFunction constructor.
  for (const skill of Object.values(skills)) {
    if (typeof skill.content === 'function') skill.content = [skill.content];
  }
  const translate = {
    '联逆': '联逆',
    '联逆_info': '出牌阶段限一次，你可以与所有其他角色依次交换一张手牌，然后选择一名其他角色，你与所有本次和你交换了相同颜色手牌的除该角色外的其他角色，按照随机顺序对该角色视为使用一张不公开使用者的“杀”，该角色成为这些“杀”的目标时，可以猜测使用者是谁，若猜对则这张杀无效且该角色对使用者造成一点伤害，本阶段除该角色外的与你交换了不同颜色手牌的其他角色不能使用牌。',
    '事觉': '事觉',
    '事觉_info': '“联逆”结算完成后，若目标角色在“联逆”的结算期间未进入过濒死状态，目标角色视为对你使用一张基础伤害为本次对其使用“杀”的角色数的任意伤害牌，此牌结算完成后，若你未因此受到伤害，你可以视为对该角色使用一张基础伤害为该角色当前体力值的同名伤害牌。',
    '马茂_禁牌': '联逆',
    '马茂_禁牌_info': '本出牌阶段不能使用牌。',
  };
  api.skills = {
    install() {
      for (const name of Object.keys(skills)) {
        if (!lib.skill[name]) game.addSkill(name, skills[name], translate[name], translate[name + '_info']);
      }
      for (const name of ['马茂_记濒死', '马茂_记用牌', '马茂_猜来源', '马茂_定向', '马茂_记受伤']) game.addGlobalSkill(name);
    },
  };
  return { skills, translate };
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills)),translate=Object.assign({},...modules.map(module=>module.translate));
 let installed=false;
 return {
  name:'马茂',editable:true,connect:false,
  content(){
   if(installed)return;
   for(const name of Object.keys(skills))if(!lib.skill[name])game.addSkill(name,skills[name],translate[name],translate[name+'_info']);
   Object.assign(lib.translate,translate);
   api.anonymous.install();api.skills.install();installed=true;
  },precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_mamao:['male','wu',3,['联逆','事觉'],['die:false','ext:玄谍既白/bjgy_mamao.jpg']]},
    translate:{bjgy_mamao:'马茂'},characterIntro:{bjgy_mamao:'马茂，吴，男性，初始体力3，体力上限3。技能：联逆、事觉。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由GPT绘制、设计者提供。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'马茂：吴、男、3/3。联逆、事觉。含匿名出杀显示适配，面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_mamao.jpg'],card:[],skill:[],audio:[]}
 };
})(lib,game,ui,get,ai,_status),
(function(lib,game,ui,get,ai,_status){
 'use strict';
 const factories=[function xiemouFactory(lib, game, ui, get, ai, _status, api) {
  const ID = '泄谋';
  const DAMAGE = '郭模_泄谋增伤';
  const DISCARD = '郭模_泄谋弃牌';
  const pendingDamage = new WeakMap();
  const pendingDiscard = new WeakMap();

  function living(player) { return !!player && player.isIn(); }
  function layers(player, key) { return Math.max(0, Number(player.storage[key]) || 0); }
  function sync(player, key) {
    player.syncStorage(key);
    if (layers(player, key)) player.markSkill(key);
    else player.unmarkSkill(key);
  }
  function add(player, key, number) {
    player.storage[key] = layers(player, key) + number;
    sync(player, key);
  }
  function take(player, key) {
    const number = layers(player, key);
    delete player.storage[key];
    sync(player, key);
    return number;
  }
  function actual(event) { return !event.unreal && event.num > 0; }
  function recorded(player, event, kind) {
    return actual(event) && player.actionHistory.some(history => history[kind]?.includes(event));
  }

  const skills = {
    [ID]: {
      audio: false,
      enable: 'phaseUse',
      usable: 1,
      position: 'he',
      filterCard: true,
      selectCard: [1, Infinity],
      discard: false,
      lose: false,
      delay: false,
      selectTarget: 2,
      multitarget: true,
      multiline: true,
      targetprompt: ['收牌角色', '另一名角色'],
      forceDie: true,
      forceOut: true,
      filter(event, player) {
        return player.countCards('he') > 0 && game.countPlayer(current => current !== player) >= 2;
      },
      filterTarget(card, player, target) { return target !== player && living(target); },
      check(card) { return 6 - get.value(card); },
      content: [async function (event, trigger, player) {
        const cards = event.cards || [];
        const [first, second] = event.targets || [];
        if (!cards.length || !living(first) || !living(second) || first === second || first === player || second === player) return;
        const available = player.getCards('he');
        if (cards.some(card => !available.includes(card))) return;

        // Card transformations and gain/lose reactions may change the effective
        // type or owner. Every category is fixed while the cards are still held.
        const types = new Set(cards.map(card => get.type2(card, player)));
        await player.give(cards, first);

        if (types.has('basic')) {
          if (living(first)) add(first, DAMAGE, 1);
          if (living(second)) add(second, DISCARD, 1);
        }
        if (types.has('trick')) {
          if (living(player)) await player.draw(2);
          if (living(first)) await first.draw(2);
        }
        if (types.has('equip') && living(first) && living(second)) {
          const duel = { name: 'juedou', isCard: true };
          // Keep the ordinary native legality and useCard rules. Juedou itself
          // has no distance limit; no additional distance/count bypass is added.
          if (first.canUse(duel, second)) await first.useCard(duel, second);
        }
      }],
      ai: {
        order: 7,
        result: {
          target(player, target) {
            return ui.selected.targets.length ? -1 : 1;
          },
        },
      },
    },
    [DAMAGE]: {
      charlotte: true,
      forced: true,
      silent: true,
      popup: false,
      forceDie: true,
      forceOut: true,
      priority: 100,
      trigger: { source: 'damageBegin1' },
      filter(event, player) {
        return actual(event) && layers(player, DAMAGE) > 0 && !pendingDamage.has(event);
      },
      content: [async function (event, trigger, player) {
        if (!actual(trigger) || pendingDamage.has(trigger)) return;
        const number = take(player, DAMAGE);
        if (!number) return;
        pendingDamage.set(trigger, number);
        trigger.num += number;
        // Reserve before reactions can produce nested damage. A prevented hit
        // refunds its layers, adding to any new layers granted during reactions.
        trigger.insertAfter([async function () {
          if (!pendingDamage.delete(trigger)) return;
          if (!recorded(player, trigger, 'sourceDamage')) add(player, DAMAGE, number);
        }], { player, forceDie: true, includeOut: true });
      }],
      marktext: '谋',
      intro: { content(storage) { return `下一次实际造成的伤害+${storage || 0}，不随回合结束或郭模离场而消失`; } },
    },
    [DISCARD]: {
      charlotte: true,
      forced: true,
      silent: true,
      popup: false,
      forceDie: true,
      forceOut: true,
      priority: 100,
      trigger: { player: ['damageBegin1', 'damageEnd'] },
      filter(event, player, timing) {
        if (timing === 'damageBegin1') return actual(event) && layers(player, DISCARD) > 0 && !pendingDiscard.has(event);
        return timing === 'damageEnd' && pendingDiscard.has(event) && recorded(player, event, 'damage');
      },
      content: [async function (event, trigger, player) {
        if (event.triggername === 'damageBegin1') {
          if (!actual(trigger) || pendingDiscard.has(trigger)) return;
          const number = take(player, DISCARD);
          if (!number) return;
          pendingDiscard.set(trigger, number);
          trigger.insertAfter([async function () {
            pendingDiscard.delete(trigger);
            if (!recorded(player, trigger, 'damage')) add(player, DISCARD, number);
          }], { player, forceDie: true, includeOut: true });
          return;
        }
        const number = pendingDiscard.get(trigger);
        if (!number || !recorded(player, trigger, 'damage')) return;
        pendingDiscard.delete(trigger);
        const damage = trigger.num;
        for (let i = 0; i < number && living(player); i++) {
          if (player.countCards('he') > 0) {
            await player.chooseToDiscard('he', true, damage).set('prompt', `泄谋：弃置${get.cnNumber(damage)}张手牌或装备牌`);
          }
        }
      }],
      marktext: '谋',
      intro: { content(storage) { return `下一次实际受到伤害后，按伤害值自行弃置手牌或装备牌，共${storage || 0}层，每层分别结算`; } },
    },
  };

  let installed = false;
  api.xiemou = {
    install() {
      if (installed) return;
      game.addGlobalSkill(DAMAGE);
      game.addGlobalSkill(DISCARD);
      installed = true;
    },
    layers(player) { return { damage: layers(player, DAMAGE), discard: layers(player, DISCARD) }; },
  };
  return {
    skills,
    translate: {
      [ID]: '泄谋',
      [ID + '_info']: '出牌阶段限一次，你可以交给一名其他角色任意张牌并选择另一名其他角色，然后根据你本次给出的牌中包含的类型执行对应效果：1.基本牌：获得牌的角色下一次造成的伤害+1，未获得牌的角色下一次受到伤害后弃置本次受到的伤害数张牌；2.锦囊牌：你与获得牌的角色各摸两张牌；3.装备牌：获得牌的角色视为对未获得牌的角色使用一张“决斗”。',
      [DAMAGE]: '泄谋·增伤',
      [DISCARD]: '泄谋·弃牌',
    },
  };
},
function guoweiFactory(lib, game, ui, get, ai, _status, api) {
  const fixedId = '郭模_过魏定距';
  const resolvedKey = '郭模_过魏已结算';

  function inGame(player) {
    return !!player && player.isIn();
  }

  function hasGuowei(player) {
    // Native hasSkill() uses the filtered current skills, so fengyin,
    // disableSkill and skill blockers also turn off this global correction.
    return inGame(player) && player.hasSkill('过魏');
  }

  function equipmentDistance(from, to) {
    let total = 0;
    const selected = ui.selected && ui.selected.cards || [];
    const usable = card => !card.cards || !card.cards.some(part => selected.includes(part));
    for (const card of from.getVCards('e', usable)) {
      const info = get.info(card);
      if (info && info.distance && info.distance.globalFrom) total += info.distance.globalFrom;
    }
    for (const card of to.getVCards('e', usable)) {
      const info = get.info(card);
      if (info && info.distance && info.distance.globalTo) total += info.distance.globalTo;
    }
    return total;
  }

  function fixedDistance(from, to) {
    return 1 - equipmentDistance(from, to);
  }

  function useEvent(trigger) {
    if (trigger.name === 'useCard') return trigger;
    const use = trigger.getParent('useCard');
    return use && use.name === 'useCard' ? use : null;
  }

  function soleOtherTarget(trigger, player, use) {
    if (!use || use.player !== player || !trigger.card) return null;
    const targets = trigger.targets || use.targets;
    if (!targets || targets.length !== 1 || targets[0] === player) return null;
    if (trigger.target !== targets[0]) return null;
    return targets[0];
  }

  function point(card, holder) {
    const number = get.number(card, holder);
    return typeof number === 'number' && Number.isFinite(number) ? number : 0;
  }

  function unrespondable(use, trigger) {
    // Installed 1.11.6 standard sha/juedou read directHit. Its _wuxie also
    // excludes every player in the parent useCard's directHit list.
    if (!Array.isArray(use.directHit)) use.directHit = [];
    for (const current of game.players) {
      if (!use.directHit.includes(current)) use.directHit.push(current);
    }
    trigger.directHit = use.directHit;
  }

  const skills = {
    '过魏': {
      audio: false,
      forced: true,
      locked: true,
      trigger: { player: 'useCardToPlayered' },
      mod: {
        globalFrom(from, to) {
          if (from !== to && hasGuowei(from)) return fixedDistance(from, to);
        },
        globalTo(from, to) {
          if (from !== to && hasGuowei(to)) return fixedDistance(from, to);
        },
      },
      filter(trigger, player) {
        const use = useEvent(trigger);
        const target = soleOtherTarget(trigger, player, use);
        return !!target && !use[resolvedKey] && inGame(player) && inGame(target);
      },
      // ArrayCompiler retains this closure even when the legacy extension
      // factory was evaluated in a different realm from the native compiler.
      content: [async function (event, trigger, player) {
        const use = useEvent(trigger);
        const target = soleOtherTarget(trigger, player, use);
        if (!target || use[resolvedKey] || !inGame(player) || !inGame(target)) return;
        use[resolvedKey] = true;
        const hand = target.getCards('h').slice();
        if (!hand.length) return;

        // Explicit blank buttons also stay face down if another skill normally
        // reveals hands or this player controls the target's selections.
        for (let i = hand.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const card = hand[i]; hand[i] = hand[j]; hand[j] = card;
        }
        const shownResult = await player.chooseButton([
          '过魏：选择' + get.translation(target) + '的一张手牌展示',
          [hand, 'blank'],
        ], true).set('ai', () => Math.random()).forResult();
        const shown = shownResult && shownResult.links && shownResult.links[0];
        if (!shown || !inGame(player) || !inGame(target) || !target.getCards('h').includes(shown)) return;
        await target.showCards([shown], '过魏');
        if (!inGame(player) || !inGame(target) || !target.getCards('h').includes(shown)) return;

        const used = [].concat(use.cards || trigger.cards || [], use.card && use.card.cards || []);
        const canGive = card => !used.includes(card);
        if (!player.getCards('h').some(canGive)) return;
        const ownResult = await player.chooseCard('h', true,
          '过魏：选择一张手牌与展示的牌交换', canGive)
          .set('ai', card => {
            const difference = point(card, player) - point(shown, target);
            return (difference > 0 ? 3 : difference < 0 ? 2 : 0) - get.value(card);
          }).forResult();
        const outgoing = ownResult && ownResult.cards && ownResult.cards[0];
        if (!outgoing || !canGive(outgoing) || !inGame(player) || !inGame(target)) return;
        if (!player.getCards('h').includes(outgoing) || !target.getCards('h').includes(shown)) return;

        // Both values are evaluated from their outgoing owners' perspectives,
        // before the exchange can change either owner's point modifiers.
        const ownPoint = point(outgoing, player);
        const targetPoint = point(shown, target);
        await player.swapHandcards(target, [outgoing], [shown]);
        if (ownPoint < targetPoint) {
          if (inGame(player)) await player.draw(1);
        } else if (ownPoint > targetPoint) {
          unrespondable(use, trigger);
          if (inGame(player) && inGame(target) && target.countCards('he', card =>
            lib.filter.canBeDiscarded(card, player, target, '过魏'))) {
            await player.discardPlayerCard(target, 'he', true);
          }
        }
      }],
    },
    [fixedId]: {
      charlotte: true,
      silent: true,
      popup: false,
      priority: 1000000000,
      mod: {
        globalTo(from, to) {
          // get.distance/inRange append equipment after skill mods. Run after
          // ordinary target mods and precompensate that exact equipment sum.
          if (from !== to && (hasGuowei(from) || hasGuowei(to))) return fixedDistance(from, to);
        },
      },
    },
  };

  api.guowei = {
    install() {
      lib.skill[fixedId] = skills[fixedId];
      game.addGlobalSkill(fixedId);
    },
  };

  return {
    skills,
    translate: {
      '过魏': '过魏',
      '过魏_info': '锁定技，你和所有其他角色相互计算距离为1；你使用牌指定其他角色为唯一目标时，展示目标角色一张手牌，然后你选择一张手牌与其交换，若你交出的牌点数更小，你摸一张牌，若你交出的牌点数更大，你弃置该角色一张牌且此牌不能被响应。',
    },
  };
}];
 const api={},modules=factories.map(factory=>factory(lib,game,ui,get,ai,_status,api));
 const skills=Object.assign({},...modules.map(module=>module.skills)),translate=Object.assign({},...modules.map(module=>module.translate));
 let installed=false;
 return {
  name:'郭模',editable:true,connect:false,
  content(){
   if(installed)return;
   for(const name of Object.keys(skills))if(!lib.skill[name])game.addSkill(name,skills[name],translate[name],translate[name+'_info']);
   Object.assign(lib.translate,translate);
   api.xiemou.install();api.guowei.install();installed=true;
  },precontent(){},help:{},config:{},
  package:{
   character:{character:{bjgy_guomo:['male','wei',3,['泄谋','过魏'],['die:false','ext:玄谍既白/bjgy_guomo.jpg']]},
    translate:{bjgy_guomo:'郭模'},characterIntro:{bjgy_guomo:'郭模，魏，男性，初始体力3，体力上限3。技能：泄谋、过魏。技能设计：辟境归元；代码实现与打包：OpenAI Codex协助；原画由GPT绘制、设计者提供。'}},
   card:{card:{},translate:{},list:[]},skill:{skill:skills,translate},
   intro:'郭模：魏、男、3/3。泄谋、过魏。面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'0.1.0'
  },files:{character:['bjgy_guomo.jpg'],card:[],skill:[],audio:[]}
 };
})(lib,game,ui,get,ai,_status)];
 const merge=objects=>{
  const result={};
  for(const object of objects)for(const[key,value]of Object.entries(object||{})){
   if(Object.prototype.hasOwnProperty.call(result,key))throw new Error('玄谍既白：重复登记 '+key);
   result[key]=value;
  }
  return result;
 };
 const character={};
 const characterKeys=new Set(parts.flatMap(part=>Object.keys(part.package.character)));
 for(const key of characterKeys)character[key]=merge(parts.map(part=>part.package.character[key]));
 const skills=merge(parts.map(part=>part.package.skill.skill));
 const translate=merge(parts.map(part=>part.package.skill.translate));
 function adaptContent(skill){
  for(const key of ['content','cost','precontent'])if(typeof skill[key]==='function'&&Object.prototype.toString.call(skill[key])==='[object AsyncFunction]')skill[key]=[skill[key]];
  for(const child of Object.values(skill.subSkill||{}))adaptContent(child);
 }
 for(const skill of Object.values(skills))adaptContent(skill);
 const portraits=parts.flatMap(part=>part.files.character);
 let installed=false,prepared=false;
 async function lifecycle(name,args){
  for(const part of parts){
   if(typeof part[name]!=='function')continue;
   const owned=Object.prototype.hasOwnProperty.call(lib,'arenaReady'),previous=lib.arenaReady;
   const queue=Array.isArray(previous)?previous:[];
   if(queue!==previous)lib.arenaReady=queue;
   const offset=queue.length;let result,callbacks;
   try{result=part[name].apply(this,args);}
   finally{
    callbacks=queue.splice(offset);
    if(queue!==previous&&lib.arenaReady===queue){if(owned)lib.arenaReady=previous;else delete lib.arenaReady;}
   }
   if(result&&typeof result.then==='function')await result;
   // Only callbacks synchronously scheduled by this source are drained.
   // Existing game/other-extension callbacks remain in their original queue.
   for(const callback of callbacks)await callback();
  }
 }
 return {
  name:'玄谍既白',editable:true,connect:false,
  async content(...args){
   if(installed)return;
   for(const[id,skill]of Object.entries(skills))if(!lib.skill[id]){
    const audio=Object.getOwnPropertyDescriptor(skill,'audio');
    game.addSkill(id,skill,translate[id],translate[id+'_info']);
    // Keep the source audio declaration until the native extension loader
    // injects its normal namespace; addSkill otherwise stringifies false.
    if(audio)Object.defineProperty(skill,'audio',audio);else delete skill.audio;
   }
   Object.assign(lib.translate,translate);
   await lifecycle.call(this,'content',args);installed=true;
  },
  async precontent(...args){if(prepared)return;await lifecycle.call(this,'precontent',args);prepared=true;},
  help:merge(parts.map(part=>part.help)),config:merge(parts.map(part=>part.config)),
  package:{character,card:{card:merge(parts.map(part=>part.package.card.card)),translate:merge(parts.map(part=>part.package.card.translate)),list:parts.flatMap(part=>part.package.card.list||[])},skill:{skill:skills,translate},
   intro:'隐蕃、郭脩、马茂、郭模四将整合扩展，包含完整技能与原画，面向无名杀1.11.6单机测试。',
   author:'辟境归元',diskURL:'',forumURL:'',version:'1.0.0'},
  files:{character:portraits,card:[],skill:[],audio:[]}
 };
});
