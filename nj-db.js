// 「一本」を claude.ai の外で動かすための保存先のつなぎ。
// ページは window.claude.use("db") と use("user") を前と同じ形で呼び、ここが Supabase の関数へ取り次ぐ。
// 読み書きの決まりは Supabase 側の関数（vercel/schema.sql）が持つ。ここでは何も許さない。
(function(){
  const API="https://tqitfgtbkftjjzgrukji.supabase.co/rest/v1/rpc/",KEY="sb_publishable_kdzXNGuXWZbq4Zruwd7l9g_SvWfJeVE";
  const ls={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}};
  // 茶師の鍵：/#k=… で一度開くと、この端末が覚える
  const hk=location.hash.match(/^#k=([0-9a-f]{20,})$/);
  if(hk){ls.set("nj-k",hk[1]);history.replaceState(null,"",location.pathname+"#admin")}
  const K=ls.get("nj-k");
  // サインインの代わりに、端末ごとのでたらめな番号
  let U=ls.get("nj-uid");
  if(!U||!/^[A-Za-z0-9_-]{20,64}$/.test(U)){const a=new Uint8Array(16);crypto.getRandomValues(a);U=[...a].map(b=>b.toString(16).padStart(2,"0")).join("");ls.set("nj-uid",U)}
  const rpc=async(fn,args)=>{const r=await fetch(API+fn,{method:"POST",headers:{apikey:KEY,"Content-Type":"application/json"},body:JSON.stringify(args||{})});
    if(!r.ok)throw new Error(fn+" "+r.status);const t=await r.text();return t?JSON.parse(t):null};

  let D=null,loading=null;const subs=[];
  const load=()=>loading||(loading=rpc("nj_read",{k:K}).then(d=>{D=d;loading=null;subs.forEach(s=>s())},e=>{loading=null;throw e}));
  setInterval(()=>{if(document.visibilityState==="visible")load().catch(()=>{})},20000);
  const docs=o=>({docs:Object.entries(o||{}).map(([id,v])=>({id,data:()=>v}))});
  const arr=a=>({docs:(a||[]).map(v=>({id:v._id,data:()=>v}))});
  const snap=p=>p==="teas"||p==="tags"?docs(D[p]):p==="reviews"||p==="passes"?arr(D[p]):p==="orders"?{docs:(D.orders||[]).map(o=>({id:o.id,data:()=>o.data}))}:{docs:[]};
  const watch=(fn,err)=>{subs.push(fn);if(D)setTimeout(fn,0);else load().catch(e=>err&&err(e));return()=>{}};
  const after=async p=>{const v=await p;load().catch(()=>{});return v};

  const docRef=path=>{const k=path.split("/"),id=k.pop(),c=k.join("/");
    return{
      get:async()=>{if(c==="orders"){const v=await rpc("nj_order_get",{u:id});return{exists:!!v,data:()=>v}}
        if(!D)await load();const v=(D[c]||{})[id]??(c==="config"?(D.config||{})[id]:undefined);return{exists:!!v,data:()=>v}},
      set:v=>c==="orders"?after(rpc("nj_order_set",{u:id,d:v})):c.startsWith("data/users/")?rpc("nj_me_set",{u:U,key:id,d:v}):after(rpc("nj_admin_set",{k:K,c,i:id,d:v,merge:false})),
      update:v=>after(rpc("nj_admin_set",{k:K,c,i:id,d:v,merge:true})),
      delete:()=>c==="reviews"?after(rpc("nj_delete_review",{rid:id,u:U,k:K}).then(ok=>{if(!ok)throw new Error("not yours")})):Promise.reject(new Error("no")),
      onSnapshot:(cb,err)=>watch(()=>{const v=c==="config"?(D.config||{})[id]:(D[c]||{})[id];cb({exists:!!v,data:()=>v})},err)}};
  const coll=p=>({
    orderBy(){return this},where(){return this},limit(){return this},
    onSnapshot:(cb,err)=>watch(()=>cb(snap(p)),err),
    add:async v=>{const id=p==="reviews"?await rpc("nj_add_review",{r:v,u:U}):await rpc("nj_admin_add",{k:K,c:p,d:v});load().catch(()=>{});return{id}},
    doc:id=>docRef(p+"/"+id)});
  const db=Object.freeze({collection:coll,doc:docRef});
  let own=null;
  const user=Object.freeze({isOwner:()=>own||(own=K?rpc("nj_is_owner",{k:K}).then(Boolean).catch(()=>false):Promise.resolve(false)),id:async()=>U,canEdit:async()=>!!(await user.isOwner())});
  window.claude={use:async n=>n==="db"?db:n==="user"?user:null};
})();
