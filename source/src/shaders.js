// ---------------------------------------------------------------------------
// GLSL. One shader draws every surface of the city: the material id picks a
// procedural texture (stone, plaster with windows, roof tiles, cobbles...), then
// sun + sky + street lamps light it, then aerial haze fades it into the sky.
// ---------------------------------------------------------------------------
const GLSL_COMMON = /*glsl*/`
float h1(float n){return fract(sin(n*127.1)*43758.5453);}
float h2(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+1.),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*vn(p);p=p*2.07+vec2(17.1,9.3);a*=.5;}return s;}
vec3 lin(vec3 c){return pow(max(c,0.),vec3(2.2));}
`;

const VS_MAIN = /*glsl*/`#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec2 aT;
layout(location=3) in vec3 aC; layout(location=4) in vec2 aM; layout(location=5) in vec4 aQ;
uniform mat4 uVP;
out vec3 vP; out vec3 vN; out vec2 vT; out vec3 vC; flat out vec2 vM; flat out vec4 vQ;
void main(){vP=aP;vN=aN;vT=aT;vC=aC;vM=aM;vQ=aQ;gl_Position=uVP*vec4(aP,1.);}`;

const FS_MAIN = /*glsl*/`#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vP; in vec3 vN; in vec2 vT; in vec3 vC; flat in vec2 vM; flat in vec4 vQ;
uniform vec3 uCam,uSun,uSunC,uSky,uHor,uGnd; uniform float uTime,uNight,uFog,uExpo; uniform vec2 uClock;
uniform sampler2DShadow uSh,uSh2; uniform mat4 uShM,uShM2,uV; uniform vec2 uShT,uShT2,uShW; uniform sampler2D uAO;
uniform vec4 uL[24]; uniform int uNL;
layout(location=0) out vec4 oC; layout(location=1) out vec4 oN;
${GLSL_COMMON}
const vec3 LAMPC=vec3(1.,.66,.36);
const vec2 PD[12]=vec2[](vec2(-.326,-.406),vec2(-.84,-.074),vec2(-.696,.457),vec2(-.203,.621),vec2(.962,-.195),vec2(.473,-.48),vec2(.519,.767),vec2(.185,-.893),vec2(.507,.064),vec2(.896,.412),vec2(-.322,-.933),vec2(-.792,-.598));
// coverage of a box given signed distances (negative = inside)
float inBox(vec2 d,float fw){return 1.-smoothstep(-fw,fw,max(d.x,d.y));}

vec3 brick(vec2 t){
  float r=floor(t.y/.075);vec2 f=vec2(fract(t.x/.26+r*.5),fract(t.y/.075));
  float m=step(.06,f.x)*step(.12,f.y);float id=h2(vec2(floor(t.x/.26+r*.5),r));
  return mix(vec3(.5,.45,.4),mix(vec3(.55,.25,.15),vec3(.66,.36,.22),id),m);
}

// view ray and sun direction in the tangent space of the current wall (x along it, y up, z out),
// and the extra shadowing a window recess casts on itself
vec3 gRd,gLt;float gSh=1.;

// A room seen through a window: the ray enters at o (x centred, y from the floor, z = 0 on the glass)
// and hits the back wall, a side wall, the floor or the ceiling. Returns its colour.
vec3 room(vec3 o,vec3 rd,vec2 sz,float dep,float seed,bool shop){
  float tx=((rd.x>=0.?sz.x*.5:-sz.x*.5)-o.x)/(abs(rd.x)<1e-4?1e-4:rd.x);
  float ty=((rd.y>=0.?sz.y:0.)-o.y)/(abs(rd.y)<1e-4?(rd.y<0.?-1e-4:1e-4):rd.y);
  float tz=dep/max(-rd.z,1e-3),t=min(tx,min(ty,tz));
  vec3 p=o+rd*t;
  vec3 wc=mix(vec3(.62,.56,.46),vec3(.5,.55,.52),h1(seed));wc=mix(wc,vec3(.62,.45,.38),step(.75,h1(seed+.7)));
  vec3 c;
  if(t==tz){
    c=wc;
    if(shop){ // shelves full of goods
      float sh=fract(p.y/.42),row=floor(p.y/.42);
      vec3 item=.25+.75*vec3(h1(floor(p.x/.18)+row*7.+seed),h1(floor(p.x/.18)*3.+row+seed),h1(floor(p.x/.18)+row*13.+seed*2.));
      c=mix(c,item*.7,step(.25,sh)*step(.4,p.y)*step(p.y,2.4));
      c=mix(c,vec3(.35,.25,.16),step(sh,.12)*step(.4,p.y)*step(p.y,2.5));
    }else{
      float px=(h1(seed+2.)-.5)*sz.x*.5;
      c=mix(c,mix(vec3(.25,.3,.35),vec3(.5,.35,.2),h1(seed+3.)),step(abs(p.x-px),.32)*step(abs(p.y-1.65),.24)); // a painting
      c=mix(c,vec3(.28,.18,.11),step(p.y,.85)*step(abs(p.x+(h1(seed+4.)-.5)),.55)); // a cupboard
    }
  }else if(t==ty)c=rd.y>0.?vec3(.82,.8,.74):(shop?vec3(.55,.5,.45):vec3(.38,.24,.14)*(.8+.2*step(.5,fract(p.x*3.))));
  else c=wc*.82;
  return c*(1.-min(-p.z/dep,1.)*.5);
}
// does the sun reach point h (h.z <= 0) inside a recess of half size hs?
float recessSun(vec3 h,vec2 hs){
  if(gLt.z<=.01)return 0.;
  vec2 e=h.xy+gLt.xy*(-h.z/gLt.z),dd=abs(e)-hs;
  return 1.-smoothstep(-.015,.015,max(dd.x,dd.y));
}
// trace the view ray into a recess of half size hs, depth D from point q on the wall.
// returns the hit point; face: 0 back, 1 side (x), 2 top/bottom (y)
vec3 recess(vec2 q,vec2 hs,float D,out int face){
  vec3 rd=gRd;
  float tz=D/max(-rd.z,.02);
  float tx=((rd.x>=0.?hs.x:-hs.x)-q.x)/(abs(rd.x)<1e-4?1e-4:rd.x);
  float ty=((rd.y>=0.?hs.y:-hs.y)-q.y)/(abs(rd.y)<1e-4?1e-4:rd.y);
  float t=min(tz,min(tx,ty));face=t==tz?0:t==tx?1:2;
  return vec3(q,0.)+rd*t;
}
float revealLight(int face,vec3 h,vec2 hs){
  vec3 nr=face==1?vec3(-sign(gRd.x),0,0):vec3(0,-sign(gRd.y),0);
  return recessSun(h,hs)*clamp(dot(nr,gLt)/max(gLt.z,.08),0.,2.5);
}

// Window grid on plastered facades. Returns albedo, writes height, specular and glow.
vec3 windows(vec2 t,vec3 wall,float fw,inout float hgt,inout float spec,inout vec3 emi){
  float cw=vQ.x,ww=vQ.y,fh=vQ.z,sd=vQ.w;
  vec2 cell=vec2(floor(t.x/cw),floor(t.y/fh));
  vec2 f=vec2(t.x-(cell.x+.5)*cw,t.y-cell.y*fh);
  float wh=min(fh*.58,ww*1.85),sill=fh*.26,cy=sill+wh*.5;
  float r=h2(cell+sd*1.31),r2=h2(cell*1.7+sd);
  vec3 c=wall;
  // string course at each floor
  float sc=inBox(vec2(.0,abs(f.y-.12)-.1),fw);
  c=mix(c,wall*1.12,sc*.7);
  // stone/stucco surround and sill
  vec2 d=vec2(abs(f.x)-ww*.5,abs(f.y-cy)-wh*.5);
  float fr=inBox(d-.13,fw), win=inBox(d,fw);
  float sl=inBox(vec2(abs(f.x)-ww*.5-.2,abs(f.y-sill+.07)-.07),fw);
  vec3 surr=mix(vec3(.88,.84,.76),wall*1.25,.35);
  c=mix(c,surr,max(fr,sl));
  hgt+=max(fr,sl)*.35;
  vec3 shc=mix(vec3(.16,.27,.17),vec3(.3,.2,.12),step(.62,fract(sd*.37)));
  shc=mix(shc,vec3(.36,.38,.32),step(.88,fract(sd*.37)));
  bool lit=r2<.3;
  bool closed=r<.42;
  if(!closed){
    // open: shutter leaves folded against the wall either side
    float slat=mix(.55+.45*smoothstep(.2,.8,fract(f.y/.055)),.78,smoothstep(.008,.025,fw));
    vec2 dl=vec2(abs(abs(f.x)-ww*.75-.13)-ww*.25,abs(f.y-cy)-wh*.5);
    float lv=inBox(dl,fw)*step(r,.88);
    c=mix(c,lin(shc)*slat,lv);hgt+=lv*.25;
  }
  if(win>.001){
    // the opening is a real recess: trace into it
    vec2 hs=vec2(ww*.5,wh*.5);int face;
    vec3 h=recess(vec2(f.x,f.y-cy),hs,closed?.12:.2,face);
    vec3 inner;float wsh=1.;
    if(face==0){
      wsh=recessSun(h,hs);
      vec2 b=h.xy;
      if(closed){
        float slat=mix(.55+.45*smoothstep(.2,.8,fract(b.y/.055)),.78,smoothstep(.008,.025,fw));
        inner=lin(shc)*slat*(.9+.2*h2(cell+3.));
        inner*=1.-.5*inBox(vec2(abs(b.x)-.015,abs(b.y)-hs.y),fw);
        if(lit)emi+=win*LAMPC*.05*(1.-slat)*uNight;
      }else{
        float frame=1.-inBox(vec2(abs(b.x)-hs.x+.06,abs(b.y)-hs.y+.06),fw);
        float mull=clamp(inBox(vec2(abs(b.x)-.028,abs(b.y)-hs.y),fw)+inBox(vec2(abs(b.x)-hs.x,abs(b.y-wh*.12)-.028),fw)+frame,0.,1.);
        inner=mix(vec3(.012,.013,.015),vec3(.78,.75,.68),mull);
        // the room behind the glass
        vec3 rc=room(vec3(b.x,b.y+cy,0.),gRd,vec2(cw,fh-.1),3.8,cell.x*7.3+cell.y*3.1+sd,false);
        float curtain=step(.55,h2(cell+5.))*(.55+.25*sin(b.x*40.));
        rc=mix(rc,vec3(.85,.82,.75),curtain*.6);
        float day=dot(uSky,vec3(.3,.5,.2))*.55+max(uSun.y,0.)*.2;
        float lamp=lit?uNight*(1.4+h2(cell+11.))*(1.-.4*clamp(abs(b.x)/hs.x,0.,1.)):0.;
        emi+=win*(1.-mull)*rc*(day+lamp*LAMPC);
        spec=mix(spec,1.,win*(1.-mull));
      }
    }else{
      wsh=revealLight(face,h,hs);
      inner=surr*.85;
    }
    c=mix(c,inner*.9,win);
    gSh=mix(gSh,wsh,win);
    hgt=mix(hgt,.3,win);
  }
  // geraniums in a box on some sills
  if(h2(cell+17.3)<.22&&!closed){
    vec2 q=vec2(f.x,f.y-sill);
    float pot=inBox(vec2(abs(q.x)-ww*.5-.05,abs(q.y-.09)-.09),fw);
    float leaf=smoothstep(.55,.4,vn(q*vec2(14.,18.)+cell*5.))*step(abs(q.x),ww*.5+.08)*step(.15,q.y)*step(q.y,.18+.2*vn(vec2(q.x*9.,cell.x)));
    float fl=step(.72,vn(q*28.+cell*3.))*leaf;
    vec3 fc=h2(cell+19.)<.5?vec3(.75,.06,.08):vec3(.85,.3,.5);
    c=mix(c,lin(vec3(.55,.28,.18)),pot);c=mix(c,mix(vec3(.05,.14,.03),lin(fc),fl),leaf*(1.-pot));
    hgt+=pot*.3+leaf*.4;
  }
  return c;
}

// shop fronts and doors on the ground floor
vec3 shops(vec2 t,vec3 wall,float fw,inout float hgt,inout float spec,inout vec3 emi){
  float cw=vQ.x,gh=vQ.z,sd=vQ.w;
  float id=floor(t.x/cw);float fx=t.x-(id+.5)*cw;
  float r=h2(vec2(id,sd)),r2=h2(vec2(sd,id+4.));
  float ow=min(cw*.62,2.6),oh=min(gh-1.,3.1);
  vec2 d=vec2(abs(fx)-ow*.5,abs(t.y-oh*.5)-oh*.5);
  float o=inBox(d,fw),fr=inBox(d-.12,fw);
  vec3 c=mix(wall,wall*.8,fr);
  if(o<.001)return c;
  vec2 hs=vec2(ow*.5,oh*.5);int face;
  vec3 h=recess(vec2(fx,t.y-oh*.5),hs,.28,face);
  vec3 g;float wsh=1.;
  if(face!=0){g=wall*.75;wsh=revealLight(face,h,hs);}
  else{
    wsh=recessSun(h,hs);vec2 b=h.xy;float by=b.y+oh*.5;
    if(r<.18){ // roller shutter, closed
      g=vec3(.32,.33,.34)*mix(.75+.25*smoothstep(.3,.7,fract(by/.09)),.87,smoothstep(.01,.03,fw));
    }else if(r<.35){ // big wooden door
      g=lin(vec3(.36,.22,.12))*(.8+.2*smoothstep(.0,.2,fract(b.x/.22)));
      g*=1.-.5*inBox(vec2(abs(b.x)-.02,abs(b.y)-hs.y),fw);
    }else{ // shop window and the shop behind it
      float mull=clamp(inBox(vec2(abs(b.x)-.04,abs(b.y)-hs.y),fw)+inBox(vec2(abs(b.x)-hs.x,abs(by-.45)-.45),fw)+1.-inBox(vec2(abs(b.x)-hs.x+.05,abs(b.y)-hs.y+.05),fw),0.,1.);
      g=mix(vec3(.012,.012,.014),lin(vec3(.2,.17,.14)),mull);
      vec3 rc=room(vec3(b.x,by,0.),gRd,vec2(ow+1.,oh+.4),5.,id*5.1+sd,true);
      float open=r2<.7?1.:.12;
      emi+=o*(1.-mull)*rc*LAMPC*(.45+1.1*uNight)*open*1.3;
      spec=mix(spec,1.,o*(1.-mull));
    }
  }
  gSh=mix(gSh,wsh,o);
  hgt=mix(hgt,.3,o);
  return mix(c,g,o);
}

vec3 stone(vec2 t,float fw,inout float hgt){
  float rh=.42+.2*h1(floor(t.y/.62)*3.3),r=floor(t.y/rh),rr=h1(r*1.71+3.1);
  float bl=.9+rr*1.1,x=t.x/bl+rr*13.7,cx=floor(x);
  vec2 f=vec2(fract(x)*bl,fract(t.y/rh)*rh);
  float e=min(min(f.x,bl-f.x),min(f.y,rh-f.y));
  float m=smoothstep(.004,.01+fw*1.5,e);
  float id=h2(vec2(cx,r));
  vec3 c=vec3(.84,.8,.72);
  c=mix(c,vec3(.88,.86,.82),step(.45,id));
  c=mix(c,vec3(.78,.73,.64),step(.8,id));
  c=mix(c,vec3(.86,.76,.66),step(.92,id));
  float n=fbm(t*vec2(1.2,1.8)+id*9.);
  c*=(.88+.2*n)*(.96+.08*h2(vec2(cx,r)+7.));
  float fade=smoothstep(.025,.12,fw);
  hgt+=mix(m*(.7+.3*n),.6,fade);
  return mix(c*mix(.78,1.,m),c*.97,fade)*.9;
}

vec3 tiles(vec2 t,float fw,inout float hgt){
  float x=t.x/.2,row=floor(t.y/.4),ix=floor(x),fx=fract(x),fy=fract(t.y/.4);
  float cap=mod(ix,2.);
  float prof=sin(fx*3.14159);
  float id=h2(vec2(ix,row)+vQ.w*31.);
  vec3 c=mix(vec3(.6,.3,.17),vec3(.7,.42,.26),id);
  c=mix(c,vec3(.48,.26,.17),step(.8,h2(vec2(ix*3.,row)+vQ.w)));
  c*=.75+.35*fbm(t*.35+vQ.w*20.);
  c=mix(c,vec3(.42,.42,.32),smoothstep(.62,.8,fbm(t*.8+vQ.w*7.))*.6); // lichen
  float sh=mix(.55,1.,smoothstep(0.,.3,fy))*mix(.75,1.,cap);
  float fade=smoothstep(.015,.07,fw);
  hgt+=mix(prof*mix(.4,1.,cap)+fy*.2,.5,fade);
  return c*mix(sh*(.75+.25*prof),.82,fade);
}

vec3 setts(vec2 t,float fw,inout float hgt,float sz){
  float r=floor(t.y/sz),x=t.x/sz+h1(r)*.7,cx=floor(x);
  vec2 f=vec2(fract(x),fract(t.y/sz));
  float e=min(min(f.x,1.-f.x),min(f.y,1.-f.y));
  float m=smoothstep(.03,.1+fw*2./sz,e);
  float id=h2(vec2(cx,r));
  vec3 c=mix(vec3(.36,.31,.29),vec3(.47,.41,.37),id);
  c=mix(c,vec3(.3,.29,.3),step(.78,id));
  c*=.85+.3*vn(t*1.3);
  float fade=smoothstep(.015,.06,fw);
  hgt+=mix(m*(.5+.5*sin(f.x*3.14)*sin(f.y*3.14)),.5,fade);
  return mix(c*mix(.45,1.,m),c*.85,fade);
}

vec3 slabs(vec2 t,float fw,inout float hgt){
  float r=floor(t.y/.7),x=t.x/1.15+mod(r,2.)*.5,cx=floor(x);
  vec2 f=vec2(fract(x)*1.15,fract(t.y/.7)*.7);
  float e=min(min(f.x,1.15-f.x),min(f.y,.7-f.y));
  float m=smoothstep(.005,.012+fw*1.5,e);
  float id=h2(vec2(cx,r));
  vec3 c=mix(vec3(.66,.6,.52),vec3(.76,.69,.6),id);
  c=mix(c,vec3(.68,.57,.5),step(.88,id));
  // bands of darker stone every few metres
  float band=inBox(vec2(.0,abs(fract(t.x/9.)-.5)*9.-.3),fw);
  c=mix(c,vec3(.5,.46,.42),band*.7);
  c*=.88+.2*fbm(t*.8);
  float fade=smoothstep(.02,.09,fw);
  hgt+=mix(m,.9,fade)*.6;
  return mix(c*mix(.7,1.,m),c*.96,fade);
}

void main(){
  int mat=int(vM.x+.5);
  if(mat==21){float d=length(vT);if(d>1.)discard;oC=vec4(vec3(mix(.4,1.,smoothstep(.1,1.,d))),1.);return;}
  vec2 t=vT;
  vec2 dt=fwidth(t);float fw=max(dt.x,dt.y);
  vec3 Nn=normalize(vN);vec3 V=uCam-vP;float dist=length(V);V/=dist;
  if(dot(Nn,V)<0.)Nn=-Nn;
  // tangent frame of the surface (x = direction of increasing u) for the window recesses
  vec3 dpx=dFdx(vP),dpy=dFdy(vP);vec2 dtx=dFdx(t),dty=dFdy(t);
  vec3 Tg=(dpx*dty.y-dpy*dtx.y)*sign(dtx.x*dty.y-dtx.y*dty.x);
  Tg=normalize(Tg-Nn*dot(Tg,Nn)+1e-6);vec3 Bg=cross(Nn,Tg);if(Bg.y<0.)Bg=-Bg;
  gRd=vec3(dot(-V,Tg),dot(-V,Bg),dot(-V,Nn));gLt=vec3(dot(uSun,Tg),dot(uSun,Bg),dot(uSun,Nn));
  vec3 a=lin(vC),emi=vec3(0);float hgt=0.,spec=.0,rough=.4,bump=.6;
  vec3 wall=a;
  if(mat==0||mat==1||mat==2){
    float n=fbm(t*.6+vQ.w),n2=vn(t*7.);
    wall=a*(.82+.3*n)*(.95+.08*n2);
    float peel=smoothstep(.68,.73,fbm(t*.45+vQ.w*3.+7.))*(1.-smoothstep(1.,4.,vP.y));
    wall=mix(wall,lin(brick(t)),peel);
    hgt=n2*.25-peel*.4;
    a=wall;
    if(mat==1)a=windows(t,wall,fw,hgt,spec,emi);
    if(mat==2)a=shops(t,wall,fw,hgt,spec,emi);
    bump=.5;
  }else if(mat==3){a=lin(stone(t,fw,hgt));bump=.9;}
  else if(mat==4){
    float v=fbm(t*vec2(3.,1.5));float vein=smoothstep(.02,.0,abs(fbm(t*2.+v*3.)-.5));
    a=lin(vC*(.9+.15*v))*(1.-.25*vein);spec=.35;hgt=v*.2;bump=.3;
  }
  else if(mat==5)a=lin(brick(t));
  else if(mat==6){a=lin(tiles(t,fw,hgt));bump=1.;}
  else if(mat==7){
    float seam=inBox(vec2(abs(fract(t.x/.62)-.5)*.62-.025,0.),fw);
    a=vec3(.18,.19,.2)*(.75+.45*fbm(t*.5))*mix(1.,1.25,seam);a=mix(a,vec3(.2,.21,.17),fbm(t*2.)*.4);
    hgt=seam;spec=.25;bump=.8;
  }
  else if(mat==8){a=lin(setts(t,fw,hgt,.12));bump=1.;}
  else if(mat==9){a=lin(slabs(t,fw,hgt));bump=.6;spec=.07+.08*smoothstep(.5,.8,fbm(t*.15));}
  else if(mat==10){a=vec3(.012,.011,.01);}
  else if(mat==11){float pl=smoothstep(.0,.08,fract(t.x/.16))*.3+.7;a=lin(vC)*pl*(.8+.3*vn(vec2(t.x*20.,t.y*.6)));hgt=pl;}
  else if(mat==12){ // rose window
    float r=length(t);if(r>1.)discard;
    float an=atan(t.y,t.x)/6.28318+.5;float sc=fract(an*16.);
    float spoke=smoothstep(.035,.02,abs(sc-.5)*6.28318/16.*r)*step(.22,r)*step(r,.84);
    vec2 q=vec2((sc-.5)*6.28318/16.*.84,r-.74);float arc=smoothstep(.012,.0,abs(length(q)-.07))*step(.74,r);
    float ring=step(.92,r)+step(abs(r-.84),.025)+step(r,.22)+step(abs(r-.5),.012);
    float st=clamp(spoke+ring+arc,0.,1.);
    vec3 glass=vec3(.02,.025,.035)+vec3(.04,.02,.06)*vn(t*12.);
    a=mix(glass,lin(vec3(.88,.84,.76)),st);spec=1.-st;hgt=st;emi+=(1.-st)*uNight*vec3(.9,.5,.25)*.5;
  }
  else if(mat==13){ // clock face
    float r=length(t);if(r>1.)discard;
    vec3 dial=lin(vec3(.12,.2,.42));
    float tick=0.;float an=atan(t.x,t.y);float s=fract(an/6.28318*12.+.5)-.5;
    tick=smoothstep(.06,.03,abs(s))*step(.74,r)*step(r,.9);
    float ring=step(.93,r)+step(abs(r-.7),.012);
    vec2 hd=vec2(sin(uClock.x),cos(uClock.x)),md=vec2(sin(uClock.y),cos(uClock.y));
    float hh=step(abs(dot(t,vec2(hd.y,-hd.x))),.045)*step(-.08,dot(t,hd))*step(dot(t,hd),.48);
    float mh=step(abs(dot(t,vec2(md.y,-md.x))),.028)*step(-.1,dot(t,md))*step(dot(t,md),.78);
    float gold=clamp(tick+ring+hh+mh+step(r,.05),0.,1.);
    a=mix(dial,lin(vec3(.85,.65,.3)),gold);spec=gold*.6;emi+=uNight*a*.6;
  }
  else if(mat==14){a=lin(vC);spec=.5;}
  else if(mat==15){a=lin(vC);emi+=LAMPC*(.15+uNight*7.);}
  else if(mat==16){
    vec2 q=vec2(t.x+t.y,t.x-t.y)/.56;vec2 cq=floor(q);float ch=mod(cq.x+cq.y,2.);
    a=mix(lin(vec3(.72,.54,.47)),lin(vec3(.84,.79,.71)),ch)*(.85+.25*vn(t*3.));
    vec2 fq=fract(q);float e=min(min(fq.x,1.-fq.x),min(fq.y,1.-fq.y));hgt=smoothstep(.0,.04+fw,e);spec=.5;bump=.3;
  }
  else if(mat==17){a=vec3(.08,.08,.09);}
  else if(mat==20){a=lin(vC)*(.85+.3*vn(vP.xz*40.+vP.y*25.));spec=.04;}
  else if(mat==18){ // carved reliefs
    float cell=floor(t.x/.6);vec2 f=vec2(fract(t.x/.6)-.5,t.y);
    float fig=smoothstep(.55,.45,length(vec2(f.x*2.4,(f.y-3.9)*2.))+fbm(vec2(t.x*5.,t.y*5.)+cell)*.5);
    fig=max(fig,smoothstep(.12,.08,abs(f.x+.15*sin(t.y*4.+cell)))*step(3.25,f.y)*step(f.y,3.9));
    a=lin(vC)*(.6+.4*fig);hgt=fig;bump=1.5;
  }
  // weathering on the old stone and plaster: grime at the base, rain streaks below cornices
  if(mat<=5||mat==18){
    float base=1.-smoothstep(.0,2.2,vP.y);
    float streak=smoothstep(.55,.9,vn(vec2(t.x*1.6,vP.y*.07+t.x*.1)))*.3;
    a*=1.-.35*base-streak*(mat==3?.6:.4);
  }

  // bump mapping from the screen-space slope of the height field
  float hw=hgt*.018*bump*(1.-smoothstep(.015,.06,fw));
  float hx=dFdx(hw),hy=dFdy(hw);
  vec3 r1=cross(dpy,Nn),r2=cross(Nn,dpx);float det=dot(dpx,r1);
  vec3 N=abs(det)*Nn-sign(det)*(hx*r1+hy*r2);
  N=dot(N,N)>1e-20?normalize(N):Nn;
  if(dot(N,Nn)<.2)N=Nn;

  // sun shadow: a sharp map around the viewer, a coarse one for the whole town
  vec4 sn=uShM2*vec4(vP+Nn*uShW.y*1.6+uSun*uShW.y,1.);sn.xyz=sn.xyz*.5+.5;
  vec2 en=abs(sn.xy-.5);float fade=smoothstep(.4,.47,max(en.x,en.y));
  float shN=1.,shF=1.;
  if(fade<1.){
    shN=0.;
    for(int i=0;i<12;i++)shN+=texture(uSh2,vec3(sn.xy+PD[i]*uShT2*2.2,sn.z-.00002));
    shN/=12.;
  }
  if(fade>0.){
    vec4 sp=uShM*vec4(vP+Nn*(uShW.x*1.5+dist*.0006)+uSun*uShW.x,1.);sp.xyz=sp.xyz*.5+.5;
    shF=0.;
    for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)shF+=texture(uSh,vec3(sp.xy+vec2(x,y)*uShT,sp.z-.00004));
    shF/=9.;
    if(any(greaterThan(abs(sp.xy-.5),vec2(.5))))shF=1.;
  }
  float sh=mix(shN,shF,fade)*gSh;
  // ambient occlusion from the blurred building footprints
  vec4 ao4=texture(uAO,(vP.xz+170.)/340.);
  float ao=vM.y*(1.-.6*ao4.r*(1.-smoothstep(.0,3.,vP.y)));
  ao*=clamp(1.-(ao4.g*90.-vP.y)/30.,.45,1.);
  if(abs(Nn.y)<.5)ao*=mix(.7,1.,smoothstep(.0,1.8,vP.y));
  ao*=.8+.2*clamp(hgt*1.3,0.,1.);

  float ndl=max(dot(N,uSun),0.);
  vec3 amb=mix(uGnd,mix(uSky,uHor,.35),.5+.5*N.y);
  vec3 col=a*(uSunC*ndl*sh+amb*ao);
  // bounce light from the sunlit ground and walls
  col+=a*uSunC*.06*max(-N.y*.5+.5,0.)*ao*max(uSun.y,0.);
  // sun highlight and sky reflection on glass and polished stone
  vec3 H=normalize(uSun+V);float fres=pow(1.-max(dot(N,V),0.),5.);
  col+=uSunC*spec*pow(max(dot(N,H),0.),mix(40.,300.,spec))*sh*ndl*.6;
  vec3 R=reflect(-V,N);
  col+=spec*(.04+.5*fres)*mix(uHor,uSky,clamp(R.y*2.,0.,1.))*ao;
  // street lamps
  for(int i=0;i<24;i++){
    if(i>=uNL)break;
    vec3 Lp=uL[i].xyz-vP;float d2=dot(Lp,Lp);vec3 Ld=Lp*inversesqrt(d2);
    float att=uL[i].w*smoothstep(400.,100.,d2)/(.4+d2*.5);
    col+=a*LAMPC*att*(max(dot(N,Ld),0.)*.85+.15);
  }
  // floodlights on the cathedral and the tower at night
  if((mat==3||mat==4||mat==18)&&uNight>0.)col+=a*uNight*vec3(1.,.72,.42)*(.35+.25*max(N.y,0.)+.4*abs(N.x))*exp(-max(vP.y,0.)/45.)*ao*1.6;
  col+=emi;
  // aerial perspective
  vec3 vd=-V;
  float f=1.-exp(-dist*uFog*(.6+.6*exp(-max(vP.y,0.)*.04)));
  vec3 fc=uHor+uSunC*.18*pow(max(dot(vd,uSun),0.),6.)*(1.-uNight);
  col=mix(col,fc,f);
  oC=vec4(col*uExpo,1.);
  oN=vec4(normalize(mat3(uV)*N),-(uV*vec4(vP,1.)).z);
}`;

const VS_SHADOW = /*glsl*/`#version 300 es
layout(location=0) in vec3 aP; uniform mat4 uVP; void main(){gl_Position=uVP*vec4(aP,1.);}`;
const FS_SHADOW = /*glsl*/`#version 300 es
precision mediump float; out vec4 o; void main(){o=vec4(1);}`;

// full-screen triangle
const VS_FS = /*glsl*/`#version 300 es
out vec2 vU; void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vU=p;gl_Position=vec4(p*2.-1.,1.,1.);}`;

const FS_SKY = /*glsl*/`#version 300 es
precision highp float;
in vec2 vU; uniform mat4 uIVP; uniform vec3 uSun,uSunC,uSky,uHor,uGnd,uMoon; uniform float uTime,uNight,uExpo;
layout(location=0) out vec4 oC; layout(location=1) out vec4 oN;
${GLSL_COMMON}
void main(){
  vec4 w=uIVP*vec4(vU*2.-1.,1.,1.);vec3 d=normalize(w.xyz/w.w);
  float y=max(d.y,0.);
  vec3 c=mix(uHor,uSky,pow(y,.42));
  float mu=max(dot(d,uSun),0.);
  c+=uSunC*(.07*pow(mu,5.)+.35*pow(mu,48.))*(1.-uNight);
  c+=uSunC*smoothstep(.99955,.9998,mu)*30.*(1.-uNight);
  // clouds on a flat layer high above
  if(d.y>0.){
    vec2 p=d.xz/(d.y+.08)*.9+vec2(uTime*.003,uTime*.0012);
    float n=fbm(p*1.1)+.5*fbm(p*3.3+3.);
    float cov=smoothstep(.72,1.15,n);
    float lit=.6+.4*smoothstep(.6,1.3,fbm(p*1.1+uSun.xz*.08));
    vec3 cc=mix(uHor*.85,uHor*.7+uSunC*.55,lit)+uSunC*.3*pow(mu,6.);
    cc=mix(cc,uHor*.35+vec3(.02,.02,.03),uNight);
    c=mix(c,cc,cov*smoothstep(.0,.12,d.y)*.92);
  }
  // stars and moon
  if(uNight>0.){
    vec3 q=floor(d*320.);float s=h2(q.xy+q.z*17.);
    c+=uNight*step(.9985,s)*vec3(.6,.7,.9)*2.*smoothstep(.0,.2,d.y);
    float mm=dot(d,uMoon);c+=uNight*smoothstep(.9996,.9998,mm)*vec3(1.,.97,.9)*6.;
    c+=uNight*vec3(.05,.07,.12)*pow(max(mm,0.),30.);
  }
  if(d.y<0.)c=mix(uHor,uGnd*.6,smoothstep(.0,-.25,d.y));
  oC=vec4(c*uExpo,1.);oN=vec4(0,0,1,6e4);
}`;

// bloom: bright-pass + downsample, then upsample with a tent filter
const FS_DOWN = /*glsl*/`#version 300 es
precision highp float; in vec2 vU; uniform sampler2D uT; uniform vec2 uPx; uniform float uThr; out vec4 o;
void main(){vec3 c=texture(uT,vU+uPx*vec2(-1,-1)).rgb+texture(uT,vU+uPx*vec2(1,-1)).rgb+texture(uT,vU+uPx*vec2(-1,1)).rgb+texture(uT,vU+uPx*vec2(1,1)).rgb;
c*=.25;if(uThr>0.){float l=max(max(c.r,c.g),c.b);c*=max(l-uThr,0.)/max(l,1e-4);}o=vec4(min(c,vec3(60.)),1);}`;
const FS_UP = /*glsl*/`#version 300 es
precision highp float; in vec2 vU; uniform sampler2D uT; uniform vec2 uPx; out vec4 o;
void main(){vec3 c=vec3(0);for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)c+=texture(uT,vU+uPx*vec2(x,y)).rgb*(x==0?2.:1.)*(y==0?2.:1.);o=vec4(c/16.,1);}`;
// screen-space ambient occlusion from the view-space normals and depth
const FS_SSAO = /*glsl*/`#version 300 es
precision highp float; in vec2 vU; uniform sampler2D uN; uniform vec2 uF; uniform vec3 uK[12]; out vec4 o;
void main(){
  vec4 nd=texture(uN,vU);float d=nd.w;if(d>4e4){o=vec4(1);return;}
  vec3 p=vec3((vU*2.-1.)/uF*d,-d),n=normalize(nd.xyz);
  float an=6.2832*fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
  vec3 rv=vec3(cos(an),sin(an),0.),tg=normalize(rv-n*dot(rv,n)),bt=cross(n,tg);
  float R=.8+d*.012,occ=0.;
  for(int i=0;i<12;i++){
    vec3 s=p+(tg*uK[i].x+bt*uK[i].y+n*uK[i].z)*R;
    vec2 su=(s.xy/-s.z)*uF*.5+.5;float sd=texture(uN,su).w;
    occ+=step(sd,-s.z-.02-d*.002)*smoothstep(0.,1.,R/abs(d-sd));
  }
  o=vec4(1.-occ/12.);
}`;
const FS_BLUR = /*glsl*/`#version 300 es
precision highp float; in vec2 vU; uniform sampler2D uT,uN; uniform vec2 uPx; out vec4 o;
void main(){float d0=texture(uN,vU).w,s=0.,w=0.;
  for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){vec2 u=vU+vec2(x,y)*uPx;float dd=texture(uN,u).w;float k=1./(1.+abs(dd-d0)*8./max(d0,1.)*20.);s+=texture(uT,u).r*k;w+=k;}
  o=vec4(s/w);}`;
// light shafts: march from each pixel towards the sun through the sky mask
const FS_RAYS = /*glsl*/`#version 300 es
precision highp float; in vec2 vU; uniform sampler2D uN; uniform vec2 uSunUV; uniform float uAsp; out vec4 o;
void main(){
  vec2 dl=(uSunUV-vU)/36.;vec2 uv=vU+dl*fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
  float acc=0.,w=1.;
  for(int i=0;i<36;i++){uv+=dl;vec2 c=clamp(uv,0.,1.);acc+=step(4e4,texture(uN,c).w)*w;w*=.965;}
  float fall=exp(-length((vU-uSunUV)*vec2(uAsp,1.))*1.8);
  o=vec4(acc/36.*fall);
}`;
const FS_COMP = /*glsl*/`#version 300 es
precision highp float; in vec2 vU; uniform sampler2D uT,uB,uA,uR; uniform float uBloom,uTime,uScale,uAOn; uniform vec3 uRayC; out vec4 o;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){
  float ao=mix(1.,texture(uA,vU).r,uAOn);
  vec3 c=texture(uT,vU).rgb*uScale*mix(.22,1.,ao)+texture(uB,vU).rgb*uScale*uBloom;
  c+=uRayC*texture(uR,vU).r;
  c=aces(c*1.05);
  c=pow(c,vec3(1./2.2));
  // grade: a touch more saturation and contrast, warm highlights, cooler shadows
  float l=dot(c,vec3(.2126,.7152,.0722));
  c=mix(vec3(l),c,1.12);
  c=mix(c*vec3(.96,.99,1.05),c*vec3(1.04,1.,.94),smoothstep(.2,.8,l));
  c=mix(c,smoothstep(0.,1.,c),.25);
  vec2 q=vU-.5;c*=1.-.35*dot(q,q)*1.6;
  c+=(fract(sin(dot(gl_FragCoord.xy+uTime,vec2(12.9898,78.233)))*43758.5453)-.5)/255.;
  o=vec4(c,1);
}`;
