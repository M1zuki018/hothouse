/* HOTHOUSE 演出：シェーダー集
   ・背景パス：画像のない背景を手続きで描く（1920×1080 の px 座標。p.y は下向き）
   ・ポストパス：ブルーム・色調・粒子・画面のゆがみ
   座標の約束：背景パスの p は (0,0)=左上。uP は場面ごとの小道具パラメータ（x だけ使う）
   GLSL ES 1.0（WebGL1）。ループは定数回、配列の添字は定数式だけ */
(function(){
'use strict';

const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

/* ---------- 共通 ---------- */
const PRELUDE = `precision highp float;
uniform vec2 uRes;uniform float uPx,uTime;uniform vec4 uP;
uniform sampler2D uImg;uniform float uImgOn;uniform vec3 uKen;
#define PI 3.14159265
#define TAU 6.2831853
const vec3 GOLD=vec3(.86,.68,.33);
const vec3 SILVER=vec3(.79,.8,.86);
const vec3 ROSE=vec3(.97,.6,.7);
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
vec2 h22(vec2 p){float n=h21(p);return vec2(n,h21(p+n*17.31+3.7));}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.03+vec2(7.1,3.7);a*=.5;}return s;}
float fbm3(vec2 p){float s=0.,a=.5;for(int i=0;i<3;i++){s+=a*vn(p);p=p*2.07+vec2(5.3,1.9);a*=.5;}return s*1.143;}
float sdBox(vec2 p,vec2 b){vec2 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,q.y),0.);}
float sdRBox(vec2 p,vec2 b,float r){return sdBox(p,b-r)-r;}
float sdSeg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float t=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*t);}
float sdHex(vec2 p,float r){const vec3 k=vec3(-.866025404,.5,.577350269);p=abs(p);p-=2.*min(dot(k.xy,p),0.)*k.xy;p-=vec2(clamp(p.x,-k.z*r,k.z*r),r);return length(p)*sign(p.y);}
float sdStar5(vec2 p,float r,float rf){const vec2 k1=vec2(.809016994,-.587785252);const vec2 k2=vec2(-.809016994,-.587785252);
 p.x=abs(p.x);p-=2.*max(dot(k1,p),0.)*k1;p-=2.*max(dot(k2,p),0.)*k2;p.x=abs(p.x);p.y-=r;
 vec2 ba=rf*vec2(-k1.y,k1.x)-vec2(0.,1.);float h=clamp(dot(p,ba)/dot(ba,ba),0.,r);return length(p-ba*h)*sign(p.y*ba.x-p.x*ba.y);}
float ln(float d,float w){return exp(-d*d/(w*w));}
float fill(float d,float aa){return 1.-smoothstep(-aa,aa,d);}
float stars(vec2 p,float cell,float th){vec2 g=floor(p/cell),f=fract(p/cell);float h=h21(g);vec2 o=h22(g+3.1)*.8+.1;
 float d=length((f-o)*cell);float tw=.55+.45*sin(uTime*(.8+h*2.2)+h*60.);return step(th,h)*exp(-d*d*.45)*tw*(.4+h);}
vec3 fireRamp(float t){t=clamp(t,0.,1.);return vec3(1.,.42,.1)*t*1.7+vec3(1.,.85,.5)*pow(t,4.)*1.6;}
`;

/* ---------- 研究室：黒い硝子の温室。金の骨組み、閉じ込められた星 ---------- */
const LAB = `
vec3 labDome(vec2 p,vec2 hub){
 vec2 d=p-hub;d.y*=1.45;float r=length(d);float a=atan(d.y,d.x);
 vec3 c=mix(vec3(.024,.026,.04),vec3(.004,.004,.008),smoothstep(100.,1400.,r));
 const float N=24.;
 float sec=a/TAU*N;float si=floor(sec),sf=fract(sec);
 float rr=sqrt(max(r-150.,0.))/6.;float ri=floor(rr),rf=fract(rr);
 float id=h21(vec2(si,ri));
 // 硝子の板ごとの映り込み
 float sheen=smoothstep(.55,1.,sin(sf*3.+rf*2.+id*6.+uTime*.12)*.5+.5)*pow(id,2.);
 c+=vec3(.05,.056,.08)*sheen*smoothstep(1500.,250.,r);
 float cl=fbm3(vec2(a*2.,r*.003)-uTime*.01);
 c+=vec3(.028,.03,.046)*cl*cl*smoothstep(1700.,200.,r);
 // 骨組み：放射と同心
 float w=1.1+r*.0011;
 float dsec=min(sf,1.-sf)*TAU/N*r/1.25;
 float drg=min(rf,1.-rf)*12.*6.*max(rr,.4);
 float ribs=ln(dsec,w)*smoothstep(110.,190.,r)+ln(drg,w*.9)*step(150.,r);
 float travel=.5+.5*sin(r*.011-uTime*.8+si*.9);
 c+=GOLD*ribs*(.2+.5*exp(-r*.0012))*(.6+.4*travel);
 // 遠い星（硝子の向こう）
 c+=vec3(.75,.78,.9)*stars(p+vec2(13.,uTime*2.5),34.,.93)*.35*smoothstep(150.,600.,r);
 return c;}
vec3 labStar(vec3 c,vec2 p,vec2 hub,float I){
 vec2 s=p-hub;float sr=length(s);
 float pulse=.92+.06*sin(uTime*1.2)+.03*sin(uTime*3.3);
 float sp=(exp(-abs(s.x)*.45)*exp(-abs(s.y)*.011)+exp(-abs(s.y)*.45)*exp(-abs(s.x)*.011))*.9;
 vec2 s2=mat2(.7071,-.7071,.7071,.7071)*s;
 sp+=(exp(-abs(s2.x)*.7)*exp(-abs(s2.y)*.03)+exp(-abs(s2.y)*.7)*exp(-abs(s2.x)*.03))*.22;
 c+=vec3(.88,.91,1.)*I*pulse*(exp(-sr*.06)*2.2+exp(-sr*.014)*.45+exp(-sr*.004)*.13+sp);
 // 星を閉じ込める六角の籠
 float rot=uTime*.03;vec2 hr=mat2(cos(rot),-sin(rot),sin(rot),cos(rot))*s;
 c+=GOLD*(ln(sdHex(hr,64.),1.4)*.7+ln(sdHex(hr,80.),1.)*.22)*(.7+.3*I);
 return c;}
vec3 labProps(vec3 c,vec2 p,float hz){
 // 左：硝子の棚と瓶
 vec2 sp=p-vec2(250.,520.);float fr=sdBox(sp,vec2(185.,275.));
 if(fr<0.){c=c*.4+vec3(.01,.011,.016);
  for(int k=0;k<3;k++){float Y=360.+float(k)*150.;
   c+=SILVER*ln(p.y-Y,1.2)*.16;
   float cw=52.;float cx=(floor((p.x-70.)/cw)+.5)*cw+70.;float hh=h21(vec2(cx,Y));
   float bh=36.+70.*hh,bw=9.+9.*h21(vec2(Y,cx));
   float b=sdRBox(p-vec2(cx,Y-bh*.5-1.),vec2(bw,bh*.5),min(bw,8.));
   if(hh>.25){c=mix(c,vec3(.03,.034,.046),fill(b,1.)*.85);
    c+=SILVER*ln(b,1.)*.28+vec3(.8,.85,1.)*ln(p.x-(cx-bw*.45),1.3)*fill(b,1.)*.12;}}}
 c+=GOLD*ln(fr,1.1)*.22+SILVER*ln(fr-5.,1.)*.08;
 // 右：止まった時計
 vec2 cp=p-vec2(1640.,400.);float cr=length(cp);
 c=mix(c,vec3(.014,.014,.02),fill(cr-110.,1.5));
 c+=GOLD*(ln(cr-110.,1.6)*.6+ln(cr-97.,1.)*.22);
 float ca=atan(cp.y,cp.x);float tk=abs(fract(ca/TAU*12.+.5)-.5)/12.*TAU*cr;
 c+=GOLD*ln(tk,1.4)*step(84.,cr)*step(cr,95.)*.5;
 c+=GOLD*(ln(sdSeg(p,vec2(1640.,400.),vec2(1640.,400.)+vec2(-.42,-.9)*52.),2.2)*.7+ln(sdSeg(p,vec2(1640.,400.),vec2(1640.,400.)+vec2(.95,-.3)*78.),1.6)*.55);
 float cs=sdBox(p-vec2(1640.,640.),vec2(62.,128.));
 c=mix(c,vec3(.012,.012,.018),fill(cs,1.5)*.8);c+=GOLD*ln(cs,1.)*.2;
 // 枯れた植木
 for(int k=0;k<2;k++){float bx=k==0?560.:1360.;
  float pot=sdRBox(p-vec2(bx,hz-34.),vec2(54.,34.),6.);
  c=mix(c,vec3(.015,.014,.016),fill(pot,1.5));c+=GOLD*ln(pot,1.)*.18;
  for(int j=0;j<5;j++){float fj=float(j);float hgt=hz-68.-(170.+90.*h21(vec2(bx,fj)));
   float y=hz-68.-p.y;float px=bx+(fj-2.)*11.+sin(y*.013+fj*1.7)*16.*y/220.;
   float m=step(hgt,p.y)*step(p.y,hz-66.);float d=abs(p.x-px);
   c=mix(c,vec3(.008),ln(d,2.2)*m);c+=GOLD*ln(d-2.2,1.)*m*.12;
   c+=GOLD*ln(length(p-vec2(px+sin(fj)*14.,hgt+8.))-7.,1.2)*.12;}}
 return c;}
vec3 instituteScene(vec2 p){
 vec2 hub=vec2(960.,250.);float hz=790.;vec2 q=p;float fl=step(hz,p.y);
 if(fl>.5){q.y=2.*hz-p.y;}
 vec3 c=labDome(q,hub);c=mix(vec3(dot(c,vec3(.33))),c,.35)*vec3(.75,.75,.82);
 if(fl>.5){c*=.3;c+=vec3(.02,.018,.016)*fbm3(vec2(p.x*.004,p.y*.014));
  for(int k=0;k<9;k++){float fk=float(k);vec2 pc=vec2(300.+fk*170.+60.*sin(fk*2.3),860.+60.*h21(vec2(fk,4.)));
   vec2 d=p-pc;float a=fk*1.3;d=mat2(cos(a),-sin(a),sin(a),cos(a))*d;c=mix(c,vec3(.55,.53,.5),fill(sdBox(d,vec2(34.,24.)),1.)*.8);}}
 c+=SILVER*ln(p.y-hz,1.6)*.2;
 c=labProps(c,p,hz);
 // 机のランプ
 vec2 lp=p-vec2(430.,600.);c+=vec3(1.,.72,.4)*(exp(-length(lp)*.05)*.8+exp(-length(lp*vec2(1.,1.6))*.006)*.35);
 // 奥の硝子の箱（uP.x で光る）と機械
 vec2 bp=p-vec2(1480.,700.);float bx=sdRBox(bp,vec2(170.,56.),6.);
 c=mix(c,vec3(.03,.05,.06),fill(bx,1.));c+=vec3(.6,.9,1.)*(ln(bx,1.2)*.5+fill(bx,1.)*.12+exp(-max(bx,0.)*.02)*.18)*uP.x;
 vec2 mp=p-vec2(1720.,640.);float mb=sdBox(mp,vec2(60.,120.));c=mix(c,vec3(.04,.045,.05),fill(mb,1.));
 for(int k=0;k<4;k++){float fk=float(k);c+=vec3(.3,1.,.5)*exp(-length(mp-vec2(-20.+fk*13.,-80.))*.4)*step(.5,fract(uTime*(.7+fk*.3)+fk*.37));}
 return c;}
vec3 labScene(vec2 p,float title){
 vec2 hub=vec2(960.,250.)+title*vec2(sin(uTime*.07)*40.,cos(uTime*.05)*12.);
 float hz=790.;vec2 q=p;float fl=step(hz,p.y);
 if(fl>.5){q.y=2.*hz-p.y;q.x+=(vn(vec2(p.x*.01,p.y*.06))-.5)*(p.y-hz)*.06;}
 vec3 c=labDome(q,hub);c=labStar(c,q,hub,uP.x*(1.+title*.25));
 if(fl>.5){float dp=(p.y-hz)/290.;c*=.26*(1.-dp*.5);
  c+=vec3(.02,.02,.027)*fbm3(vec2(p.x*.004,p.y*.014));}
 c+=GOLD*(ln(p.y-hz,1.6)*.55+ln(p.y-hz+15.,1.)*.2)*(1.-.5*smoothstep(0.,1100.,abs(p.x-960.)));
 if(title<.5)c=labProps(c,p,hz);
 return c;}
`;

/* ---------- 教会：研究室の天井に映った、昼の小さな教会 ---------- */
const CHURCH = `
vec2 voro(vec2 x){vec2 n=floor(x),f=fract(x);float md=8.;vec2 mg=vec2(0.),mr=vec2(0.);
 for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(float(i),float(j));vec2 r=g+h22(n+g)-f;float d=dot(r,r);if(d<md){md=d;mr=r;mg=g;}}
 md=8.;for(int j=-2;j<=2;j++)for(int i=-2;i<=2;i++){vec2 g=mg+vec2(float(i),float(j));vec2 r=g+h22(n+g)-f;
  if(dot(mr-r,mr-r)>1e-5)md=min(md,dot(.5*(mr+r),normalize(r-mr)));}
 return vec2(md,h21(n+mg));}
vec3 glassPal(float h){return h<.3?vec3(.95,.42,.55):(h<.55?vec3(.32,.45,.92):(h<.8?vec3(.95,.74,.36):vec3(.35,.7,.6)));}
float winSD(vec2 w){float rect=sdBox(w-vec2(0.,50.),vec2(150.,220.));
 float arch=max(length(w-vec2(-75.,-170.))-225.,length(w-vec2(75.,-170.))-225.);
 return min(rect,max(arch,w.y+170.));}
vec3 churchScene(vec2 p){
 vec2 b=p/vec2(118.,58.);b.x+=step(1.,mod(floor(b.y),2.))*.5;vec2 bf=fract(b);
 float mortar=min(min(bf.x,1.-bf.x)*118.,min(bf.y,1.-bf.y)*58.);
 vec3 c=vec3(.2,.16,.155)*(.55+.45*fbm3(p*.006))*(.72+.28*smoothstep(0.,4.,mortar));
 c*=.55+.45*h21(floor(b));
 c*=mix(.3,1.,smoothstep(-100.,650.,p.y))*(1.-.55*smoothstep(420.,960.,abs(p.x-960.)));
 vec2 w=p-vec2(960.,330.);float ws=winSD(w);
 if(ws<0.){vec2 v=voro(w/36.);
  vec3 col=glassPal(v.y)*(1.05+.25*sin(uTime*.35+v.y*9.))*(.85+.3*fbm3(w*.01+uTime*.04));
  float lead=v.x*36.;
  float tr=min(ln(w.x,3.),1.)+ln(length(w-vec2(0.,-120.))-60.,3.);
  c=mix(vec3(.025,.02,.025),col,smoothstep(1.,3.,lead)*(1.-tr*.9));}
 c+=vec3(1.,.74,.8)*.22*exp(-max(ws,0.)*.012);
 c=mix(c,vec3(.05,.04,.04),ln(ws-9.,6.)*.6);
 // 光の筋：窓から床へ斜めに
 if(p.y>330.){vec2 dir=normalize(vec2(.2,1.));float t=(p.y-330.)/dir.y;vec2 q=p-dir*t;
  float inw=smoothstep(150.,110.,abs(q.x-960.));
  float st=fbm3(vec2(q.x*.028,uTime*.05));
  vec3 rc=mix(glassPal(h21(vec2(floor(q.x/36.),2.))),vec3(1.,.9,.75),.55);
  c+=rc*inw*(.35+.65*st)*exp(-t*.0014)*.32;}
 // 柱
 for(int k=0;k<4;k++){float fk=float(k);float cx=k<2?(200.+fk*230.):(1720.-(fk-2.)*230.);float cw=k==0||k==3?70.:50.;
  float d=abs(p.x-cx)-cw;float m=fill(d,2.);
  vec3 cc=vec3(.12,.1,.1)*(.6+.4*fbm3(vec2(p.x*.03,p.y*.004)))*(.7+.3*smoothstep(-cw,cw,(p.x-cx)*(k<2?1.:-1.)));
  c=mix(c,cc*mix(.4,1.,smoothstep(0.,700.,p.y)),m);}
 // 祭壇：白い布、白い花、小さな棺
 float alt=sdBox(p-vec2(960.,700.),vec2(270.,46.));
 c=mix(c,vec3(.55,.5,.48)*(.8+.2*fbm3(p*.05)),fill(alt,1.5));c+=vec3(1.,.9,.8)*ln(p.y-655.,1.5)*fill(abs(p.x-960.)-270.,1.)*.2;
 float cof=sdRBox(p-vec2(960.,632.),vec2(110.,26.),6.);
 c=mix(c,vec3(.08,.05,.04),fill(cof,1.2));c+=GOLD*ln(cof,1.)*.3;
 for(int k=0;k<14;k++){float fk=float(k);vec2 fc=vec2(700.+fk*40.+sin(fk*3.1)*14.,640.+sin(fk*1.7)*18.);if(abs(fc.x-960.)<120.)fc.y+=30.;
  float d=length(p-fc)-(13.+5.*h21(vec2(fk,1.)));
  c=mix(c,vec3(.95,.93,.9),fill(d,1.5)*.9);c+=vec3(1.)*exp(-max(d,0.)*.08)*.06;}
 // ろうそく
 for(int k=0;k<2;k++){float cx=k==0?740.:1180.;
  c=mix(c,vec3(.85,.82,.75),fill(sdBox(p-vec2(cx,612.),vec2(7.,42.)),1.));
  float fl=.85+.15*vn(vec2(uTime*7.+float(k)*9.,0.));
  vec2 fp=p-vec2(cx+sin(uTime*5.+float(k))*1.5,558.);fp.y*=.55;
  c+=vec3(1.,.7,.35)*(exp(-length(fp)*.35)*1.8+exp(-length(p-vec2(cx,560.))*.02)*.25)*fl;}
 // 会衆席
 if(p.y>770.){float row=(p.y-770.)/62.;float rf=fract(row);
  float aisle=smoothstep(80.,95.,abs(p.x-960.)-(p.y-770.)*.12);
  float top=ln(rf-.18,.05)*aisle;
  c=mix(c,vec3(.06,.04,.035),aisle*smoothstep(.15,.25,rf)*.85);
  c+=vec3(.5,.35,.25)*top*.35;}
 return c;}
`;

/* ---------- ルネの部屋（夜）：カーテンのすきまの街灯 ---------- */
const ROOM = `
vec3 roomScene(vec2 p){
 float dusk=clamp(uP.y,0.,1.)*(1.-clamp(uP.y-1.,0.,1.)),morn=clamp(uP.y-1.,0.,1.),day=dusk+morn;
 vec3 c=mix(vec3(.04,.05,.095),vec3(.015,.018,.035),p.y/1080.);
 c=mix(c,mix(vec3(.2,.11,.09),vec3(.08,.045,.045),p.y/1080.),dusk);
 c=mix(c,mix(vec3(.34,.32,.36),vec3(.2,.19,.22),p.y/1080.),morn);
 vec2 wp=fract(p/vec2(64.,64.))-.5;c*=.88+.12*ln(length(wp)-.12,.06);
 vec2 wc=p-vec2(1360.,370.);float win=sdRBox(wc,vec2(230.,230.),8.);
 float sway=sin(uTime*.45)*7.+sin(uTime*1.13)*2.;
 float gapL=1325.+sway+(p.y-140.)*.025,gapR=1400.+sway*.6-(p.y-140.)*.01;
 if(win<0.){
  vec3 sky=mix(vec3(.04,.06,.15),vec3(.12,.12,.22),(p.y-140.)/460.);
  sky+=vec3(.9,.92,1.)*stars(p,22.,.9)*.9;
  vec2 mp=p-vec2(1500.,230.);sky+=vec3(.9,.9,.8)*(fill(length(mp)-26.,1.)*(1.-fill(length(mp-vec2(9.,-6.))-24.,1.))+exp(-length(mp)*.03)*.15);
  float roof=560.-40.*step(.5,fract(p.x/90.))-25.*vn(vec2(p.x*.02,0.));
  vec3 dsky=mix(vec3(1.,.58,.28),vec3(.45,.24,.38),smoothstep(500.,140.,p.y));
  vec3 msky=mix(vec3(.82,.87,.95),vec3(.98,.95,.9),(p.y-140.)/460.);
  sky=mix(mix(sky,dsky,dusk),msky,morn);
  if(p.y>roof){sky=mix(vec3(.015,.016,.03),mix(vec3(.2,.1,.1),vec3(.55,.55,.6),morn),day);float wl=step(.82,h21(floor(p/vec2(18.,14.))))*step(roof+12.,p.y);sky+=vec3(1.,.75,.4)*wl*.5*(1.-morn);}
  c=sky;
  c=mix(c,vec3(.02,.02,.035),max(ln(wc.x,4.),ln(wc.y,4.)));}
 c+=vec3(.6,.62,.72)*ln(win,2.)*.16;
 // カーテン（ルネの薔薇色）
 if(p.y>110.&&p.y<720.){
  float fold=sin(p.x*.07+sin(p.y*.012+uTime*.4)*.8)*.5+.5;
  vec3 cc=mix(vec3(.1,.045,.07),vec3(.24,.12,.16),fold)*mix(.6,1.,smoothstep(110.,400.,p.y))*(1.+dusk*.6+morn*1.4);
  float mL=smoothstep(1075.,1085.,p.x)*(1.-smoothstep(gapL-3.,gapL+3.,p.x));
  float mR=smoothstep(gapR-3.,gapR+3.,p.x)*(1.-smoothstep(1640.,1650.,p.x));
  float hem=1.-smoothstep(700.,720.,p.y);
  c=mix(c,cc+c*.2,(mL+mR)*hem);}
 // 街灯の細い光：すきまから床へ
 vec3 lamp=mix(mix(vec3(1.,.7,.36),vec3(1.,.5,.2)*1.6,dusk),vec3(1.,.97,.9)*1.5,morn);
 float gx=(gapL+gapR)*.5;
 c+=lamp*ln(p.x-gx,6.)*step(600.,p.y)*step(p.y,760.)*.3;
 float bd=sdSeg(p,vec2(gx,760.),vec2(520.,1080.));float bw=5.+max(p.y-760.,0.)*.07;
 c+=lamp*ln(bd,bw)*step(760.,p.y)*.55;
 c+=lamp*ln(bd,bw*7.)*step(700.,p.y)*.05;
 // 天蓋つきのベッド
 for(int k=0;k<6;k++){float fk=float(k);float x0=190.+fk*130.;
  float drape=fill(abs(p.x-x0-sin(p.y*.02+fk+uTime*.3)*8.)-38.,6.)*step(170.,p.y)*step(p.y,780.);
  c=mix(c,c+vec3(.12,.1,.13),drape*.22);}
 c+=vec3(.5,.45,.55)*ln(p.y-170.,2.)*step(160.,p.x)*step(p.x,900.)*.25;
 float bed=sdRBox(p-vec2(530.,850.),vec2(380.,110.),20.);
 c=mix(c,vec3(.12,.11,.17)*(.75+.25*fbm3(p*.02)),fill(bed,2.));
 c=mix(c,vec3(.2,.19,.25),fill(sdRBox(p-vec2(290.,770.),vec2(110.,40.),30.),2.));
 // 机：缶・写真立て・望遠鏡
 float desk=sdBox(p-vec2(1460.,700.),vec2(260.,14.));
 c=mix(c,vec3(.08,.055,.05),fill(desk,1.5));c+=vec3(.5,.4,.35)*ln(p.y-686.,1.2)*fill(abs(p.x-1460.)-260.,1.)*.25;
 c=mix(c,vec3(.05,.035,.03),fill(sdBox(p-vec2(1460.,900.),vec2(240.,190.)),2.)*.8);
 float can=sdRBox(p-vec2(gx+8.,652.),vec2(26.,34.),4.);
 c=mix(c,vec3(.14,.13,.16),fill(can,1.));c+=SILVER*ln(can,1.)*.25;
 c+=lamp*fill(can,1.)*ln(p.x-gx,7.)*.8;
 c+=ROSE*.4*fill(sdBox(p-vec2(gx+8.,646.),vec2(26.,6.)),1.);
 float ph=sdBox(p-vec2(1590.,640.),vec2(30.,40.));c=mix(c,vec3(.03,.03,.04),fill(ph,1.));c+=GOLD*ln(ph,1.)*.3+vec3(.6,.7,.9)*ln(p.x-p.y*.4-1340.,4.)*fill(ph,1.)*.15;
 if(uP.x>0.){float tl=sdSeg(p,vec2(1230.,676.),vec2(1318.,656.))-7.;float tm=fill(tl,1.2)*min(uP.x,1.);
  vec3 brass=vec3(.62,.45,.2)*(.6+.4*ln(p.y-662.,5.));
  c=mix(c,brass,tm);c+=vec3(1.,.85,.55)*ln(tl,1.2)*.5*min(uP.x,1.);
  float gl=max(uP.x-1.,0.);vec2 gp=p-vec2(1318.,656.);
  c+=vec3(1.,.9,.7)*gl*(exp(-length(gp)*.08)+(exp(-abs(gp.x)*.4)*exp(-abs(gp.y)*.04)+exp(-abs(gp.y)*.4)*exp(-abs(gp.x)*.04))*.5)*(.8+.2*sin(uTime*3.));}
 // 床
 if(p.y>760.){float pl=fract((p.x+(p.y-760.)*.8)/140.);c*=.8+.2*smoothstep(0.,.04,min(pl,1.-pl));}
 // 窓から床へ落ちる月明かり
 vec2 mq=p-vec2(1040.,940.);mq.x+=(p.y-760.)*.5;
 c+=mix(mix(vec3(.45,.55,.85),vec3(1.,.55,.25),dusk),vec3(1.,.96,.88),morn)*fill(sdBox(mq,vec2(170.,90.)),40.)*step(760.,p.y)*(.08+day*.22);
 return c;}
`;

/* ---------- 教室（昼）：空いた机がふたつ ---------- */
const CLASSROOM = `
vec3 classScene(vec2 p){
 vec3 c=vec3(.36,.33,.29)*(.85+.15*fbm3(p*.004));
 c=mix(c,vec3(.42,.4,.37),smoothstep(140.,0.,p.y));
 // 左の窓：空、雲、外の枝
 for(int k=0;k<3;k++){float fk=float(k);float x0=40.+fk*220.,x1=x0+170.-fk*25.;float y0=130.+fk*30.,y1=640.-fk*30.;
  vec2 wc=p-vec2((x0+x1)*.5,(y0+y1)*.5);float ws=sdBox(wc,vec2((x1-x0)*.5,(y1-y0)*.5));
  if(ws<0.){vec3 sky=mix(vec3(.62,.78,.95),vec3(.9,.93,.96),p.y/700.);
   float cl=fbm(vec2(p.x*.004+uTime*.006,p.y*.008));sky=mix(sky,vec3(1.),smoothstep(.5,.8,cl)*.7);
   float br=smoothstep(.62,.66,fbm3(vec2(p.x*.012,p.y*.01)+vec2(sin(uTime*.4)*.05,0.)))*smoothstep(400.,150.,p.y+fk*50.);
   sky=mix(sky,vec3(.25,.27,.24),br);
   c=sky*.92;c=mix(c,vec3(.85,.82,.76),max(ln(wc.x,4.),ln(wc.y,4.))*.9);}
  c=mix(c,vec3(.85,.82,.76),ln(ws-4.,5.)*.8);}
 // 窓の光が床と机に落ちる
 vec3 sun=vec3(1.,.9,.72);
 for(int k=0;k<3;k++){float fk=float(k);float x0=40.+fk*220.,x1=x0+170.-fk*25.;
  if(p.y>700.){float sh=(p.y-700.)*1.25;float m=smoothstep(x0+sh-8.,x0+sh+8.,p.x)*(1.-smoothstep(x1+sh-8.,x1+sh+8.,p.x));
   c+=sun*m*.28*(1.-smoothstep(700.,1080.,p.y)*.4);}}
 // 黒板
 vec2 bp=p-vec2(1400.,330.);float bb=sdBox(bp,vec2(380.,160.));
 if(bb<0.){vec3 g=vec3(.08,.16,.13)*(.8+.2*fbm(p*.01));
  float chalk=smoothstep(.62,.72,fbm(vec2(p.x*.02,p.y*.06)));g+=vec3(.5)*chalk*.12;
  c=g;}
 c=mix(c,vec3(.3,.2,.13),ln(bb-6.,6.)*.9);
 c=mix(c,vec3(.32,.22,.15),fill(sdBox(p-vec2(1400.,500.),vec2(380.,8.)),1.));
 // 床
 if(p.y>700.){vec3 fl=vec3(.33,.22,.14)*(.8+.2*fbm3(vec2(p.x*.003,p.y*.05)));
  float pl=fract((p.x-960.)/(80.+(p.y-700.)*.9)*1.);fl*=.85+.15*smoothstep(0.,.05,min(pl,1.-pl));
  c=mix(c,fl,smoothstep(696.,704.,p.y));}
 // 机：奥から手前へ三列
 for(int r=0;r<3;r++){float fr=float(r);float y=600.+fr*95.;float sc=.62+fr*.28;float sx=220.*sc;
  for(int k=0;k<5;k++){float fk=float(k);float x=960.+(fk-2.)*sx*1.9+fr*30.;
   vec2 d=p-vec2(x,y);float top=sdRBox(d,vec2(80.*sc,16.*sc),4.);
   float leg=min(sdBox(d-vec2(-66.*sc,40.*sc),vec2(4.*sc,40.*sc)),sdBox(d-vec2(66.*sc,40.*sc),vec2(4.*sc,40.*sc)));
   c=mix(c,vec3(.2,.13,.08),fill(leg,1.));
   c=mix(c,vec3(.48,.33,.2)*(.85+.15*vn(d*.1)),fill(top,1.2));c+=vec3(1.,.9,.75)*ln(d.y+16.*sc,1.5)*fill(abs(d.x)-80.*sc,1.)*.25;}}
 // 窓ぎわ、いちばん後ろの空いた机ふたつ。白い花が一輪ずつ
 for(int k=0;k<2;k++){vec2 fc=vec2(k==0?330.:520.,584.);
  vec2 vv=p-fc-vec2(0.,10.);c=mix(c,vec3(.75,.8,.85),fill(sdRBox(vv,vec2(7.,14.),3.),1.)*.8);
  float st=abs(p.x-fc.x-sin((p.y-fc.y)*.08)*2.);c=mix(c,vec3(.25,.4,.25),ln(st,1.5)*step(fc.y-40.,p.y)*step(p.y,fc.y));
  vec2 bl=p-fc-vec2(0.,-44.);float pet=length(bl)-(10.+3.*cos(atan(bl.y,bl.x)*5.));
  c=mix(c,vec3(1.,.99,.97),fill(pet,1.2));c+=vec3(1.)*exp(-max(pet,0.)*.06)*.18;}
 return c;}
`;

/* ---------- 秘密基地：林の奥の倒れた木。夢では夏の光の中 ---------- */
const BASE = `
vec3 baseScene(vec2 p,float dm){
 vec3 sky=mix(mix(vec3(1.,.66,.32),vec3(.5,.24,.16),smoothstep(0.,700.,p.y)),
              mix(vec3(1.,.95,.9),vec3(.98,.8,.82),smoothstep(0.,900.,p.y)),dm);
 vec2 sun=vec2(1500.,250.);float sd=length(p-sun);
 sky+=mix(vec3(1.,.8,.5),vec3(1.,.97,.9),dm)*(exp(-sd*.014)*.6+exp(-sd*.004)*.2);
 vec3 c=sky;
 // 奥の木（かすむ）
 float far=fbm3(vec2(p.x*.006,p.y*.004+3.));float farM=smoothstep(.45,.6,far+smoothstep(600.,200.,p.y)*-.25+smoothstep(300.,800.,p.y)*.4);
 c=mix(c,mix(vec3(.34,.2,.15),vec3(.85,.72,.75),dm),farM*.7);
 for(int k=0;k<7;k++){float fk=float(k);float tx=fk*300.+120.*h21(vec2(fk,2.))-60.;float tw=26.+40.*h21(vec2(fk,5.));
  float bend=sin(p.y*.003+fk)*20.;float d=abs(p.x-tx-bend)-tw*(1.+(p.y/1080.)*.3);
  vec3 tc=mix(vec3(.08,.05,.04),vec3(.7,.6,.65),dm)*(.7+.3*fbm3(vec2(p.x*.05,p.y*.01)));
  c=mix(c,tc,fill(d,2.)*(k==2||k==5?.0:1.));
  c+=mix(vec3(1.,.6,.25),vec3(1.,.9,.85),dm)*ln(d,2.5)*step(p.x,tx+bend)*.0+mix(vec3(1.,.6,.25),vec3(1.),dm)*ln(d+1.,2.)*step(tx+bend,p.x)*.35;}
 // 光の筋（木漏れ日）
 vec2 rv=p-sun;float ra=atan(rv.y,rv.x);
 float rays=pow(fbm3(vec2(ra*9.,uTime*.03)),2.5)*smoothstep(0.,300.,length(rv));
 c+=mix(vec3(1.,.75,.4),vec3(1.,.95,.9),dm)*rays*.35*exp(-length(rv)*.0012)*(1.+dm);
 // 葉の茂み（上）
 float can=fbm(vec2(p.x*.004,p.y*.006)+vec2(uTime*.004,0.));float cm=smoothstep(.5,.56,can)*smoothstep(380.,40.,p.y);
 c=mix(c,mix(vec3(.05,.06,.035),vec3(.75,.7,.6),dm),cm);
 c+=mix(vec3(1.,.6,.25),vec3(1.,.95,.85),dm)*ln(can-.5,.012)*smoothstep(380.,40.,p.y)*.25;
 // 倒れた木（屋根）
 vec2 a=vec2(260.,400.),b=vec2(1650.,610.);vec2 ax=normalize(b-a);float al=dot(p-a,ax),ac=dot(p-a,vec2(-ax.y,ax.x));
 float tr=sdSeg(p,a,b)-(70.-al*.012);
 vec3 bark=mix(vec3(.12,.07,.045),vec3(.65,.5,.45),dm)*(.55+.45*fbm(vec2(al*.006,ac*.09)))*(.75+.25*smoothstep(-60.,40.,-ac));
 c=mix(c,bark,fill(tr,2.));c+=mix(vec3(1.,.62,.3),vec3(1.),dm)*ln(tr,2.)*step(p.y,a.y+(p.x-a.x)*(b.y-a.y)/(b.x-a.x))*.45;
 c=mix(c,mix(vec3(.1,.15,.05),vec3(.7,.85,.6),dm),smoothstep(.66,.74,fbm3(vec2(al*.01,ac*.05)))*fill(tr+20.,3.)*step(ac,-10.)*.45);
 // 入り口の暗がり
 float hole=sdRBox(p-vec2(990.,700.),vec2(150.,110.),60.);
 c=mix(c,mix(vec3(.02,.012,.01),vec3(.55,.45,.48),dm),fill(hole,8.));
 // 看板：読めない字と、すみの星
 vec2 sg=p-vec2(1000.,610.);sg=mat2(.995,.1,-.1,.995)*sg;float sb=sdRBox(sg,vec2(130.,42.),4.);
 vec3 wood=mix(vec3(.45,.3,.17),vec3(.95,.85,.7),dm)*(.8+.2*vn(vec2(sg.x*.05,sg.y*.4)));
 c=mix(c,wood,fill(sb,1.));
 float ink=smoothstep(.6,.66,fbm3(vec2(sg.x*.06,sg.y*.12)))*step(abs(sg.y),16.)*step(abs(sg.x),100.);
 c=mix(c,vec3(.08,.06,.07),ink*fill(sb,1.)*.85);
 vec2 stp=sg-vec2(106.,22.);stp.y=-stp.y;float s5=sdStar5(stp,13.,.45);
 float glow=max(uP.x,dm);
 c=mix(c,vec3(.95,.8,.35),ln(s5,1.4)*fill(sb,1.));c+=vec3(1.,.85,.45)*(exp(-max(s5,0.)*.1)*.6+exp(-length(stp)*.02)*.2)*glow*(.85+.15*sin(uTime*2.));
 // 地面と草
 float gr=880.+20.*sin(p.x*.004);
 if(p.y>gr-60.){float bl=fbm3(vec2(p.x*.09,0.))*60.;float gm=smoothstep(gr-bl,gr-bl+4.,p.y);
  c=mix(c,mix(vec3(.06,.05,.03),vec3(.6,.62,.5),dm)*(.7+.3*fbm3(p*.02)),gm);}
 return c;}
vec3 dreamScene(vec2 p){
 vec3 c=baseScene(p,1.);
 for(int i=0;i<3;i++){float fi=float(i);float cell=260.-fi*60.;vec2 q=p+vec2(uTime*(6.+fi*4.),-uTime*(10.+fi*6.));
  vec2 g=floor(q/cell),f=fract(q/cell);float h=h21(g+fi*9.);if(h<.6)continue;
  vec2 o=h22(g+fi)*.6+.2;float r=cell*(.12+.12*h);float d=length((f-o)*cell);
  float bk=smoothstep(r,r-2.,d)*(.5+.5*smoothstep(r*.6,r,d));
  vec3 bc=mix(vec3(1.,.85,.9),vec3(1.,.95,.8),h21(g+4.));
  c+=bc*bk*(.16-fi*.03)*(.7+.3*sin(uTime*.8+h*20.));}
 float e=length((p/uRes-.5)*vec2(1.,.75));
 c=mix(c,vec3(1.,.96,.94),smoothstep(.4,.8,e)*.35);c*=.88;
 return c;}
`;

/* ---------- 硝子の廊下：どこまでも続く温室の回廊 ---------- */
const CORRIDOR = `
vec3 corridorScene(vec2 p){
 vec2 vp=vec2(960.,470.);vec2 q=p-vp;
 const float H=.92;
 float s=pow(pow(abs(q.x),3.)+pow(abs(q.y)/H,3.),1./3.);s=max(s,1.);
 float z=420./s;float th=atan(q.y/H,q.x);
 float px=s*s/420.;
 vec3 c=vec3(.012,.016,.022);
 float fog=exp(-z*.07);
 // 硝子の板：向こうに夜の植物
 float leaves=fbm3(vec2(th*5.,z*.9));float lm=smoothstep(.48,.62,leaves);
 vec3 pane=mix(vec3(.03,.042,.05),vec3(.04,.1,.08),lm)*(.7+.6*exp(-z*.15));
 float refl=pow(fbm3(vec2(th*3.,z*.25-uTime*.04)),3.);
 pane+=vec3(.2,.21,.25)*refl;
 float floorM=smoothstep(.95,1.25,th)*(1.-smoothstep(1.9,2.2,th));
 c=mix(pane,vec3(.008,.008,.012),floorM);
 // 骨組み：アーチ（奥行き方向）と縦桟（周方向）
 float nearF=smoothstep(.45,1.1,z);
 float dz=abs(fract(z)-.5);float rib=smoothstep(.03*px+1.3,max(.03*px-1.3,0.),dz*px)*nearF;
 float dt=abs(fract(th/TAU*12.+.5)-.5)/12.*TAU*s;float mull=smoothstep(.0035*s+1.2,max(.0035*s-1.2,0.),dt)*(1.-floorM)*(.35+.65*nearF);
 float glint=.6+.4*sin(z*1.3-uTime*.6);
 c+=GOLD*(rib*.7+mull*.35)*glint;
 // 床：奥の光と骨組みの映り込み
 c+=GOLD*rib*floorM*.15+vec3(.9,.85,.7)*floorM*exp(-abs(p.x-960.)*.015)*exp(-max(p.y-470.,0.)*.003)*.35;
 // 扉の向こうの冬の海（uP.x）
 if(uP.x>0.){float zw=fract(z*.5)*2.;float side=step(abs(th),.55);float m=side*step(2.6,z)*step(z,4.2)*smoothstep(.1,.2,zw)*(1.-smoothstep(1.8,1.9,zw));
  float wy=q.y/s;vec3 sea=mix(vec3(.5,.56,.62),vec3(.1,.15,.2),smoothstep(-.1,.2,wy));
  sea+=vec3(.6,.7,.8)*smoothstep(.7,.9,fbm3(vec2(z*3.-uTime*.2,wy*30.)))*step(0.,wy)*.3;
  c=mix(c,sea,m*uP.x*.85);}
 c=mix(vec3(.02,.025,.03),c,fog);
 // 突き当たりの光
 float vd=length((p-vp)*vec2(1.,.8));
 c+=vec3(.9,.86,.72)*(exp(-vd*.03)*.9+exp(-vd*.006)*.18);
 // 漂う光の粒
 c+=vec3(.7,.9,.8)*stars(p+vec2(uTime*6.,uTime*2.),60.,.95)*.35;
 return c;}
`;

/* ---------- ある夜の廊下：生前の研究所。床にまかれたガソリン ---------- */
const NIGHT = `
vec3 nightCorridor(vec2 p,float dy){
 vec2 vp=vec2(960.,500.);vec2 q=p-vp;
 float s=max(abs(q.x),abs(q.y)/.8);float zEnd=7.;s=max(s,420./zEnd);
 float z=420./s;float wall=step(abs(q.y)/.8,abs(q.x));
 vec2 w=q*z/420.;
 vec3 c;float fog=exp(-z*.12);
 vec3 moon=vec3(.35,.45,.7);
 float doorLight=0.;
 if(z>=zEnd-.01){
  c=mix(vec3(.03,.032,.04),vec3(.5,.49,.46),dy);
  vec2 dq=p-vp;
  if(dy>.5){float wn=sdBox(dq-vec2(0.,-4.),vec2(40.,40.));c=mix(c,vec3(.8,.86,.92),fill(wn,1.));}else{float door=sdBox(dq-vec2(0.,10.),vec2(26.,50.));
  c=mix(c,vec3(.015),fill(door,1.));
  doorLight=ln(dq.x-8.,1.1)*step(abs(dq.y-10.),48.)+ln(dq.y-60.,1.2)*step(abs(dq.x),26.);
  c+=vec3(1.,.78,.45)*doorLight*1.4;
  }
  c+=vec3(.2,1.,.45)*fill(sdBox(dq-vec2(0.,-62.),vec2(10.,4.)),1.)*.6;
 } else if(wall>.5){
  c=mix(vec3(.05,.055,.07),mix(vec3(.8,.76,.68),vec3(.42,.52,.48),step(.25,w.y)),dy)*(.8+.2*fbm3(w*vec2(3.,8.)+z));
  float seg=fract(z*.35);
  float door=step(.2,seg)*step(seg,.42)*step(-.45,w.y);
  c=mix(c,mix(vec3(.03,.028,.03),vec3(.42,.3,.2),dy),door);
  c=mix(c,vec3(.15,.12,.1),fill(length(vec2((fract(z*1.4)-.5)/z*30.,(w.y+.18)*40.))-1.,.3)*step(0.,q.x)*(1.-door)*dy);
  c+=vec3(.2,.22,.28)*door*smoothstep(.05,0.,abs(w.y+.45))*.3;
  float wn=step(.55,seg)*step(seg,.8)*step(-.65,w.y)*step(w.y,-.15)*step(q.x,0.);
  c=mix(c,mix(moon*.5,vec3(.85,.9,.95),dy),wn);
 } else if(q.y>0.){
  c=mix(vec3(.03,.03,.035),vec3(.5,.56,.52),dy)*(.8+.2*fbm3(vec2(w.x*2.,z*.8)));
  float seg=fract(z*.35+.12);
  float lit=step(.55,seg)*step(seg,.8)*smoothstep(.1,-.4,w.x);
  c+=mix(moon*.2,vec3(1.,.95,.82)*.3,dy)*lit;
  // ガソリン：油膜の虹色
  float pud=smoothstep(.46,.6,fbm3(vec2(w.x*2.2,z*.55)));
  vec3 film=.5+.5*cos(TAU*(fbm3(vec2(w.x*7.,z*2.2)+uTime*.015)*2.+vec3(0.,.33,.67)));
  float light=lit*.6+.15+exp(-(zEnd-z)*.8)*.8;
  c+=film*pud*light*.12*(1.-dy);
  c+=vec3(1.,.8,.5)*exp(-(zEnd-z)*1.2)*exp(-abs(w.x)*4.)*.25*(1.-dy);
 } else {
  c=mix(vec3(.02,.022,.028),vec3(.88,.88,.85),dy);
  float lamp=ln(abs(fract(z*.35)-.5)*z*.5,.08)*step(abs(w.x),.12);c+=mix(vec3(.3,.32,.35)*.15,vec3(1.,1.,.95)*.35,dy)*lamp;
 }
 c=mix(mix(vec3(.01,.012,.016),vec3(.52,.51,.48),dy),c,mix(fog,exp(-z*.09),dy));
 // 火が廊下をなめるように走る（uP.x：0→1）
 if(uP.x>0.){float front=mix(.0,zEnd,uP.x);float burn=smoothstep(front,front-1.2,z);
  float fl=fbm(vec2(w.x*3.+w.y*2.,z*1.6-uTime*3.));
  vec3 fire=fireRamp(fl*1.25*burn);
  float low=smoothstep(-.5,.3,w.y);
  c=c*(1.+burn*.3)+fire*burn*low*(wall>.5?.3:.42)*(1.-step(zEnd-.01,z));
  c+=vec3(1.,.45,.12)*uP.x*.12*exp(-z*.2);}
 return c;}
`;

/* ---------- 燃える研究所（外） ---------- */
const FIRE = `
float bldg(vec2 p){float b=sdBox(p-vec2(980.,640.),vec2(420.,190.));
 b=min(b,sdBox(p-vec2(520.,700.),vec2(150.,130.)));
 vec2 dp=p-vec2(1110.,450.);b=min(b,max(length(dp)-125.,dp.y));
 b=min(b,sdBox(p-vec2(1110.,452.),vec2(135.,6.)));
 return b;}
vec3 fireScene(vec2 p){
 float fl=.85+.15*vn(vec2(uTime*6.,1.));
 vec3 c=mix(vec3(.04,.015,.05),vec3(.42,.12,.05),smoothstep(-100.,820.,p.y));
 c+=vec3(.6,.18,.05)*exp(-length((p-vec2(960.,480.))*vec2(.8,1.3))*.0028)*fl;
 c+=vec3(.9,.9,1.)*stars(p,30.,.95)*smoothstep(350.,0.,p.y)*.4;
 // 煙
 float sm=fbm(vec2(p.x*.003-uTime*.04,p.y*.004+uTime*.1));
 float smM=smoothstep(.36,.7,sm)*smoothstep(760.,0.,p.y)*smoothstep(0.,900.,1600.-abs(p.x-900.)*1.2);
 c=mix(c,vec3(.06,.035,.035)+vec3(.5,.18,.06)*smoothstep(500.,200.,p.y)*.15*fl,smM*.8);
 // 炎：建物の上へ
 float b=bldg(p);
 float n=fbm(vec2(p.x*.0065,p.y*.009+uTime*1.3));
 float top=bldg(vec2(p.x,820.));
 float above=max(b,0.);
 float span=smoothstep(330.,380.,abs(p.x-920.));
 float n2=fbm3(vec2(p.x*.016,p.y*.012+uTime*2.1));
 float fh=(60.+420.*n*n2*1.5)*(1.-span);
 float f=clamp(1.-above/fh,0.,1.)*step(0.,b)*step(p.y,830.);
 f*=smoothstep(.15,.6,n+f*.3);
 c=mix(c,fireRamp(f*1.1),smoothstep(0.,.25,f));
 // 建物
 float inside=fill(b,1.5);
 vec3 bc=vec3(.02,.012,.012);
 vec2 wg=fract((p-vec2(560.,470.))/vec2(70.,80.));vec2 wi=floor((p-vec2(560.,470.))/vec2(70.,80.));
 float wnd=step(.25,wg.x)*step(wg.x,.75)*step(.2,wg.y)*step(wg.y,.7);
 float on=step(.62,h21(wi))*(.45+.55*vn(vec2(uTime*5.,wi.x*3.+wi.y)))*step(p.y,800.);
 bc+=fireRamp(.7*on+.05)*wnd*on*.9+vec3(.05,.02,.01)*fbm3(p*.02);
 c=mix(c,bc,inside);
 c+=vec3(1.,.5,.15)*ln(b,3.)*.35*fl;
 // 地面
 if(p.y>830.){vec3 g=vec3(.025,.012,.01)+vec3(.35,.12,.04)*exp(-(p.y-830.)*.006)*fl;
  float gl=fbm3(vec2(p.x*.01,p.y*.03));g+=vec3(.5,.2,.05)*smoothstep(.6,.8,gl)*exp(-(p.y-830.)*.01)*.4;
  c=mix(c,g,smoothstep(826.,834.,p.y));
  float grass=fbm3(vec2(p.x*.08,0.))*90.;c=mix(c,vec3(.01,.005,.005),smoothstep(1080.-grass,1084.-grass,p.y));}
 return c;}
`;

/* ---------- 冬の海峡：低い空、渡し船、診療所 ---------- */
const ISLAND = `
vec3 islandScene(vec2 p,float nt){
 const float hz=470.;
 vec3 c=mix(vec3(.36,.41,.48),vec3(.62,.66,.72),smoothstep(0.,hz,p.y));
 c=mix(c,mix(vec3(.02,.03,.06),vec3(.08,.1,.15),smoothstep(0.,hz,p.y))+vec3(.9)*stars(p,28.,.93)*.5*smoothstep(hz,0.,p.y),nt);
 float cl=fbm(vec2(p.x*.0018-uTime*.006,p.y*.007));c*=.82+.25*cl;
 c=mix(c,vec3(.25,.28,.33),smoothstep(.55,.75,fbm3(vec2(p.x*.003-uTime*.01,p.y*.02)))*smoothstep(400.,0.,p.y)*.4);
 // 遠い山（フィヨルド）
 float r1=hz-(70.+150.*fbm3(vec2(p.x*.0035,1.)))*smoothstep(1100.,200.,abs(p.x-500.)+.0)-(60.*fbm3(vec2(p.x*.003,7.)))*smoothstep(1250.,1900.,p.x);
 c=mix(c,vec3(.3,.34,.4),step(r1,p.y)*step(p.y,hz));
 // 島
 float hump=hz-14.-70.*exp(-pow((p.x-1320.)/200.,2.))-25.*fbm3(vec2(p.x*.01,3.))*exp(-pow((p.x-1320.)/260.,2.));
 float isl=step(hump,p.y)*step(p.y,hz+2.);
 vec3 ic=vec3(.13,.15,.17);ic=mix(ic,vec3(.75,.78,.82),smoothstep(.55,.7,fbm3(vec2(p.x*.03,p.y*.05)))*.6);
 c=mix(c,ic,isl);
 for(int k=0;k<4;k++){float hx=1230.+float(k)*55.;vec2 hp=p-vec2(hx,hz-22.-12.*exp(-pow((hx-1320.)/150.,2.))*3.);
  float hs=sdBox(hp,vec2(12.,9.));c=mix(c,vec3(.1,.09,.09),fill(hs,1.));
  c+=(vec3(1.,.75,.4)*fill(sdBox(hp-vec2(3.,1.),vec2(3.,3.)),1.)*(k==1?.5:1.)+vec3(1.,.7,.35)*exp(-length(hp)*.06)*.15)*(1.+nt);}
 c=mix(c,mix(vec3(.72,.75,.8),vec3(.12,.14,.2),nt),exp(-pow((p.y-hz)/36.,2.))*.4);
 // 海
 if(p.y>hz){float d=p.y-hz;float pz=1./(d+18.);
  vec2 wq=vec2(p.x*pz*6.,pz*1800.);
  float wv=fbm3(wq*vec2(.8,.4)+vec2(uTime*.06,uTime*.25));
  vec3 sea=mix(vec3(.2,.25,.3),vec3(.03,.05,.07),smoothstep(0.,500.,d));
  sea+=vec3(.55,.6,.68)*smoothstep(.55,.85,wv)*(.25+.5*exp(-d*.01));
  float refl=exp(-pow((p.x-1320.)/120.,2.))*exp(-d*.02);sea+=vec3(1.,.7,.35)*refl*smoothstep(.4,.7,wv)*.25;
  float ice=smoothstep(.6,.64,fbm3(vec2(p.x*.005,p.y*.018)))*smoothstep(860.,1000.,p.y);
  sea=mix(sea,vec3(.75,.82,.88)*(.8+.2*wv),ice);
  c=sea*(1.-nt*.7);}
 // 渡し船
 float fx=700.+460.*(.5+.5*sin(uTime*.045));float fy=hz+58.;vec2 fp=p-vec2(fx,fy);
 float hull=max(sdBox(fp,vec2(46.,7.)),-sdBox(fp-vec2(0.,12.),vec2(70.,6.)));hull=min(hull,sdBox(fp-vec2(-8.,-12.),vec2(18.,8.)));
 float fv=1.-nt;c=mix(c,vec3(.05,.05,.06),fill(hull,1.)*fv);
 vec2 lp=fp-vec2(16.,-20.);c+=vec3(1.,.78,.45)*(exp(-length(lp)*.25)*1.2+exp(-length(lp)*.04)*.2)*(.9+.1*sin(uTime*4.))*fv;
 c+=vec3(1.,.75,.4)*ln(p.x-fx-16.,3.)*step(fy+8.,p.y)*exp(-(p.y-fy)*.02)*.25*(.6+.4*vn(vec2(p.y*.08,uTime)))*fv;
 c+=vec3(.8,.85,.9)*ln(abs(fp.y-9.)-abs(fp.x+70.)*.04,1.5)*step(fp.x,-46.)*step(-260.,fp.x)*.2;
 // 手前の岸と診療所
 float shore=640.+60.*smoothstep(0.,700.,p.x)-12.*fbm3(vec2(p.x*.02,0.));
 float sm=step(shore,p.y)*step(p.x,760.-(p.y-shore)*.3);
 c=mix(c,mix(vec3(.6,.63,.67),vec3(.2,.21,.24),fbm3(p*.02))*(1.-nt*.65),sm);
 vec2 hp=p-vec2(330.,520.);float house=sdBox(hp,vec2(170.,110.));
 float roofD=max(abs(hp.x)*.55+hp.y+170.,-hp.y-108.);house=min(house,roofD);
 c=mix(c,vec3(.12,.12,.14),fill(house,1.));
 c=mix(c,vec3(.85,.88,.92),fill(max(abs(hp.x)*.55+hp.y+170.,-(hp.y+110.)),1.5)*step(hp.y,-100.)*.9);
 for(int k=0;k<3;k++){vec2 wq=hp-vec2(-110.+float(k)*80.,-20.);float wd=sdBox(wq,vec2(20.,26.));
  c=mix(c,vec3(.03,.035,.045),fill(wd,1.));c+=vec3(.5,.55,.65)*ln(wq.x-wq.y*.5-6.,3.)*fill(wd,1.)*.1;
  if(k==1){c=mix(c,vec3(1.,.78,.45),fill(wd,1.)*nt);c+=vec3(1.,.7,.4)*exp(-max(wd,0.)*.02)*nt*.35;}}
 vec2 dq=hp-vec2(130.,50.);c=mix(c,vec3(.05,.04,.04),fill(sdBox(dq,vec2(24.,58.)),1.));
 c=mix(c,vec3(.9,.9,.86),fill(sdBox(dq-vec2(0.,-15.),vec2(10.,13.)),.8));
 return c;}
`;

/* ---------- 画像の背景：ゆっくり寄るカメラ、空の瞬き、彗星（uP.x） ---------- */
const IMAGE = `
vec3 imageScene(vec2 p){
 vec2 uv=p/uRes;uv=.5+(uv-.5)/uKen.x+uKen.yz;uv.y=.5+(uv.y-.5)*.84375;
 vec3 c=uImgOn>.5?texture2D(uImg,uv).rgb:mix(vec3(.02,.03,.08),vec3(.08,.05,.12),p.y/1080.);
 float l=dot(c,vec3(.3,.59,.11));
 float skyM=smoothstep(.28,.05,l)*smoothstep(720.,260.,p.y)*step(c.r,c.b+.03);
 c+=vec3(.9,.92,1.)*stars(p+vec2(uTime*.6,0.),24.,.92)*skyM*.9;
 float warm=smoothstep(.5,.8,l)*step(c.b+.05,c.r)*step(560.,p.y);
 c*=1.+warm*.12*sin(uTime*2.+h21(floor(p/6.))*30.);
 if(uP.x>0.&&uP.x<1.){float t=uP.x;vec2 hd=vec2(mix(-160.,2080.,t),280.-sin(t*PI)*130.);
  vec2 dir=normalize(vec2(1.,-cos(t*PI)*130.*PI/2240.));
  vec2 r=p-hd;float al=-dot(r,dir);float pr=abs(dot(r,vec2(-dir.y,dir.x)));
  float tail=step(0.,al)*exp(-al*.0022)*exp(-pr*pr/(2.+al*.05)/(2.+al*.05)*.5);
  float tail2=step(0.,al)*exp(-al*.004)*exp(-pow(pr-al*.06,2.)*.02);
  float fade=smoothstep(0.,.08,t)*smoothstep(1.,.9,t);
  c+=(vec3(.75,.85,1.)*tail*.9+vec3(1.,.9,.7)*tail2*.35+vec3(1.,.97,.9)*(exp(-length(r)*.12)*2.+exp(-length(r)*.02)*.4))*fade;}
 return c;}
`;


/* ---------- 台所（朝）／家（夜） ---------- */
const KITCHEN = `
vec3 kitchenScene(vec2 p,float nt){
 vec3 c=mix(vec3(.62,.55,.45),vec3(.16,.11,.08),nt)*(.85+.15*fbm3(p*.004));
 if(p.x>1120.&&p.y>380.&&p.y<640.){vec2 t=fract(p/48.);c*=.9+.1*smoothstep(0.,.06,min(min(t.x,1.-t.x),min(t.y,1.-t.y)));c*=vec3(.92,1.,1.04);}
 vec2 wc=p-vec2(520.,350.);float ws=sdRBox(wc,vec2(230.,190.),6.);
 if(ws<0.){vec3 sky=mix(mix(vec3(.7,.82,.95),vec3(.95,.93,.88),(p.y-160.)/380.),mix(vec3(.03,.04,.1),vec3(.08,.07,.14),(p.y-160.)/380.),nt);
  sky=mix(sky,vec3(1.),smoothstep(.55,.8,fbm(vec2(p.x*.005+uTime*.005,p.y*.01)))*.5*(1.-nt));
  sky+=vec3(.9)*stars(p,26.,.93)*nt*.6;
  float roofs=470.-30.*step(.5,fract(p.x/110.))-20.*vn(vec2(p.x*.02,3.));
  if(p.y>roofs){sky=mix(vec3(.55,.5,.48),vec3(.02,.02,.04),nt);sky+=vec3(1.,.75,.4)*step(.8,h21(floor(p/vec2(16.,12.))))*nt*.6;}
  c=sky;c=mix(c,mix(vec3(.85,.82,.78),vec3(.1,.08,.07),nt),max(ln(wc.x,3.),ln(wc.y,3.)));}
 c=mix(c,mix(vec3(.85,.82,.78),vec3(.12,.09,.07),nt),ln(ws-6.,6.)*.9);
 c=mix(c,mix(vec3(.75,.7,.62),vec3(.12,.09,.07),nt),fill(sdBox(p-vec2(520.,552.),vec2(260.,10.)),1.));
 // 窓ぎわの古いラジオ
 vec2 rp=p-vec2(690.,512.);float rb=sdRBox(rp,vec2(56.,30.),6.);
 c=mix(c,mix(vec3(.45,.3,.2),vec3(.08,.05,.04),nt),fill(rb,1.));
 c=mix(c,vec3(.85,.8,.7)*(1.-nt*.85),fill(length(rp-vec2(-26.,0.))-16.,1.)*.8);c+=GOLD*ln(rb,1.)*.25;
 // 棚と流し台
 for(int k=0;k<3;k++){vec2 cp=p-vec2(1250.+float(k)*190.,240.);float cb=sdRBox(cp,vec2(88.,90.),4.);
  c=mix(c,mix(vec3(.82,.78,.7),vec3(.12,.09,.07),nt),fill(cb,1.));c+=vec3(.3)*ln(cb,1.)*.3;c=mix(c,GOLD*.6,fill(sdBox(cp-vec2(60.,60.),vec2(3.,12.)),.6));}
 float ct=sdBox(p-vec2(1520.,770.),vec2(380.,130.));c=mix(c,mix(vec3(.72,.68,.6),vec3(.1,.08,.06),nt),fill(ct,1.));
 c+=vec3(1.)*ln(p.y-640.,2.)*fill(abs(p.x-1520.)-380.,1.)*(.25-nt*.15);
 // 吊りランプ
 c=mix(c,vec3(.05),ln(p.x-1000.,1.5)*step(p.y,335.));
 vec2 lp=p-vec2(1000.,360.);float sh=max(abs(lp.x)-28.-max(lp.y+28.,0.)*1.2,abs(lp.y)-28.);
 c=mix(c,mix(vec3(.25,.35,.3),vec3(.15,.12,.1),nt),fill(sh,1.));
 c+=vec3(1.,.75,.45)*nt*(exp(-length(p-vec2(1000.,392.))*.03)*1.4+exp(-length((p-vec2(1000.,720.))*vec2(1.,1.5))*.0025)*.3);
 // 食卓
 float tb=sdRBox(p-vec2(1000.,800.),vec2(520.,22.),10.);
 c=mix(c,mix(vec3(.55,.38,.24),vec3(.22,.13,.08),nt),fill(tb,1.5));
 c+=mix(vec3(1.,.95,.85),vec3(1.,.75,.45),nt)*ln(p.y-779.,2.)*fill(abs(p.x-1000.)-520.,1.)*.3;
 c=mix(c,mix(vec3(.25,.18,.12),vec3(.05,.03,.02),nt),fill(sdBox(p-vec2(1000.,950.),vec2(500.,120.)),2.)*.7);
 vec2 sq=p-vec2(760.,740.);sq.x-=(p.y-560.)*.6;c+=vec3(1.,.93,.75)*fill(sdBox(sq,vec2(200.,120.)),40.)*(1.-nt)*.22;
 return c;}
`;

/* ---------- ジョナスの部屋（研究室）：星のない窓 ---------- */
const JONAS = `
vec3 jonasRoom(vec2 p){
 vec3 c=mix(vec3(.022,.024,.034),vec3(.006,.006,.01),p.y/1080.);
 float mx=abs(fract(p.x/240.)-.5)*240.;c+=GOLD*ln(mx,1.)*.07*smoothstep(900.,150.,p.y);
 c+=vec3(.04,.045,.06)*pow(fbm3(vec2(p.x*.003+uTime*.01,p.y*.002)),2.);
 vec2 wc=p-vec2(1300.,370.);float ws=sdRBox(wc,vec2(200.,190.),4.);
 if(ws<0.)c=vec3(.004,.004,.007)+vec3(.05,.055,.07)*smoothstep(.6,1.,sin((wc.x+wc.y)*.01+.5)*.5+.5)*.35;
 c+=GOLD*ln(ws,1.3)*.4+GOLD*ln(wc.x,1.)*fill(ws,1.)*.2;
 // 小石でひっかいた星（uP.x：1で見える、1より上でぬくもる）
 vec2 sp=wc-vec2(140.,135.);sp.y=-sp.y;sp.x+=sin(sp.y*.35)*1.2;float s5=sdStar5(sp,15.,.45);
 float g=uP.x;
 c+=vec3(1.,.88,.6)*(ln(s5,1.2)*.8*min(g,1.)+exp(-max(s5,0.)*.08)*.35*max(g-1.,0.)+exp(-length(sp)*.02)*.2*max(g-1.,0.));
 float bed=sdRBox(p-vec2(560.,800.),vec2(330.,66.),14.);c=mix(c,vec3(.05,.05,.07),fill(bed,1.5));c+=SILVER*ln(bed,1.)*.12;
 c=mix(c,vec3(.13,.12,.16),fill(sdRBox(p-vec2(720.,738.),vec2(110.,16.),6.),1.));
 c=mix(c,vec3(.16,.16,.2),fill(sdRBox(p-vec2(330.,738.),vec2(70.,22.),14.),1.));
 c+=GOLD*ln(p.y-880.,1.2)*.25;if(p.y>880.)c*=.5;
 return c;}
`;

/* ---------- カウンセラーの部屋：小さくて、あたたかい ---------- */
const COUNSEL = `
vec3 counselScene(vec2 p){
 vec3 c=mix(vec3(.52,.53,.46),vec3(.36,.36,.31),p.y/1080.)*(.9+.1*fbm3(p*.005));
 vec2 wc=p-vec2(1420.,380.);float ws=sdRBox(wc,vec2(210.,200.),4.);
 if(ws<0.){vec3 sky=mix(vec3(.75,.85,.95),vec3(.95,.95,.92),(p.y-180.)/400.);
  float br=smoothstep(.6,.65,fbm3(vec2(p.x*.01,p.y*.012)+vec2(sin(uTime*.3)*.04,0.)));sky=mix(sky,vec3(.45,.5,.45),br*.45);
  sky=mix(sky,vec3(.88,.85,.8),step(.82,fract(p.y/26.))*.9);c=sky;}
 c=mix(c,vec3(.9,.88,.84),ln(ws-5.,5.));
 // ブラインドの光の縞
 vec2 q=p-vec2(760.,430.);q.x+=q.y*.3;c+=vec3(1.,.95,.8)*step(.5,fract(q.y/30.))*fill(sdBox(q,vec2(240.,190.)),40.)*.12;
 // ソファ
 float sofa=min(sdRBox(p-vec2(520.,790.),vec2(380.,90.),40.),sdRBox(p-vec2(520.,660.),vec2(380.,80.),40.));
 c=mix(c,vec3(.28,.35,.45)*(.8+.2*fbm3(p*.02)),fill(sofa,2.));c+=vec3(.9,.9,1.)*ln(sofa,2.)*step(p.y,700.)*.12;
 // 机、ココア、色えんぴつのかご
 c=mix(c,vec3(.45,.32,.22),fill(sdRBox(p-vec2(1130.,800.),vec2(170.,14.),5.),1.));
 vec2 mp=p-vec2(1080.,768.);c=mix(c,vec3(.9,.85,.8),fill(sdRBox(mp,vec2(18.,22.),5.),1.));
 float st=ln(mp.x+sin(mp.y*.05+uTime*1.5)*6.,4.)*step(mp.y,-24.)*step(-130.,mp.y)*(1.+mp.y/130.);c+=vec3(1.)*st*.12;
 vec2 bp=p-vec2(1220.,770.);
 for(int k=0;k<6;k++){float fk=float(k);vec3 cc=.5+.5*cos(TAU*(fk*.17+vec3(0.,.33,.67)));c=mix(c,cc,fill(sdBox(bp-vec2(-28.+fk*11.,-30.-4.*sin(fk*3.)),vec2(3.,16.)),.6));}
 c=mix(c,vec3(.55,.4,.25),fill(sdRBox(bp,vec2(40.,20.),8.),1.));
 // 鉢植え
 vec2 pp=p-vec2(1700.,800.);c=mix(c,vec3(.6,.35,.25),fill(sdRBox(pp,vec2(40.,40.),6.),1.));
 float lv=smoothstep(.5,.55,fbm3(pp*.03)+.4-length(pp-vec2(0.,-120.))/130.);c=mix(c,vec3(.15,.3,.15),lv);
 if(p.y>890.)c=mix(c,vec3(.4,.3,.2)*(.85+.15*fbm3(vec2(p.x*.003,p.y*.05))),smoothstep(888.,894.,p.y));
 return c;}
`;

/* ---------- 屋外の昼：校門・校庭・公園 ---------- */
const OUTDOOR = `
vec3 outSky(vec2 p,float warm){
 vec3 c=mix(mix(vec3(.6,.72,.88),vec3(.88,.9,.92),smoothstep(0.,650.,p.y)),mix(vec3(.72,.62,.6),vec3(1.,.8,.55),smoothstep(0.,650.,p.y)),warm);
 return mix(c,mix(vec3(1.),vec3(1.,.86,.72),warm),smoothstep(.55,.8,fbm(vec2(p.x*.0025+uTime*.004,p.y*.007)))*.55);}
// 葉の落ちたプラタナス（3月）
vec3 tree(vec3 c,vec2 p,float x,float sc,float gy,float warm){
 float bend=sin(p.y*.008+x)*8.;float tw=(16.+14.*smoothstep(gy-300.*sc,gy,p.y))*sc;
 float d=abs(p.x-x-bend)-tw;float m=fill(d,1.5)*step(gy-420.*sc,p.y)*step(p.y,gy);
 vec3 bark=mix(vec3(.55,.52,.44),vec3(.32,.3,.26),step(.5,vn(p*.04)));
 c=mix(c,bark*mix(1.,.8,warm),m);
 float br=0.;vec2 q=(p-vec2(x,gy-420.*sc))/sc;
 for(int k=0;k<6;k++){float fk=float(k);float a=-.5+fk*.2+.1*sin(fk*3.);vec2 dir=normalize(vec2(sin(a*2.5),-1.));
  br=max(br,ln(sdSeg(q,vec2(0.),dir*(220.+80.*h21(vec2(x,fk)))),3.+fk*.3)*step(q.y,10.));}
 float twig=smoothstep(.62,.7,fbm3(q*.03))*smoothstep(380.,120.,length(q-vec2(0.,-160.)));
 c=mix(c,vec3(.25,.22,.2),max(br,twig*.7));
 return c;}
vec3 gateScene(vec2 p){
 vec3 c=outSky(p,0.);
 float hill=540.-280.*exp(-pow((p.x-1500.)/420.,2.))-40.*fbm3(vec2(p.x*.006,1.));
 if(p.y>hill)c=mix(vec3(.42,.48,.34),vec3(.3,.36,.24),fbm3(p*.01));
 vec2 op=p-vec2(1500.,262.);float ob=min(max(length(op)-26.,op.y),sdBox(op-vec2(0.,10.),vec2(34.,10.)));
 c=mix(c,vec3(.28,.27,.3),fill(ob,1.));
 float road=sdSeg(p,vec2(980.,900.),vec2(1470.,282.))-(4.+(p.y-280.)*.05);c=mix(c,vec3(.7,.66,.58),fill(road,1.5)*step(hill,p.y)*.7);
 // 校舎
 float sc=sdBox(p-vec2(260.,420.),vec2(300.,220.));
 if(sc<0.){c=vec3(.78,.72,.6)*(.9+.1*fbm3(p*.01));vec2 g=fract((p-vec2(0.,220.))/vec2(110.,120.));
  c=mix(c,vec3(.25,.32,.42),step(.25,g.x)*step(g.x,.75)*step(.2,g.y)*step(g.y,.75));}
 c=tree(c,p,700.,1.,640.,0.);c=tree(c,p,1850.,.9,620.,0.);
 if(p.y>620.)c=mix(c,vec3(.68,.63,.54)*(.85+.15*fbm3(p*.03)),smoothstep(618.,624.,p.y));
 // 鉄の門
 float bx=abs(fract((p.x-300.)/62.)-.5)*62.;float inb=step(300.,p.x)*step(p.x,1650.);
 float topY=250.-50.*sin(clamp((p.x-300.)/1350.,0.,1.)*PI);
 float bars=fill(bx-4.,1.)*step(topY,p.y)*step(p.y,930.);
 float tip=fill(bx*1.6-(p.y-topY+16.),1.)*step(topY-18.,p.y)*step(p.y,topY);
 float rails=max(max(fill(abs(p.y-topY-48.)-5.,1.),fill(abs(p.y-880.)-6.,1.)),fill(abs(p.y-600.)-5.,1.));
 float iron=max(max(bars,tip),rails)*inb;
 c=mix(c,vec3(.06,.065,.075),iron);c+=vec3(.6,.65,.75)*ln(bx-2.,1.3)*bars*inb*.25;
 vec2 lt=p-vec2(975.,600.);float lb=sdRBox(lt,vec2(22.,30.),3.);c=mix(c,vec3(.09,.09,.1),fill(lb,1.));c+=SILVER*ln(lb,1.)*.5;
 for(int k=0;k<2;k++){float px=k==0?240.:1710.;float pl=sdBox(p-vec2(px,580.),vec2(58.,380.));
  c=mix(c,vec3(.62,.58,.5)*(.8+.2*fbm3(p*.03))*(.75+.25*smoothstep(-58.,58.,p.x-px)),fill(pl,1.));
  c=mix(c,vec3(.5,.47,.4),fill(sdBox(p-vec2(px,196.),vec2(72.,16.)),1.));}
 return c;}
vec3 yardScene(vec2 p){
 vec3 c=outSky(p,.15);
 float sc=sdBox(p-vec2(960.,330.),vec2(1100.,200.));
 if(sc<0.){c=vec3(.8,.74,.62)*(.9+.1*fbm3(p*.01));vec2 g=fract((p-vec2(30.,150.))/vec2(140.,130.));
  c=mix(c,vec3(.3,.38,.48)+vec3(.3)*step(.6,g.x+g.y*.3)*.2,step(.25,g.x)*step(g.x,.75)*step(.2,g.y)*step(g.y,.72));}
 c=mix(c,vec3(.55,.35,.28),fill(sdBox(p-vec2(960.,125.),vec2(1100.,10.)),1.));
 if(p.y>530.)c=mix(c,vec3(.76,.7,.6)*(.85+.15*fbm(p*.02)),smoothstep(528.,534.,p.y));
 c=tree(c,p,260.,1.15,720.,.1);c=tree(c,p,1660.,1.05,700.,.1);
 c*=1.-.25*fill(length((p-vec2(330.,760.))*vec2(1.,3.))-200.,60.)*step(530.,p.y);
 float bench=min(sdRBox(p-vec2(980.,690.),vec2(160.,10.),3.),sdRBox(p-vec2(980.,650.),vec2(160.,8.),3.));
 bench=min(bench,min(sdBox(p-vec2(850.,720.),vec2(5.,30.)),sdBox(p-vec2(1110.,720.),vec2(5.,30.))));
 c=mix(c,vec3(.12,.25,.18),fill(bench,1.));
 return c;}
vec3 parkScene(vec2 p){
 vec3 c=outSky(p,.5);
 float hs=560.-40.*step(.5,fract(p.x/170.))-30.*vn(vec2(p.x*.01,2.));
 if(p.y>hs)c=mix(vec3(.55,.45,.42),vec3(.3,.25,.25),.5)*(1.-.3*fbm3(p*.01));
 if(p.y>600.)c=mix(c,vec3(.42,.5,.3)*(.8+.2*fbm(p*.015)),smoothstep(598.,604.,p.y));
 c=tree(c,p,200.,1.2,700.,.5);c=tree(c,p,1820.,1.1,690.,.5);
 // ブランコ
 vec3 iron=vec3(.25,.3,.38);
 float fr=min(min(sdSeg(p,vec2(560.,300.),vec2(500.,860.)),sdSeg(p,vec2(560.,300.),vec2(620.,860.))),
  min(sdSeg(p,vec2(1180.,300.),vec2(1120.,860.)),sdSeg(p,vec2(1180.,300.),vec2(1240.,860.))));
 fr=min(fr,sdSeg(p,vec2(560.,300.),vec2(1180.,300.)));c=mix(c,iron,fill(fr-6.,1.));
 for(int k=0;k<2;k++){float cx=k==0?770.:970.;float sw=sin(uTime*1.3+float(k)*2.)*(k==0?.02:.06);
  vec2 a=vec2(cx,300.),b=a+vec2(sin(sw),cos(sw))*400.;
  float ch=min(sdSeg(p,a-vec2(32.,0.),b-vec2(32.,0.)),sdSeg(p,a+vec2(32.,0.),b+vec2(32.,0.)));
  c=mix(c,vec3(.55,.55,.58),fill(ch-1.5,1.));c=mix(c,vec3(.6,.25,.2),fill(sdRBox(p-b-vec2(0.,6.),vec2(42.,7.),3.),1.));}
 // すべり台
 float sl=min(sdSeg(p,vec2(1420.,420.),vec2(1720.,820.))-10.,sdBox(p-vec2(1420.,640.),vec2(8.,220.)));
 sl=min(sl,sdBox(p-vec2(1380.,640.),vec2(8.,220.)));c=mix(c,vec3(.7,.55,.2),fill(sl,1.));
 return c;}
`;

/* ---------- 路地裏（夜）：濡れた石畳と看板 ---------- */
const ALLEY = `
vec3 sgn(float seg,float side){float h=h21(vec2(seg,side*3.+1.));
 vec3 col=h<.33?vec3(1.,.3,.6):(h<.66?vec3(.3,.85,1.):vec3(1.,.68,.3));
 float fl=.75+.25*step(.25,vn(vec2(uTime*6.+seg*9.,side)));
 return col*step(.4,h21(vec2(seg*1.7,side+5.)))*fl;}
vec3 alleyScene(vec2 p){
 vec2 vp=vec2(960.,470.);vec2 q=p-vp;const float zEnd=12.;
 float s=max(max(abs(q.x)/.7,abs(q.y)/.9),420./zEnd);float z=420./s;vec2 w=q*z/420.;
 float wall=step(abs(q.y)/.9,abs(q.x)/.7);
 float side=sign(q.x);float seg=floor(z*.5);float zs=(seg+.5)/.5;
 vec3 c;
 if(z>=zEnd-.01){c=vec3(.12,.07,.05)+vec3(1.,.6,.3)*exp(-length(q)*.04)*.6;}
 else if(wall>.5){
  vec2 b=vec2(z*5.,w.y*12.);b.x+=step(1.,mod(floor(b.y),2.))*.5;vec2 bf=fract(b);
  c=vec3(.07,.045,.04)*(.7+.3*h21(floor(b)))*(.75+.25*smoothstep(0.,.08,min(min(bf.x,1.-bf.x),min(bf.y,1.-bf.y))));
  vec3 sc=sgn(seg,side);
  float inS=step(abs(z-zs),.32)*step(-.6,w.y)*step(w.y,-.28);
  c=mix(c,sc*1.3,inS*step(.01,length(sc)));
  c+=sc*exp(-abs(z-zs)*2.2)*exp(-abs(w.y+.44)*3.)*.45;
  c=mix(c,vec3(.03),ln(abs(fract(z*.23)-.5)*z,.05)*.0+fill(abs(fract(z*.23+.3)-.5)*z*40.-1.,.5)*.5);
 } else if(q.y>0.){
  vec2 cb=vec2(w.x*9.,z*3.5);vec2 cf=fract(cb)-.5;float stone=length(cf)-.42;
  c=vec3(.04,.04,.05)*(.7+.3*h21(floor(cb)))*(.7+.3*smoothstep(0.,.08,-stone));
  float wet=.4+.6*smoothstep(.45,.6,fbm3(vec2(w.x*2.,z*.7)));
  vec3 refl=sgn(seg,-1.)*exp(-pow((w.x+.62)/.22,2.))+sgn(seg,1.)*exp(-pow((w.x-.62)/.22,2.));
  c+=refl*exp(-abs(fract(z*.5)-.5)*3.)*wet*.4;
  c+=vec3(1.,.6,.3)*exp(-(zEnd-z)*.6)*exp(-abs(w.x)*3.)*wet*.3;
 } else {
  c=vec3(.015,.018,.035)+vec3(.8)*stars(p,30.,.96)*.3;
  c=mix(c,vec3(.02),fill(abs(w.y+.75+.04*sin(z*2.))*z*60.-1.,.6));
 }
 c=mix(vec3(.04,.03,.045),c,exp(-z*.1));
 return c;}
`;

/* 背景キー → 使う関数と呼び出し。画像の背景は image に回す（index.html の BG_IMG にあるもの） */
const SCENES = {
  title:          { src:[LAB],          call:'labScene(p,1.)' },
  lab:            { src:[LAB],          call:'labScene(p,0.)' },
  church:         { src:[CHURCH],       call:'churchScene(p)' },
  room:           { src:[ROOM],         call:'roomScene(p)' },
  classroom:      { src:[CLASSROOM],    call:'classScene(p)' },
  base:           { src:[BASE],         call:'baseScene(p,0.)' },
  dream:          { src:[BASE],         call:'dreamScene(p)' },
  corridor:       { src:[CORRIDOR],     call:'corridorScene(p)' },
  corridor_night: { src:[NIGHT],        call:'nightCorridor(p,0.)' },
  fire_outside:   { src:[FIRE],         call:'fireScene(p)' },
  island:         { src:[ISLAND],       call:'islandScene(p,0.)' },
  island_night:   { src:[ISLAND],       call:'islandScene(p,1.)' },
  room_dusk:      { src:[ROOM],         call:'roomScene(p)' },
  kitchen:        { src:[KITCHEN],      call:'kitchenScene(p,0.)' },
  home_night:     { src:[KITCHEN],      call:'kitchenScene(p,1.)' },
  jonas_room:     { src:[JONAS],        call:'jonasRoom(p)' },
  counseling_room:{ src:[COUNSEL],      call:'counselScene(p)' },
  corridor_school:{ src:[NIGHT],        call:'nightCorridor(p,1.)' },
  school_gate:    { src:[OUTDOOR],      call:'gateScene(p)' },
  schoolyard:     { src:[OUTDOOR],      call:'yardScene(p)' },
  park:           { src:[OUTDOOR],      call:'parkScene(p)' },
  back_alley:     { src:[ALLEY],        call:'alleyScene(p)' },
  institute_night:{ src:[LAB],          call:'instituteScene(p)' },
  black:          { src:[],             call:'vec3(0.)' },
  image:          { src:[IMAGE],        call:'imageScene(p)' },
};
const bgSource = key => { const s = SCENES[key]; return PRELUDE + s.src.join('\n') +
  `\nvoid main(){vec2 p=gl_FragCoord.xy/uPx;gl_FragColor=vec4(max(${s.call},0.),1.);}`; };

/* ---------- ブルーム（明るいところだけ抜く → ぼかす） ---------- */
const BRIGHT = `precision highp float;uniform sampler2D uSrc;uniform vec2 uTexel;uniform float uTh;
void main(){vec2 uv=gl_FragCoord.xy*uTexel;vec2 o=uTexel*.5;
 vec3 c=(texture2D(uSrc,uv+vec2(-o.x,-o.y)).rgb+texture2D(uSrc,uv+vec2(o.x,-o.y)).rgb+texture2D(uSrc,uv+vec2(-o.x,o.y)).rgb+texture2D(uSrc,uv+vec2(o.x,o.y)).rgb)*.25;
 float l=max(c.r,max(c.g,c.b));float k=clamp((l-uTh)/max(1.-uTh,.05),0.,1.);gl_FragColor=vec4(c*k*k,1.);}`;
const BLUR = `precision highp float;uniform sampler2D uSrc;uniform vec2 uTexel,uDir;
void main(){vec2 uv=gl_FragCoord.xy*uTexel;vec2 d=uDir*uTexel;
 vec3 c=texture2D(uSrc,uv).rgb*.227;
 c+=(texture2D(uSrc,uv+d*1.385).rgb+texture2D(uSrc,uv-d*1.385).rgb)*.316;
 c+=(texture2D(uSrc,uv+d*3.231).rgb+texture2D(uSrc,uv-d*3.231).rgb)*.07;
 gl_FragColor=vec4(c,1.);}`;

/* ---------- 仕上げ：ゆがみ・色調・粒子・特殊演出 ----------
   uK の並びは stage.js の POST_KEYS と同じ */
const POST = `precision highp float;
uniform sampler2D uSrc,uBloomA,uBloomB;uniform vec2 uRes,uView;uniform float uTime;
uniform float uK[34];uniform vec3 uLift,uGain;
#define EXPO uK[0]
#define CON uK[1]
#define SAT uK[2]
#define TEMP uK[3]
#define BLOOM uK[4]
#define GRAIN uK[5]
#define CA uK[6]
#define VIG uK[7]
#define HAZE uK[8]
#define RIPPLE uK[9]
#define FLASHBACK uK[10]
#define OBSERVE uK[11]
#define SNOW uK[12]
#define EMBERS uK[13]
#define DUST uK[14]
#define MOTES uK[15]
#define LEAVES uK[16]
#define SOFT uK[17]
#define UNRAVEL uK[18]
#define UNRAVELX uK[19]
#define FLOWER uK[20]
#define FLOWERA uK[21]
#define SHATTER uK[22]
#define WAKE uK[23]
#define WAKEBLUR uK[24]
#define WHITE uK[25]
#define PULSE uK[26]
#define JOLT uK[27]
#define TOUCH uK[28]
#define TOUCHX uK[29]
#define TOUCHY uK[30]
#define DIM uK[31]
#define COLD uK[32]
#define MOTION uK[33]
#define TAU 6.2831853
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
vec2 h22(vec2 p){float n=h21(p);return vec2(n,h21(p+n*17.31+3.7));}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
vec2 toUV(vec2 p){return vec2(p.x,uRes.y-p.y)/uRes;}
vec3 src(vec2 uv){return texture2D(uSrc,clamp(uv,vec2(.0005),vec2(.9995))).rgb;}
// 雪：奥から手前へ3層
float snow(vec2 p,float t){float s=0.;
 for(int i=0;i<3;i++){float fi=float(i);float cell=70.+fi*45.;vec2 q=p;q.y-=t*(36.+fi*34.);q.x+=sin(q.y*.004+fi*2.)*40.+t*(8.+fi*6.);
  vec2 g=floor(q/cell),f=fract(q/cell);float h=h21(g+fi*17.);if(h<.45)continue;
  vec2 o=h22(g+fi*3.)*.7+.15;o.x+=sin(t*1.2+h*20.)*.08;float r=1.+h*1.6+fi*1.6;float d=length((f-o)*cell);
  s+=smoothstep(r+1.+fi,r*.2,d)*(.45+fi*.3);}
 return s;}
// 火の粉：ゆらぎながら昇る
vec3 embers(vec2 p,float t){vec3 s=vec3(0.);
 for(int i=0;i<3;i++){float fi=float(i);float cell=110.-fi*25.;vec2 q=p;q.y+=t*(70.+fi*55.);q.x+=sin(q.y*.006+fi*4.+t*.7)*40.;
  vec2 g=floor(q/cell),f=fract(q/cell);float h=h21(g+fi*11.);if(h<.62)continue;
  vec2 o=h22(g+fi*5.)*.7+.15;vec2 d=(f-o)*cell;d.y*=.55;float r=1.2+fi*.9;
  float b=smoothstep(r+1.5,0.,length(d))*(.5+.5*sin(t*(6.+h*8.)+h*40.));
  s+=mix(vec3(1.,.32,.06),vec3(1.,.78,.4),h21(g+2.))*b*(.6+fi*.25);}
 return s;}
// 光の埃：明るいところでだけ見える
float dust(vec2 p,float t){float s=0.;
 for(int i=0;i<2;i++){float fi=float(i);float cell=60.+fi*40.;vec2 q=p+vec2(t*(6.+fi*5.),sin(t*.3+fi)*20.-t*(3.+fi*2.));
  vec2 g=floor(q/cell),f=fract(q/cell);float h=h21(g+fi*7.);if(h<.55)continue;
  vec2 o=h22(g+fi)*.8+.1+vec2(sin(t*.7+h*30.),cos(t*.5+h*20.))*.06;float d=length((f-o)*cell);
  s+=smoothstep(1.6+fi,0.,d)*(.5+.5*sin(t*2.+h*50.));}
 return s;}
// 星屑：金と銀の小さな光が昇る
vec3 motes(vec2 p,float t){vec3 s=vec3(0.);
 for(int i=0;i<2;i++){float fi=float(i);float cell=120.+fi*60.;vec2 q=p+vec2(sin(t*.2+fi)*30.,t*(10.+fi*8.));
  vec2 g=floor(q/cell),f=fract(q/cell);float h=h21(g+fi*13.);if(h<.58)continue;
  vec2 o=h22(g+fi*2.)*.8+.1;vec2 d=(f-o)*cell;float r=length(d);
  float tw=.5+.5*sin(t*(1.5+h*2.)+h*60.);
  float b=exp(-r*r*.35)*1.2+(exp(-abs(d.x)*.9)*exp(-abs(d.y)*.18)+exp(-abs(d.y)*.9)*exp(-abs(d.x)*.18))*.35;
  s+=mix(vec3(1.,.86,.55),vec3(.85,.9,1.),h21(g+9.))*b*tw;}
 return s;}
// 落ち葉：暗い影の葉が回りながら落ちる
vec4 leaves(vec2 p,float t){vec4 s=vec4(0.);
 for(int i=0;i<2;i++){float fi=float(i);float cell=240.+fi*140.;vec2 q=p;q.y-=t*(40.+fi*30.);q.x+=sin(q.y*.003+fi*3.)*80.-t*(12.+fi*10.);
  vec2 g=floor(q/cell),f=fract(q/cell);float h=h21(g+fi*19.);if(h<.6)continue;
  vec2 o=h22(g+fi*7.)*.6+.2;vec2 d=(f-o)*cell;float a=t*(1.+h*2.)+h*30.;d=mat2(cos(a),-sin(a),sin(a),cos(a))*d;
  float sz=9.+fi*9.;d.y*=1.+.8*abs(sin(t*1.5+h*10.));
  float e=length(d/vec2(sz,sz*.45))-1.;float m=smoothstep(.15,-.15,e);
  s.rgb+=mix(vec3(.25,.12,.05),vec3(.55,.32,.12),h)*m;s.a=max(s.a,m*(.7+fi*.2));}
 return s;}
// 光の花：ルネのまわりに咲く
vec3 flowers(vec2 p,float prog,float t){vec3 s=vec3(0.);
 for(int k=0;k<11;k++){float fk=float(k);vec2 c=vec2(960.,560.)+(h22(vec2(fk,3.))-.5)*vec2(900.,520.);
  c.y-=prog*30.*h21(vec2(fk,8.));
  float ph=clamp(prog*1.7-fk*.06,0.,1.);if(ph<=0.)continue;
  vec2 d=p-c;float r=length(d);float a=atan(d.y,d.x)+t*.15*(h21(vec2(fk,1.))-.5)+fk;
  float open=smoothstep(0.,1.,ph);float size=(22.+30.*h21(vec2(fk,5.)))*(.4+.9*open);
  float petal=size*(.55+.45*abs(cos(a*2.5)))*(.55+.45*open);
  float bud=size*.35*(1.-open*.4);
  float f=smoothstep(petal+3.,petal-3.,r)*.35+exp(-max(r-petal,0.)*.08)*.25;
  f+=exp(-r*r/(bud*bud))*1.2;
  s+=mix(vec3(1.,.72,.82),vec3(1.,.9,.6),h21(vec2(fk,9.)))*f*ph;}
 return s;}
void main(){
 vec2 fc=gl_FragCoord.xy;vec2 uv=fc/uView;vec2 p=vec2(uv.x,1.-uv.y)*uRes;
 float t=uTime;
 vec2 du=vec2(0.);
 if(MOTION>.5){
  du+=(vec2(vn(p*.011+vec2(0.,t*2.2)),vn(p*.013+vec2(5.,t*2.6)))-.5)*HAZE*.012*smoothstep(1080.,250.,p.y);
  du+=vec2(sin(p.y*.018+t*1.4),cos(p.x*.014+t*1.1))*.0028*RIPPLE;
  if(TOUCH>0.){vec2 tp=vec2(TOUCHX,TOUCHY);float d=length(p-tp);float R=TOUCH*1100.;
   float w=exp(-pow((d-R)/38.,2.))*(1.-TOUCH);vec2 n=(p-tp)/max(d,1.);du+=vec2(n.x,-n.y)*w*.012;}
  du*=1.;
  vec2 cc=uv-.5;du-=cc*PULSE*.012;
  if(SHATTER>0.){vec2 q=p-vec2(960.,560.);float a=atan(q.y,q.x);float id=floor(a/TAU*13.+vn(vec2(length(q)*.01,0.))*.6);
   float ring=floor(length(q)/180.);du+=(h22(vec2(id,ring))-.5)*.012*smoothstep(0.,.2,SHATTER)*(1.-SHATTER)*step(length(q),SHATTER*1400.);}
 }
 vec2 u=uv+du;
 float ca=(CA+COLD*.35+PULSE*.8+JOLT*2.)*(.0015+.006*dot(uv-.5,uv-.5));
 vec2 cd=(uv-.5)*ca;
 vec3 col=vec3(src(u+cd).r,src(u).g,src(u-cd).b);
 // やわらかいぼかし（回想・夢・目覚め）
 float blur=SOFT*.6+WAKEBLUR+FLASHBACK*.35+JOLT*.5;
 if(blur>.01){vec3 acc=vec3(0.);float rad=blur*9./uRes.x;
  for(int i=0;i<8;i++){float a=float(i)*.785+.3;acc+=src(u+vec2(cos(a),sin(a))*rad*vec2(1.,1.7778));}
  col=mix(col,acc/8.,clamp(blur*1.2,0.,1.));}
 // ブルーム
 vec3 bl=texture2D(uBloomA,u).rgb*.75+texture2D(uBloomB,u).rgb*1.;
 col+=bl*(BLOOM*.9+WHITE*2.+FLOWERA*FLOWER*.5);
 // 粒子
 float lum=dot(col,vec3(.3,.59,.11));
 if(DUST>0.)col+=vec3(1.,.95,.85)*dust(p,t)*DUST*(.15+pow(lum,1.3)*1.4);
 if(MOTES>0.)col+=motes(p,t)*MOTES*.7;
 if(SNOW>0.)col=mix(col,vec3(.92,.95,1.),clamp(snow(p,t)*SNOW,0.,1.)*.85);
 if(EMBERS>0.)col+=embers(p,t)*EMBERS;
 if(LEAVES>0.){vec4 lv=leaves(p,t);col=mix(col,lv.rgb,lv.a*LEAVES);}
 if(UNRAVEL>0.){vec2 q=p-vec2(UNRAVELX,0.);float m=exp(-q.x*q.x/(200.*200.))*smoothstep(150.,450.,p.y)*smoothstep(1080.,800.,p.y)*.0+exp(-q.x*q.x/(210.*210.))*smoothstep(120.,520.,p.y);
  vec3 mo=motes(p*vec2(1.,1.)+vec2(0.,t*90.),t*2.5);col+=mo*m*UNRAVEL*1.6;col+=vec3(.8,.85,1.)*m*UNRAVEL*.05;}
 if(FLOWERA>0.)col+=flowers(p,FLOWER,t)*FLOWERA;
 if(SHATTER>0.){vec2 q=p-vec2(960.,560.);float r=length(q);float a=atan(q.y,q.x);
  float sa=abs(fract(a/TAU*13.+vn(vec2(r*.012,1.))*.6)-.5)*TAU/13.*r;
  float rr=abs(fract(r/180.+vn(vec2(a*3.,2.))*.3)-.5)*180.;
  float crack=max(exp(-sa*sa*.18),exp(-rr*rr*.12)*step(.5,h21(vec2(floor(a/TAU*13.),floor(r/180.)))));
  crack*=step(r,SHATTER*1500.)*(1.-smoothstep(.35,1.,SHATTER));
  col+=vec3(1.,.82,.9)*crack*1.3;col*=1.-SHATTER*.25;}
 // 色調
 col*=EXPO*(1.-DIM*.6);
 float tmp=TEMP-COLD*.9;
 col*=vec3(1.+tmp*.12,1.+tmp*.015,1.-tmp*.14);
 col=col*uGain+uLift*(1.-col);
 col=(col-.45)*CON+.45;
 float l=dot(col,vec3(.3,.59,.11));col=mix(vec3(l),col,SAT*(1.-COLD*.25));
 // 回想：セピアとフィルムの縁
 if(FLASHBACK>0.){vec3 sep=vec3(l)*vec3(1.08,.95,.76)+vec3(.04,.02,0.);col=mix(col,sep,FLASHBACK*.65);
  vec2 e=abs(uv-.5)*2.;float edge=smoothstep(.75,1.02,max(e.x*.98,e.y*1.04)+pow(min(e.x,e.y),6.)*.2);
  col*=1.-edge*FLASHBACK*.75;
  col+=vec3(1.,.55,.25)*exp(-length((uv-vec2(1.05,.05))*vec2(1.,1.7))*3.)*(.25+.1*sin(t*.7))*FLASHBACK;
  col*=1.+(vn(vec2(t*14.,0.))-.5)*.06*FLASHBACK;}
 // 観測：天井の硝子に映った景色
 if(OBSERVE>0.){col*=1.-OBSERVE*.05*(.5+.5*sin(p.y*.9-t*5.));
  col+=vec3(.8,.85,1.)*exp(-pow((p.y-mod(t*170.,1500.)+200.)/70.,2.))*.05*OBSERVE;
  vec2 d=p-vec2(960.,-300.);d.y*=1.45;float rr=length(d);float aa=atan(d.y,d.x);
  float rib=exp(-pow(abs(fract(aa/TAU*24.)-.5)*TAU/24.*rr/1.3,2.)*.5);
  col+=vec3(.86,.68,.33)*rib*.06*OBSERVE;}
 // 白く飛ぶ
 col=mix(col,vec3(1.,.97,.93),clamp(WHITE,0.,1.)*.8);
 // ビネット・鼓動
 vec2 v=uv-.5;float vg=dot(v,v);col*=1.-vg*(VIG+PULSE*1.6+DIM*.4);
 // まぶた（目覚め）
 if(WAKE<.999){float op=WAKE;float x=(uv.x-.5)*2.;float lid=op*.62*sqrt(max(1.-x*x*.7,0.));
  float y=abs(uv.y-.5);float m=smoothstep(lid-.03,lid+.02,y);col*=1.-m;}
 // 粒状感
 col+=(h21(fc+fract(t*7.3)*91.)-.5)*GRAIN*.09;
 col+=(h21(fc*1.37+3.)-.5)/255.;
 gl_FragColor=vec4(clamp(col,0.,1.),1.);}`;

window.HHStageShaders = { VS, SCENES, bgSource, BRIGHT, BLUR, POST };
})();
