/* 日程調整ページ 共有部品: 祝日・ics解析・Google空き情報 */
function jpHolidays(y){
  const H = {}; const put=(m,d,n)=>{ H[y+"-"+m+"-"+d]=n; };
  const nthMon=(m,n)=>{ const f=new Date(y,m-1,1).getDay(); return 1+((8-f)%7)+(n-1)*7; };
  const k=y-1980, q=Math.floor(k/4);
  put(1,1,"元日"); put(1,nthMon(1,2),"成人の日"); put(2,11,"建国記念の日"); put(2,23,"天皇誕生日");
  put(3,Math.floor(20.8431+0.242194*k-q),"春分の日"); put(4,29,"昭和の日"); put(5,3,"憲法記念日"); put(5,4,"みどりの日"); put(5,5,"こどもの日");
  put(7,nthMon(7,3),"海の日"); put(8,11,"山の日"); put(9,nthMon(9,3),"敬老の日"); put(9,Math.floor(23.2488+0.242194*k-q),"秋分の日");
  put(10,nthMon(10,2),"スポーツの日"); put(11,3,"文化の日"); put(11,23,"勤労感謝の日");
  const key=dt=>dt.getFullYear()+"-"+(dt.getMonth()+1)+"-"+dt.getDate();
  for(const hk of Object.keys(H)){ const [yy,mm,dd]=hk.split("-").map(Number); const dt=new Date(yy,mm-1,dd);
    if(dt.getDay()===0){ const x=new Date(dt); do{ x.setDate(x.getDate()+1); }while(H[key(x)]); H[key(x)]="振替休日"; } }
  for(let dt=new Date(y,8,1); dt.getMonth()===8; dt.setDate(dt.getDate()+1)){
    const p=new Date(dt); p.setDate(p.getDate()-1); const n=new Date(dt); n.setDate(n.getDate()+1);
    if(!H[key(dt)] && dt.getDay()!==0 && H[key(p)] && H[key(n)]) H[key(dt)]="国民の休日"; }
  return H;
}

async function unzipIcs(buf){
  const v=new DataView(buf), u8=new Uint8Array(buf), out=[];
  let eo=-1; for(let i=buf.byteLength-22;i>=Math.max(0,buf.byteLength-66000);i--){ if(v.getUint32(i,true)===0x06054b50){ eo=i; break; } }
  if(eo<0) throw new Error("zip");
  const n=v.getUint16(eo+10,true); let p=v.getUint32(eo+16,true);
  for(let i=0;i<n;i++){
    if(v.getUint32(p,true)!==0x02014b50) break;
    const method=v.getUint16(p+10,true), csize=v.getUint32(p+20,true), nl=v.getUint16(p+28,true), xl=v.getUint16(p+30,true), cl=v.getUint16(p+32,true), lo=v.getUint32(p+42,true);
    const name=new TextDecoder().decode(u8.subarray(p+46,p+46+nl));
    p+=46+nl+xl+cl;
    if(!/\.ics$/i.test(name)) continue;
    const ds=lo+30+v.getUint16(lo+26,true)+v.getUint16(lo+28,true);
    const data=u8.subarray(ds,ds+csize);
    if(method===0) out.push(new TextDecoder().decode(data));
    else if(method===8){
      if(typeof DecompressionStream==="undefined") throw new Error("nodecomp");
      const st=new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      out.push(await new Response(st).text());
    }
  }
  return out;
}
function parseIcsDate(val, P){
  P=P||{};
  let m=val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if(!m) return null;
  if(!m[4] || P.VALUE==="DATE") return { d:new Date(+m[1],+m[2]-1,+m[3]), allDay:true };
  if(m[7]) return { d:new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6])), allDay:false };
  return { d:new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6]), allDay:false };
}
function parseDur(s){
  const m=(s||"").match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/); if(!m) return 0;
  return ((+(m[2]||0))*7*864e5+(+(m[3]||0))*864e5+(+(m[4]||0))*36e5+(+(m[5]||0))*6e4+(+(m[6]||0))*1e3)*(m[1]==="-"?-1:1);
}
function parseIcs(text, winS, winE){
  text=text.replace(/\r?\n[ \t]/g,"");
  const raw=[]; let cur=null, depth=0;
  for(const line of text.split(/\r?\n/)){
    if(line==="BEGIN:VEVENT"){ cur={p:{},ex:[]}; depth=0; continue; }
    if(!cur) continue;
    if(/^BEGIN:/.test(line)){ depth++; continue; }
    if(/^END:/.test(line)){ if(depth>0){ depth--; continue; } if(line==="END:VEVENT"){ raw.push(cur); cur=null; } continue; }
    if(depth>0) continue;
    const i=line.indexOf(":"); if(i<0) continue;
    const parts=line.slice(0,i).split(";"), N=parts[0].toUpperCase(), P={};
    parts.slice(1).forEach(x=>{ const j=x.indexOf("="); if(j>0) P[x.slice(0,j).toUpperCase()]=x.slice(j+1).replace(/^"|"$/g,""); });
    const val=line.slice(i+1);
    if(N==="EXDATE") val.split(",").forEach(x=>{ const r=parseIcsDate(x,P); if(r) cur.ex.push(+r.d); });
    else cur.p[N]={val,P};
  }
  const unesc=s=>(s||"").replace(/\\n/gi," ").replace(/\\([,;\\])/g,"$1");
  const overrides={};
  raw.forEach(e=>{ if(e.p["RECURRENCE-ID"] && e.p.UID){ const r=parseIcsDate(e.p["RECURRENCE-ID"].val,e.p["RECURRENCE-ID"].P); if(r) (overrides[e.p.UID.val]=overrides[e.p.UID.val]||[]).push(+r.d); } });
  const out=[]; const DOWS={SU:0,MO:1,TU:2,WE:3,TH:4,FR:5,SA:6};
  for(const e of raw){
    const p=e.p; if(!p.DTSTART) continue;
    if(p.STATUS && /CANCELLED/i.test(p.STATUS.val)) continue;
    const st=parseIcsDate(p.DTSTART.val,p.DTSTART.P); if(!st) continue;
    if(!st.allDay && p.TRANSP && /TRANSPARENT/i.test(p.TRANSP.val)) continue;
    let dur;
    if(p.DTEND){ const en=parseIcsDate(p.DTEND.val,p.DTEND.P); dur = en ? (+en.d - +st.d) : 0; }
    else if(p.DURATION) dur=parseDur(p.DURATION.val);
    else dur = st.allDay ? 864e5 : 0;
    if(dur<=0 && !st.allDay) dur = 0;
    const title=unesc(p.SUMMARY&&p.SUMMARY.val)||"（予定）";
    const skip=new Set(e.ex.concat(p.UID && !p["RECURRENCE-ID"] ? (overrides[p.UID.val]||[]) : []));
    const push=s=>{ if(skip.has(+s)) return; const en=new Date(+s+dur); if(en>winS && s<winE) out.push({title, allDay:st.allDay, s:new Date(s), e:en}); };
    if(!p.RRULE || p["RECURRENCE-ID"]){ push(st.d); continue; }
    const R={}; p.RRULE.val.split(";").forEach(x=>{ const [k,v]=x.split("="); R[k.toUpperCase()]=v; });
    const iv=Math.max(1,+(R.INTERVAL||1)), count=R.COUNT?+R.COUNT:Infinity;
    const until=R.UNTIL ? parseIcsDate(R.UNTIL,{}).d : null;
    const byday=(R.BYDAY||"").split(",").filter(Boolean).map(x=>{ const m=x.match(/^([+-]?\d+)?([A-Z]{2})$/); return m?{n:m[1]?+m[1]:0,d:DOWS[m[2]]}:null; }).filter(Boolean);
    const at=(y,mo,d)=>new Date(y,mo,d,st.d.getHours(),st.d.getMinutes(),st.d.getSeconds());
    let n=0, guard=0;
    const emit=s=>{ if(s<st.d) return true; if(until && s>until) return false; if(n>=count) return false; if(s>=winE) return false; n++; push(s); return true; };
    const f=R.FREQ;
    if(f==="DAILY"){
      for(let x=new Date(st.d); guard++<20000; x=new Date(x.getFullYear(),x.getMonth(),x.getDate()+iv,x.getHours(),x.getMinutes(),x.getSeconds())){
        if(byday.length && !byday.some(b=>b.d===x.getDay())) continue; if(!emit(x)) break; }
    } else if(f==="WEEKLY"){
      const days=(byday.length?byday.map(b=>b.d):[st.d.getDay()]).sort((a,b)=>((a+6)%7)-((b+6)%7));
      const off=(st.d.getDay()+6)%7; let wk=new Date(st.d.getFullYear(),st.d.getMonth(),st.d.getDate()-off);
      outer: for(; guard++<5000; wk=new Date(wk.getFullYear(),wk.getMonth(),wk.getDate()+7*iv)){
        for(const d of days){ const x=at(wk.getFullYear(),wk.getMonth(),wk.getDate()+((d+6)%7)); if(!emit(x)) break outer; } }
    } else if(f==="MONTHLY"){
      for(let mo=0; guard++<1200; mo+=iv){
        const y=st.d.getFullYear(), m=st.d.getMonth()+mo; let xs=[];
        if(byday.length){ for(const b of byday){ const first=new Date(y,m,1), last=new Date(y,m+1,0);
            if(b.n>0){ const d=1+((b.d-first.getDay()+7)%7)+(b.n-1)*7; if(d<=last.getDate()) xs.push(at(y,m,d)); }
            else if(b.n<0){ const d=last.getDate()-((last.getDay()-b.d+7)%7)+(b.n+1)*7; if(d>=1) xs.push(at(y,m,d)); }
            else { for(let d=1+((b.d-first.getDay()+7)%7); d<=last.getDate(); d+=7) xs.push(at(y,m,d)); } } }
        else { const d=R.BYMONTHDAY?+R.BYMONTHDAY:st.d.getDate(); if(d<=new Date(y,m+1,0).getDate()) xs.push(at(y,m,d)); }
        xs.sort((a,b)=>a-b); let go=true; for(const x of xs){ if(!emit(x)){ go=false; break; } } if(!go) break;
      }
    } else if(f==="YEARLY"){
      for(let k=0; guard++<200; k+=iv){ if(!emit(at(st.d.getFullYear()+k, st.d.getMonth(), st.d.getDate()))) break; }
    } else push(st.d);
  }
  return out;
}


/* Google Identity Services で本人の空き情報を取る。cb(err, busy[{start,end}]) */
let _gisTokenClient=null;
function gisFreeBusy(clientId, tMin, tMax, cb){
  if(!(window.google && google.accounts && google.accounts.oauth2)){ cb(new Error("Googleのログイン部品を読み込めませんでした。")); return; }
  if(!_gisTokenClient){
    _gisTokenClient = google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: "https://www.googleapis.com/auth/calendar.freebusy", prompt: "select_account", callback: ()=>{},
      error_callback: (err)=>{ cb(new Error((err && err.type==="popup_closed") ? "ログイン画面が閉じられました。" : "Googleにログインできませんでした。")); } });
  }
  _gisTokenClient.callback = async (resp)=>{
    if(!resp || resp.error){ cb(new Error("許可が得られませんでした。")); return; }
    const token=resp.access_token;
    try{
      const r = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", { method:"POST", headers:{ "Authorization":"Bearer "+token, "Content-Type":"application/json" },
        body: JSON.stringify({ timeMin:tMin, timeMax:tMax, timeZone:"Asia/Tokyo", items:[{id:"primary"}] }) });
      const j = await r.json();
      if(!r.ok) throw new Error((j.error && j.error.message) || ("HTTP "+r.status));
      cb(null, (j.calendars && j.calendars.primary && j.calendars.primary.busy) || []);
    }catch(e){ cb(e); }
    finally{ try{ google.accounts.oauth2.revoke(token, ()=>{}); }catch(e){} }
  };
  _gisTokenClient.requestAccessToken();
}
