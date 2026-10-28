const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./helpers.cjs');
const key='starlight_save_u_test-keeper';
function legacy(extra={}) {
 return {v:1,gold:442808,gems:1200,highest:29,owned:['lumen','mirea','pio','aries'],party:['lumen','mirea','aries'],heroes:{lumen:{lv:40,star:3,shards:19},mirea:{lv:20,star:2,shards:44},pio:{lv:12,star:1,shards:8},aries:{lv:20,star:2,shards:31}},freeTen:false,pity:15,tutorial:true,stats:{summons:30,bossKills:15,ascends:5,ssrAscends:1,maxPower:15000,totalGold:442808},achievements:{sm10:true},lastSeen:Date.parse('2026-10-27T00:00:00Z'),...extra};
}
function seed(data){return new Map([[key,JSON.stringify(data)]]);}
test('v1 442,808 balance is corrected once; heroes, levels, shards, records survive; exact original backed up',()=>{
 const old=legacy(), p=harness({storage:seed(old)});
 const s=p.obj('Game.state');
 assert.equal(s.v,2);assert.equal(s.gold,20000);assert.equal(s.gems,1200);assert.equal(s.highest,29);
 assert.deepEqual(s.heroes,old.heroes);assert.deepEqual(s.party,old.party);assert.deepEqual(s.achievements,old.achievements);
 assert.equal(s.pity,15);assert.equal(s.freeTen,false);assert.equal(s.pending,null);
 assert.deepEqual(JSON.parse(p.storage.get(key+'.before-v2')),old);
 p.run('Game.state.gold=25000;Game.save();Game.reloadFromAuth()');assert.equal(p.run('Game.state.gold'),25000);
 assert.deepEqual(JSON.parse(p.storage.get(key+'.before-v2')),old);
});
test('mixed v1 kill/idle logs and 442,808 wallet never become claimable rewards',()=>{
 const p=harness({storage:seed(legacy({reports:[{t:Date.parse('2026-10-28T00:00:00Z'),amount:20000,label:'星'}, {t:Date.parse('2026-10-28T00:00:00Z'),amount:20000,label:'休息'}]}))});
 assert.equal(p.run('Game.getDailyRewardClaimed()'),0);assert.equal(p.run('Game.teacherLog().length'),0);
});
test('explicit same-day legacy cashouts carry over, capped, while old/other rewards are excluded',()=>{
 const p=harness({storage:seed(legacy({dailyReward:{date:'2026-10-28',amount:15000},reports:[{t:Date.parse('2026-10-28T00:00:00Z'),amount:20000,label:'도전 포기 수령'}],dailyPlays:{date:'2026-10-28',count:2}}))});
 assert.equal(p.run('Game.getDailyRewardClaimed()'),20000);assert.equal(p.run('Game.checkDailyPlays().available'),0);
 p.run('Game.save();Game.reloadFromAuth()');assert.equal(p.run('Game.getDailyRewardClaimed()'),20000);
});
test('waiting/returning players do not auto-start and cannot receive combat rewards',()=>{
 const p=harness({storage:seed(legacy())});assert.equal(p.run('Battle.started'),false);
 const before=p.run('Game.state.gold');assert.equal(p.run('Game.rewardKill(1,false)'),0);assert.equal(p.run('Game.stageCleared(1,false).points'),0);assert.equal(p.run('Game.state.gold'),before);
});
test('start consumes once, stage starts at 1; active start cannot spend another attempt',async()=>{
 const p=harness({storage:seed(legacy())});assert.equal((await p.run('Game.startChallenge()')).ok,true);
 assert.equal(p.run('Game.checkDailyPlays().used'),1);assert.equal(p.run('Battle.stage'),1);
 assert.equal((await p.run('Game.startChallenge()')).ok,false);assert.equal(p.run('Game.checkDailyPlays().used'),1);
});
test('cashout stops actual frame loop, credits rewards only, and duplicate cashout does nothing',async()=>{
 const p=harness();await p.run('Game.startChallenge()');p.step(12);
 assert.ok(p.run('Game.getChallengePot()')>0);
 const pot=p.run('Game.getChallengePot()'), gold=p.run('Game.state.gold'), stage=p.run('Battle.stage');
 const result=p.run('Game.cashoutChallengePot()');assert.equal(result.amount,pot);assert.equal(p.run('Game.state.gold'),gold);
 assert.equal(p.run('Battle.started'),false);assert.equal(p.run('Battle.phase'),'ended');p.step(30);
 assert.equal(p.run('Battle.stage'),stage);assert.equal(p.run('Game.state.gold'),gold);assert.equal(p.run('Game.getChallengePot()'),0);
 assert.equal(p.run('Game.getDailyRewardClaimed()'),pot);assert.equal(p.run('Game.cashoutChallengePot().ok'),false);
});
test('real party defeat ends run, loses only pot, has no automatic retry, and second run resets battle',async()=>{
 const p=harness();await p.run('Game.startChallenge()');p.step(10);
 // Inject defeat during combat, never during the between-stage healing animation.
 for(let i=0;i<30 && p.run('Battle.phase')!=='fight';i++)p.step(0.1);
 assert.equal(p.run('Battle.phase'),'fight');const gold=p.run('Game.state.gold');
 p.run('Battle.heroes.forEach(h=>{h.hp=0;h.dead=true})');p.step(1);
 assert.equal(p.run('Game.state.run.status'),'failed');assert.equal(p.run('Battle.started'),false);assert.equal(p.run('Game.getDailyRewardClaimed()'),0);
 p.step(15);assert.equal(p.run('Game.checkDailyPlays().used'),1);assert.equal(p.run('Game.state.gold'),gold);
 await p.run('Game.startChallenge()');assert.equal(p.run('Battle.stage'),1);assert.equal(p.run('Game.checkDailyPlays().used'),2);
 assert.ok(p.run('Battle.heroes.every(h=>h.hp===h.maxHp)'));
 p.run('Game.failChallengePot()');assert.equal((await p.run('Game.startChallenge()')).ok,false);
});
test('75-second timeout ends the run without restarting',async()=>{
 const p=harness();p.run('BALANCE.enemyHp=1e12;BALANCE.enemyAtk=0');await p.run('Game.startChallenge()');p.step(80);
 assert.equal(p.run('Game.state.run.status'),'failed');assert.equal(p.run('Battle.started'),false);assert.equal(p.run('Game.checkDailyPlays().used'),1);
});
test('daily reward is shared by two runs and auto-cashout uses only remaining daily allowance',async()=>{
 const p=harness();await p.run('Game.startChallenge()');p.run('Game.state.run.pot=7000;Game.cashoutChallengePot()');
 await p.run('Game.startChallenge()');p.run('Game.state.run.pot=12990;Game.stageCleared(1,false)');
 assert.equal(p.run('Game.getDailyRewardClaimed()'),20000);assert.equal(p.run('Game.state.run.amount'),13000);
 assert.equal(p.run('Game.state.run.status'),'cashed_out');assert.equal(p.run('Battle.started'),false);
});
test('growth kills, achievements and offline rewards never increase teacher claim',async()=>{
 const p=harness();await p.run('Game.startChallenge()');
 p.run('Game.rewardKill(5,true);Game.state.pending={gold:20000,seconds:28800};Game.claimOffline();Game.state.heroes.lumen.lv=10;Game.claimAchievement("lv10")');
 assert.equal(p.run('Game.state.gold'),20000);assert.equal(p.run('Game.getDailyRewardClaimed()'),0);
});
test('stage reward duplicate cannot create extra growth or pot',async()=>{
 const p=harness();await p.run('Game.startChallenge()');p.run('Game.stageCleared(1,false)');
 const gold=p.run('Game.state.gold'),pot=p.run('Game.getChallengePot()');p.run('Game.stageCleared(1,false)');
 assert.equal(p.run('Game.state.gold'),gold);assert.equal(p.run('Game.getChallengePot()'),pot);
});
test('resume restores hp, enemy damage, elapsed time, ultimate and used attempts',async()=>{
 const p=harness();await p.run('Game.startChallenge()');p.step(4);p.run('Game.save()');
 const before=p.obj('Battle.snapshot()');const q=harness({storage:p.storage});
 const after=q.obj('Battle.snapshot()');assert.deepEqual(after,before);assert.equal(q.run('Game.checkDailyPlays().used'),1);
});
test('finished run reload stays finished with stable settlement ID and amount',async()=>{
 const p=harness();await p.run('Game.startChallenge()');p.run('Game.state.run.pot=900;Game.cashoutChallengePot()');
 const rows=p.obj('Game.teacherLog()');const q=harness({storage:p.storage});
 assert.equal(q.run('Battle.started'),false);assert.deepEqual(q.obj('Game.teacherLog()'),rows);assert.equal(q.run('Game.getDailyRewardClaimed()'),900);
});
test('Korean midnight resets opportunities, crossing run settles to its start date',async()=>{
 const p=harness({now:Date.parse('2026-10-28T14:59:50Z')});await p.run('Game.startChallenge()');
 p.advance(20000);assert.equal(p.run('Game.today()'),'2026-10-29');assert.equal(p.run('Game.checkDailyPlays().available'),2);
 p.run('Game.state.run.pot=1000;Game.cashoutChallengePot()');assert.equal(p.run('Game.getDailyRewardClaimed("2026-10-28")'),1000);assert.equal(p.run('Game.getDailyRewardClaimed()'),0);
 await p.run('Game.startChallenge()');assert.equal(p.run('Game.state.run.date'),'2026-10-29');assert.equal(p.run('Game.checkDailyPlays().used'),1);
});
test('unclaimed reward remains before 72h and becomes exactly zero at 72h, surviving reload',async()=>{
 const p=harness();await p.run('Game.startChallenge()');p.run('Game.state.run.pot=1500;Game.cashoutChallengePot()');
 const date=p.run('Game.today()');p.advance(72*3600000-1);assert.equal(p.run(`Game.getDailyRewardClaimed('${date}')`),1500);
 p.advance(1);assert.equal(p.run(`Game.getDailyRewardClaimed('${date}')`),0);p.run('Game.save()');
 const q=harness({storage:p.storage,now:Date.parse('2026-11-01T01:00:00Z')});
 assert.equal(q.run(`Game.getDailyRewardClaimed('${date}')`),0);assert.equal(q.run(`Game.teacherLog('${date}')[0].expiredAmount`),1500);
});
test('claimed rewards do not expire; only explicitly copied IDs are claimed',async()=>{
 const p=harness();await p.run('Game.startChallenge()');p.run('Game.state.run.pot=1000;Game.cashoutChallengePot()');const id=p.run('Game.teacherLog()[0].id'), date=p.run('Game.today()');
 assert.equal(p.run(`Game.recordClassTalkSubmission('${date}', ['${id}'])`),true);
 await p.run('Game.startChallenge()');p.run('Game.state.run.pot=2000;Game.cashoutChallengePot()');p.advance(72*3600000);
 assert.equal(p.run(`Game.getDailyRewardClaimed('${date}')`),1000);const log=p.obj(`Game.teacherLog('${date}')`);assert.ok(log[0].claimedAt);assert.equal(log[1].amount,0);
});
test('expired amounts do not reopen that day’s 20,000 budget',()=>{
 const p=harness();p.run('Game.state.rewardDays[Game.today()]={used:1,opening:0,records:[{id:"expired",amount:0,expiredAmount:20000,claimedAt:0,t:Date.now()-1e9,outcome:"cashed_out"}]}');
 assert.equal(p.run('Challenge.allocated(Game.state,Game.today())'),20000);
});
test('same browser legacy device attempts prevent account reset from granting a third try',async()=>{
 const p=harness();await p.run('Game.startChallenge()');p.run('Game.failChallengePot()');await p.run('Game.startChallenge()');p.run('Game.failChallengePot()');
 p.storage.delete(key);p.run('Game.reloadFromAuth()');assert.equal((await p.run('Game.startChallenge()')).ok,false);
});
test('free summon completion advances guide beyond free-ten step',async()=>{
 const p=harness();await p.run('Game.startChallenge()');p.run('Game.summon(10,true)');assert.notEqual(p.run('Game.getGuideStep().id'),'summon_free');
});
test('stale second tab cannot overwrite a newer settlement, even before receiving storage events',async()=>{
 const p=harness();await p.run('Game.startChallenge()');p.run('Game.save()');
 const q=harness({storage:p.storage});q.run('Game.state.run.pot=1900;Game.cashoutChallengePot()');
 const saved=p.storage.get(key);
 assert.equal(p.run('Game.save()'),false);assert.equal(p.storage.get(key),saved);
 assert.equal(p.run('Battle.started'),false);assert.ok(p.ui.some(x=>x.method==='openSyncNotice'));
});
test('onboarding leads a new student through summon, growth, start, cashout and claim in order',async()=>{
 const p=harness();assert.equal(p.run('Game.getGuideStep().id'),'summon_free');
 p.run('Game.summon(10,true)');assert.equal(p.run('Game.getGuideStep().id'),'first_growth');
 p.run('Game.levelPartyBulk()');assert.equal(p.run('Game.getGuideStep().id'),'challenge_start');
 await p.run('Game.startChallenge()');p.step(10);assert.equal(p.run('Game.getGuideStep().id'),'first_cashout');
 p.run('Game.cashoutChallengePot()');assert.equal(p.run('Game.getGuideStep().id'),'first_claim');
 p.run('Game.recordClassTalkSubmission(Game.today(),Game.teacherLog().map(r=>r.id))');assert.equal(p.run('Game.getGuideStep().id'),'challenge_start');
 p.run('Game.save();Game.reloadFromAuth()');assert.equal(p.run('Game.state.onboarding.grown'),true);
});
test('5,000 reward threshold includes banked first-run rewards and warns before the crossing stage',async()=>{
 const p=harness();await p.run('Game.startChallenge()');
 p.run('Game.state.run.pot=4700');assert.equal(p.run('Game.getDifficultyMultiplier().isHard'),false);
 p.run('Game.state.run.pot=4900');assert.equal(p.run('Game.getDifficultyMultiplier().isHard'),true);
 assert.ok(p.run('Game.getDifficultyMultiplier().enemyHpFloor')>0);
 p.run('Game.cashoutChallengePot()');await p.run('Game.startChallenge()');
 assert.equal(p.run('Game.getDifficultyMultiplier().isHard'),true);assert.equal(p.run('Game.getGuideStep().id'),'reward_risk');
});
test('high-level starting parties also receive a meaningful extreme-risk enemy floor; baseline persists on resume',async()=>{
 const p=harness({storage:seed(legacy())});await p.run('Game.startChallenge()');p.run('Game.state.run.pot=4900');
 const baseline=p.obj('Game.state.run.baseline'), diff=p.obj('Game.getDifficultyMultiplier()');
 assert.ok(diff.enemyHpFloor>=baseline.atk*20);assert.ok(diff.enemyAtkFloor>=baseline.hp*0.18);
 p.run('Game.save();Game.reloadFromAuth()');assert.deepEqual(p.obj('Game.state.run.baseline'),baseline);
 assert.deepEqual(p.obj('Game.getDifficultyMultiplier()'),diff);
});
test('a claim made after expiry cannot mark expired records claimed',async()=>{
 const p=harness();await p.run('Game.startChallenge()');p.run('Game.state.run.pot=1000;Game.cashoutChallengePot()');
 const id=p.run('Game.teacherLog()[0].id'), date=p.run('Game.today()');p.advance(72*3600000);
 assert.equal(p.run(`Game.recordClassTalkSubmission('${date}',['${id}'])`),false);assert.equal(p.run(`Game.teacherLog('${date}')[0].amount`),0);
 assert.equal(p.run(`Game.teacherLog('${date}')[0].claimedAt`),0);
});
test('storage failure cannot consume an opportunity or mark a claim completed',async()=>{
 const options={},p=harness(options);options.failWrites=true;
 assert.equal((await p.run('Game.startChallenge()')).ok,false);assert.equal(p.run('Game.checkDailyPlays().used'),0);assert.equal(p.run('Battle.started'),false);
 options.failWrites=false;await p.run('Game.startChallenge()');p.run('Game.state.run.pot=1000;Game.cashoutChallengePot()');
 const id=p.run('Game.teacherLog()[0].id'),date=p.run('Game.today()');options.failWrites=true;
 assert.equal(p.run(`Game.recordClassTalkSubmission('${date}',['${id}'])`),false);assert.equal(p.run(`Game.teacherLog('${date}')[0].claimedAt`),0);
});
test('logged-out timer cannot write the previous player data into a guest slot',()=>{
 const p=harness();p.run('Game.save();Game.logout()');const before=new Map(p.storage);assert.equal(p.run('Game.save()'),false);assert.deepEqual(p.storage,before);
});
test('all growth income shares one daily 20,000 budget including the starting gift',async()=>{
 const p=harness();assert.equal(p.run('Game.growthStatus().earned'),300);
 await p.run('Game.startChallenge()');p.run('Game.rewardKill(20,false);Game.stageCleared(1,false);Game.state.pending={gold:20000,seconds:28800}');
 const reward=p.obj('Game.claimOffline()');assert.ok(reward.gold>0 && reward.gold<20000);
 assert.equal(p.run('Game.growthStatus().earned'),20000);assert.equal(p.run('Game.growthStatus().remaining'),0);assert.equal(p.run('Game.state.gold'),20000);
 assert.equal(p.run('Game.rewardKill(20,true)'),0);assert.equal(p.run('Growth.credit(Game.state,1000,"idle")'),0);
 assert.equal(p.run('Game.state.stats.totalGold'),19700);
});
test('spending growth currency never replenishes the earned-income limit; challenge points remain independent',async()=>{
 const p=harness();await p.run('Game.startChallenge()');p.run('Game.state.pending={gold:20000,seconds:1000};Game.claimOffline();Game.levelPartyBulk()');
 const wallet=p.run('Game.state.gold');assert.ok(wallet<20000);
 const r=p.obj('Game.stageCleared(1,false)');assert.equal(r.gold,0);assert.equal(r.points,170);assert.equal(p.run('Game.state.gold'),wallet);assert.equal(p.run('Game.growthStatus().remaining'),0);
});
test('Korean midnight grants a new growth budget without resetting wallet, heroes, or lifetime records',()=>{
 const p=harness({now:Date.parse('2026-10-28T14:59:50Z')});p.run('Game.state.pending={gold:20000,seconds:1000};Game.claimOffline();Game.state.heroes.lumen.lv=10');
 const history=p.run('Game.state.stats.totalGold');p.advance(20000);
 assert.equal(p.run('Game.growthStatus().earned'),0);assert.equal(p.run('Game.growthStatus().remaining'),20000);
 p.run('Growth.credit(Game.state,1000,"idle")');assert.equal(p.run('Game.state.gold'),21000);assert.equal(p.run('Game.state.heroes.lumen.lv'),10);assert.equal(p.run('Game.state.stats.totalGold'),history+1000);
});
test('daily cap persists through save/reload and offline reward can only be collected once',()=>{
 const p=harness();p.run('Game.state.pending={gold:20000,seconds:1000};Game.claimOffline();Game.save()');
 assert.equal(p.run('Game.claimOffline({gold:20000}).gold'),0);
 const q=harness({storage:p.storage});assert.equal(q.run('Game.growthStatus().earned'),20000);assert.equal(q.run('Growth.credit(Game.state,20000,"idle")'),0);
 assert.equal(q.run('Game.state.gold'),20000);
});
test('idle fractions accumulate correctly and still stop exactly at the cap',()=>{
 const p=harness();p.run('for(let i=0;i<10;i++)Growth.credit(Game.state,0.4,"idle")');assert.equal(p.run('Game.growthStatus().earned'),304);
 p.run('Growth.credit(Game.state,30000,"offline")');assert.equal(p.run('Game.growthStatus().earned'),20000);assert.equal(p.run('Game.state.gold'),20000);
 p.run('for(let i=0;i<10;i++)Growth.credit(Game.state,0.7,"idle")');assert.equal(p.run('Game.state.gold'),20000);
});
test('growth-wallet accumulation across days is not recapped on subsequent logins',()=>{
 const p=harness();p.run('Game.state.pending={gold:20000,seconds:1000};Game.claimOffline()');p.advance(24*3600000);p.run('Growth.credit(Game.state,20000,"offline");Game.save()');
 assert.equal(p.run('Game.state.gold'),40000);const q=harness({storage:p.storage,now:Date.parse('2026-10-29T01:00:00Z')});assert.equal(q.run('Game.state.gold'),40000);assert.equal(q.run('Game.growthStatus().earned'),20000);
});
test('existing v1 account sees exact correction amounts and both original backups; acknowledgment persists',()=>{
 const old=legacy(),p=harness({storage:seed(old),acknowledge:false});
 assert.equal(p.run('Game.state.balanceAdjustment.before'),442808);assert.equal(p.run('Game.state.balanceAdjustment.after'),20000);assert.equal(p.run('Game.state.balanceAdjustment.acknowledgedAt'),0);
 assert.deepEqual(JSON.parse(p.storage.get(key+'.before-growth-cap-v1')),old);assert.deepEqual(p.obj('Game.state.heroes'),old.heroes);
 const notice=p.ui.find(x=>x.method==='openBalanceAdjustment');assert.ok(notice);notice.args[1]();assert.ok(p.run('Game.state.balanceAdjustment.acknowledgedAt'));
 const q=harness({storage:p.storage,acknowledge:false});assert.ok(!q.ui.some(x=>x.method==='openBalanceAdjustment'));assert.deepEqual(q.obj('Game.state.heroes'),old.heroes);
});
test('accounts already migrated to v2 get one new correction while keeping challenge records and hero history',()=>{
 const previous=harness();previous.run('Game.state.highest=29;Game.state.heroes.lumen={lv:40,star:3,shards:19};Game.state.stats.totalGold=442808;Game.state.rewardDays[Game.today()]={used:2,opening:0,records:[]};Game.save()');
 const data=JSON.parse(previous.storage.get(key));delete data.growthPolicyVersion;delete data.growthDaily;data.gold=60000;
 const p=harness({storage:seed(data),acknowledge:false});assert.equal(p.run('Game.state.gold'),20000);assert.equal(p.run('Game.state.balanceAdjustment.before'),60000);assert.equal(p.run('Game.state.balanceAdjustment.after'),20000);
 assert.equal(p.run('Game.state.stats.totalGold'),442808);assert.equal(p.run('Game.state.highest'),29);assert.deepEqual(p.obj('Game.state.heroes'),data.heroes);assert.deepEqual(p.obj('Game.state.rewardDays'),data.rewardDays);
});
test('correction notice pauses an active existing run and confirmation resumes its saved progress without spending an attempt',async()=>{
 const previous=harness();await previous.run('Game.startChallenge()');previous.step(3);previous.run('Game.save()');
 const data=JSON.parse(previous.storage.get(key));delete data.growthPolicyVersion;delete data.growthDaily;data.gold=50000;
 const p=harness({storage:seed(data),acknowledge:false});assert.equal(p.run('Battle.started'),false);const id=p.run('Game.state.run.id');
 const notice=p.ui.find(x=>x.method==='openBalanceAdjustment');notice.args[1]();assert.equal(p.run('Battle.started'),true);assert.equal(p.run('Game.state.run.id'),id);assert.equal(p.run('Game.checkDailyPlays().used'),1);
});
test('new accounts do not see a correction notice',()=>{
 const p=harness({acknowledge:false});assert.equal(p.run('Game.state.balanceAdjustment'),null);assert.ok(!p.ui.some(x=>x.method==='openBalanceAdjustment'));
});
test('one-time mission rewards are preserved until a day with enough growth allowance',()=>{
 const p=harness();p.run('Game.state.heroes.lumen.lv=10;Game.state.pending={gold:20000,seconds:1000};Game.claimOffline()');
 const denied=p.obj('Game.claimAchievement("lv10")');assert.equal(denied.ok,false);assert.ok(!p.run('Game.state.achievements.lv10'));
 p.advance(24*3600000);const granted=p.obj('Game.claimAchievement("lv10")');assert.equal(granted.ok,true);assert.equal(granted.reward.gold,1500);assert.equal(p.run('Game.growthStatus().earned'),1500);
});
test('offline credit save failure rolls back the budget, pending reward, and lifetime history',()=>{
 const options={},p=harness(options);p.run('Game.state.pending={gold:5000,seconds:1000};Game.save()');const before=p.obj('Game.state');options.failWrites=true;
 assert.equal(p.run('Game.claimOffline().gold'),0);assert.equal(p.run('Game.state.growthDaily.earned'),before.growthDaily.earned);assert.equal(p.run('Game.state.stats.totalGold'),before.stats.totalGold);assert.equal(p.run('Game.state.pending.gold'),5000);
});
test('copying a certificate is not a ClassTalk submission and does not stop 72-hour expiry',async()=>{
 const p=harness();await p.run('Game.startChallenge()');p.run('Game.state.run.pot=1000;Game.cashoutChallengePot()');
 const id=p.run('Game.teacherLog()[0].id'),date=p.run('Game.today()');assert.equal(p.run(`Game.recordCertificateCopy('${date}',['${id}'])`),true);
 assert.ok(p.run('Game.teacherLog()[0].copiedAt'));assert.equal(p.run('Game.teacherLog()[0].claimedAt'),0);assert.equal(p.run('Game.teacherLog()[0].submissionChannel'),'');
 p.advance(72*3600000);assert.equal(p.run(`Game.getDailyRewardClaimed('${date}')`),0);
});
test('explicit ClassTalk submission records the channel and retains the reward after 72 hours',async()=>{
 const p=harness();await p.run('Game.startChallenge()');p.run('Game.state.run.pot=1000;Game.cashoutChallengePot()');const id=p.run('Game.teacherLog()[0].id'),date=p.run('Game.today()');
 assert.equal(p.run(`Game.recordClassTalkSubmission('${date}',['${id}'])`),true);assert.equal(p.run('Game.teacherLog()[0].submissionChannel'),'classtalk');
 p.advance(72*3600000);assert.equal(p.run(`Game.getDailyRewardClaimed('${date}')`),1000);assert.equal(p.run(`Game.recordClassTalkSubmission('${date}',['${id}'])`),false);
});
test('certificate-copy storage failure cannot accidentally mark a reward submitted',async()=>{
 const options={},p=harness(options);await p.run('Game.startChallenge()');p.run('Game.state.run.pot=1000;Game.cashoutChallengePot()');
 const id=p.run('Game.teacherLog()[0].id'),date=p.run('Game.today()');options.failWrites=true;
 assert.equal(p.run(`Game.recordCertificateCopy('${date}',['${id}'])`),false);assert.equal(p.run('Game.teacherLog()[0].copiedAt'),0);assert.equal(p.run('Game.teacherLog()[0].claimedAt'),0);
});
