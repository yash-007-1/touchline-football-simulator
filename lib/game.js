const FORMATIONS = {
  "4-3-3": ["GK","RB","CB","CB","LB","CM","CM","CM","RW","ST","LW"],
  "4-4-2": ["GK","RB","CB","CB","LB","RM","CM","CM","LM","ST","ST"],
  "4-2-3-1": ["GK","RB","CB","CB","LB","CDM","CDM","RW","CAM","LW","ST"],
  "3-5-2": ["GK","CB","CB","CB","RM","CM","CDM","CM","LM","ST","ST"],
  "3-4-3": ["GK","CB","CB","CB","RM","CM","CM","LM","RW","ST","LW"],
  "4-1-4-1": ["GK","RB","CB","CB","LB","CDM","RM","CM","CM","LM","ST"],
  "5-3-2": ["GK","RWB","CB","CB","CB","LWB","CM","CM","CM","ST","ST"]
};
function makeSchedule(teamIds, double=true) {
  if (teamIds.length < 2) throw new Error("At least two teams are required");
  let arr = [...teamIds];
  if (arr.length % 2) arr.push(null);
  const n = arr.length, rounds = [];
  for (let r=0;r<n-1;r++) {
    const fixtures=[];
    for(let i=0;i<n/2;i++) {
      const a=arr[i], b=arr[n-1-i];
      if(a && b) fixtures.push({id:`R${r+1}-M${i+1}`, round:r+1, home:a, away:b, status:"scheduled", result:null});
    }
    rounds.push(fixtures);
    arr=[arr[0],arr[n-1],...arr.slice(1,n-1)];
  }
  let out=rounds.flat();
  if(double) out=out.concat(rounds.flatMap((fs,r)=>fs.map((f,i)=>({id:`R${r+1+n-1}-M${i+1}`,round:r+1+n-1,home:f.away,away:f.home,status:"scheduled",result:null}))));
  return out;
}
function standings(teams, fixtures) {
  const rows=Object.values(teams).map(t=>({teamId:t.id,name:t.club,manager:t.manager,played:0,w:0,d:0,l:0,gf:0,ga:0,gd:0,pts:0}));
  const map=Object.fromEntries(rows.map(r=>[r.teamId,r]));
  for(const f of fixtures) if(f.status==="played" && f.result) {
    const h=map[f.home], a=map[f.away]; if(!h||!a) continue;
    const hg=f.result.homeGoals, ag=f.result.awayGoals;
    h.played++;a.played++;h.gf+=hg;h.ga+=ag;a.gf+=ag;a.ga+=hg;
    if(hg>ag){h.w++;a.l++;h.pts+=3;}else if(hg<ag){a.w++;h.l++;a.pts+=3;}else{h.d++;a.d++;h.pts++;a.pts++;}
  }
  rows.forEach(r=>r.gd=r.gf-r.ga);
  return rows.sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf||a.name.localeCompare(b.name));
}
function canBid(room, teamId, amount) {
  const team=room.teams[teamId], player=room.currentPlayer;
  if(!team || !player || room.phase!=="auction") return {ok:false,reason:"Auction is not active"};
  if(teamId===room.highestBidder) return {ok:false,reason:"You already hold the highest bid"};
  if(!Number.isFinite(amount) || amount < Math.max(player.price,room.highestBid+1)) return {ok:false,reason:`Minimum bid is €${Math.max(player.price,room.highestBid+1)}M`};
  if(amount>team.budget) return {ok:false,reason:"Bid exceeds your remaining budget"};
  if(team.squad.length>=25) return {ok:false,reason:"Squad is full"};
  return {ok:true};
}
function weightedRating(team) {
  const xi=team.lineup || [];
  const players=xi.map(id=>team.squad.find(p=>p.id===id)).filter(Boolean);
  if(players.length===0) return team.squad.length ? team.squad.reduce((s,p)=>s+p.rating,0)/team.squad.length : 65;
  const avg=players.reduce((s,p)=>s+p.rating,0)/players.length;
  const gk=players.find(p=>p.pos==="GK");
  const defense=players.filter(p=>["GK","CB","LB","RB","LWB","RWB","CDM"].includes(p.pos)).reduce((s,p)=>s+p.rating,0)/Math.max(1,players.filter(p=>["GK","CB","LB","RB","LWB","RWB","CDM"].includes(p.pos)).length);
  const attack=players.filter(p=>["ST","LW","RW","SS","CAM"].includes(p.pos)).reduce((s,p)=>s+p.rating,0)/Math.max(1,players.filter(p=>["ST","LW","RW","SS","CAM"].includes(p.pos)).length);
  return avg*.45+defense*.25+attack*.3+(gk? (gk.rating-avg)*.12:0);
}
function simulateMatch(home, away, fixture) {
  const tactical = t => {
    const a=t.tactics||{};
    return (a.mentality==="Very Attacking"?4:a.mentality==="Attacking"?2:a.mentality==="Very Defensive"?-2:0)
      +(a.pressing==="High"?1.1:a.pressing==="Low"?-.3:0)
      +(a.build==="Short Passing"?.5:a.build==="Direct"?.25:0);
  };
  const hr=weightedRating(home), ar=weightedRating(away);
  const homeXG=Math.max(.15,1.25+(hr-ar)*.055+tactical(home)+.22+(Math.random()-.5)*.7);
  const awayXG=Math.max(.15,1.15+(ar-hr)*.055+tactical(away)+(Math.random()-.5)*.7);
  const goals=x=>{let g=0; for(let i=0;i<Math.min(5,Math.floor(x));i++)g++; if(Math.random()<x-Math.floor(x))g++; if(Math.random()<.13 && g<5)g++; return Math.min(6,g);};
  const hg=goals(homeXG), ag=goals(awayXG);
  const goalEvents=[];
  for(let i=0;i<hg;i++){const p=home.squad.filter(p=>["ST","LW","RW","SS","CAM"].includes(p.pos));goalEvents.push({minute:Math.floor(4+Math.random()*86),team:home.club,scorer:(p[Math.floor(Math.random()*p.length)]||home.squad[Math.floor(Math.random()*home.squad.length)]||{name:"Unknown"}).name});}
  for(let i=0;i<ag;i++){const p=away.squad.filter(p=>["ST","LW","RW","SS","CAM"].includes(p.pos));goalEvents.push({minute:Math.floor(4+Math.random()*86),team:away.club,scorer:(p[Math.floor(Math.random()*p.length)]||away.squad[Math.floor(Math.random()*away.squad.length)]||{name:"Unknown"}).name});}
  goalEvents.sort((a,b)=>a.minute-b.minute);
  return {homeGoals:hg,awayGoals:ag,homeRating:+hr.toFixed(1),awayRating:+ar.toFixed(1),possessionHome:Math.round(Math.min(68,Math.max(32,50+(hr-ar)*.6+(Math.random()*10-5)))),shotsHome:Math.max(hg,Math.floor(homeXG*3+Math.random()*6)),shotsAway:Math.max(ag,Math.floor(awayXG*3+Math.random()*6)),events:goalEvents};
}
module.exports={FORMATIONS,makeSchedule,standings,canBid,simulateMatch,weightedRating};