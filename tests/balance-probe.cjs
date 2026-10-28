const {harness}=require('./helpers.cjs');
const results=[];
for(const party of ['starter','veteran','maxSSR']) {
  for(const seed of [1,15,71,12345]) {
    const p=harness({seed});
    p.run('Game.state.tutorial=true;Game.state.freeTen=false;Game.state.onboarding.grown=true');
    if(party==='veteran')p.run('Game.state.owned=["lumen","mirea","aries"];Game.state.party=Game.state.owned.slice();Game.state.heroes={lumen:{lv:40,star:3,shards:0},mirea:{lv:20,star:2,shards:0},aries:{lv:20,star:2,shards:0}}');
    if(party==='maxSSR')p.run('Game.state.owned=["aries","ceres","lyra"];Game.state.party=Game.state.owned.slice();Game.state.heroes={aries:{lv:100,star:5,shards:0},ceres:{lv:100,star:5,shards:0},lyra:{lv:100,star:5,shards:0}}');
    p.run('Game.save()');
    results.push((async()=>{
      await p.run('Game.startChallenge()');let maxPot=0;
      for(let seconds=0;seconds<1200 && p.run('Battle.started');seconds++) {
        if(p.run('Battle.ult')>=100)p.run('Battle.castUltimate()');
        p.step(1);maxPot=Math.max(maxPot,p.run('Game.getChallengePot()'));
      }
      return {party,seed,maxPot,lastStage:p.run('Battle.stage'),status:p.run('Game.state.run.status'),lost:p.run('Game.state.run.lost')};
    })());
  }
}
Promise.all(results).then(rows=>console.log(JSON.stringify(rows,null,2)));
