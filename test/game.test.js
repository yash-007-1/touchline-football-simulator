const test=require("node:test");
const assert=require("node:assert/strict");
const {makeSchedule,standings,canBid,FORMATIONS}=require("../lib/game");
test("double round robin creates correct number of fixtures",()=>{
 const ids=["a","b","c","d"],fs=makeSchedule(ids,true);
 assert.equal(fs.length,ids.length*(ids.length-1));
 assert.equal(new Set(fs.map(f=>f.id)).size,fs.length);
 for(const a of ids)for(const b of ids)if(a!==b)assert.equal(fs.filter(f=>f.home===a&&f.away===b).length,1);
});
test("odd team count has correct fixture total",()=>assert.equal(makeSchedule(["a","b","c"],true).length,6));
test("standings awards standard points",()=>{
 const teams={a:{id:"a",club:"A",manager:"One"},b:{id:"b",club:"B",manager:"Two"}};
 const fs=[{home:"a",away:"b",status:"played",result:{homeGoals:2,awayGoals:0}}];
 const table=standings(teams,fs);assert.equal(table[0].pts,3);assert.equal(table[0].gd,2);assert.equal(table[1].pts,0);
});
test("auction rejects overspending and accepts valid bid",()=>{
 const room={phase:"auction",currentPlayer:{id:"p",price:10},highestBid:0,teams:{a:{id:"a",budget:50,squad:[]}}};
 assert.equal(canBid(room,"a",10).ok,true);assert.equal(canBid(room,"a",51).ok,false);
});
test("formations have eleven positions",()=>{for(const f of Object.values(FORMATIONS))assert.equal(f.length,11)});
